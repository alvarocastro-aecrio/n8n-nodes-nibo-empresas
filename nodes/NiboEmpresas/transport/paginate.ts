import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { niboApiRequest } from './request';

interface INiboListEnvelope {
	items?: IDataObject[];
	count?: number;
}

export interface INiboListOptions {
	/** Page until the collection is exhausted, ignoring `limit` */
	returnAll: boolean;
	/** Maximum records to collect when `returnAll` is false */
	limit: number;
	/** OData `$filter` expression, as typed by the user */
	filter?: string;
	/** Turn the "possibly incomplete" warning into a hard failure */
	failOnIncomplete?: boolean;
	/** Extra query parameters from the resource handler */
	qs?: IDataObject;
}

export interface INiboListResult {
	records: IDataObject[];
	/** Total on the server, as last reported by the envelope */
	count?: number;
	/** Set when the result may be incomplete — see the drift note below */
	warning?: string;
}

/**
 * Every page is capped at 500 records, silently: `$top=5000` answers HTTP 200
 * with exactly 500 records, no error and no truncation flag. Asking for more
 * in one call is therefore never an option — the only way to read a large
 * collection is to walk it.
 */
const PAGE_SIZE = 500;

/**
 * Runs a list (GET) request against a collection endpoint, walks the pages and
 * unwraps the `{ items, count }` envelope into a plain array of records.
 *
 * The sort key is always injected here — never by resource handlers — because
 * the API returns HTTP 500 whenever `$skip` is used without `$orderby`, and a
 * stable, unique key is what makes paging deterministic. For the four
 * stakeholder collections that key is `id`, measured (not assumed) against a
 * real organization: 500 sampled records, 500 distinct ids, while `name`
 * collided on 2% of them.
 *
 * Paging by `$skip` has one honest limitation: records created while the scan
 * runs land at an arbitrary position in the ordering and can fall behind the
 * point already walked, disappearing without any error. The defense is to
 * compare the server count at the start and at the end of the scan, and to
 * warn when the result may be incomplete instead of handing back a partial
 * list that looks whole.
 *
 * Every page of a scan belongs to one input item, so `itemIndex` travels down
 * to the transport untouched — in the per-item token mode it is what decides
 * whose token the whole scan runs with.
 */
export async function niboListRequest(
	this: IExecuteFunctions,
	itemIndex: number,
	endpoint: string,
	orderBy: string,
	options: INiboListOptions,
): Promise<INiboListResult> {
	const target = options.returnAll ? Number.POSITIVE_INFINITY : Math.max(options.limit, 0);
	const filter = options.filter?.trim();

	const records: IDataObject[] = [];
	let skip = 0;
	let firstCount: number | undefined;
	let lastCount: number | undefined;

	while (records.length < target) {
		const query: IDataObject = {
			...options.qs,
			$orderby: orderBy,
			$top: Math.min(PAGE_SIZE, target - records.length),
		};
		if (skip > 0) {
			query.$skip = skip;
		}
		if (filter) {
			query.$filter = filter;
		}

		const response = (await niboApiRequest.call(this, itemIndex, 'GET', endpoint, query)) as
			| INiboListEnvelope
			| IDataObject[];

		// Almost every collection wraps records in { items, count }, but not all
		// of them (e.g. /employees returns a bare array). Detect by shape so
		// every list endpoint flows through this same path.
		const page = Array.isArray(response) ? response : (response.items ?? []);
		const count = Array.isArray(response) ? undefined : response.count;

		if (firstCount === undefined) {
			firstCount = count;
		}
		if (count !== undefined) {
			lastCount = count;
		}

		records.push(...page);

		// A page shorter than requested is the end of the collection: there is
		// no "has more" flag to read.
		if (page.length < (query.$top as number)) {
			break;
		}
		if (lastCount !== undefined && records.length >= lastCount) {
			break;
		}
		skip += page.length;
	}

	const warning = incompleteWarning(records.length, firstCount, lastCount, options.returnAll);
	if (warning !== undefined) {
		if (options.failOnIncomplete === true) {
			throw new NodeOperationError(this.getNode(), warning);
		}
		this.logger.warn(warning);
	}

	return { records, count: lastCount, warning };
}

function incompleteWarning(
	collected: number,
	firstCount: number | undefined,
	lastCount: number | undefined,
	returnAll: boolean,
): string | undefined {
	if (firstCount === undefined || lastCount === undefined) {
		return undefined;
	}

	if (firstCount !== lastCount) {
		return `Nibo reported ${firstCount} records when this scan started and ${lastCount} when it ended. Records written while paging can slip past the cursor, so this result may be incomplete.`;
	}

	if (returnAll && collected < lastCount) {
		return `Nibo reported ${lastCount} records but only ${collected} arrived, so this result is incomplete.`;
	}

	return undefined;
}
