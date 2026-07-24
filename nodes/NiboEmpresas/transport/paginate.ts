import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { niboApiRequest } from './request';

interface INiboListEnvelope {
	items?: IDataObject[];
	count?: number;
}

/**
 * Runs a list (GET) request against a collection endpoint and unwraps the
 * `{ items, count }` envelope into a plain array of records.
 *
 * The sort key is always injected here — never by resource handlers — because
 * the API returns HTTP 500 whenever `$skip` is used without `$orderby`, and a
 * stable, unique key is what makes paging deterministic.
 *
 * v0.1.0 fetches a single page (the API silently caps every page at 500
 * records). Real pagination and "Return All" arrive in v0.2.0 on top of this
 * same function.
 */
export async function niboListRequest(
	this: IExecuteFunctions,
	endpoint: string,
	orderBy: string,
	limit: number,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const query: IDataObject = {
		...qs,
		$orderby: orderBy,
		$top: limit,
	};

	const response = (await niboApiRequest.call(this, 'GET', endpoint, query)) as
		| INiboListEnvelope
		| IDataObject[];

	// Almost every collection wraps records in { items, count }, but not all of
	// them (e.g. /employees returns a bare array). Detect by shape so every list
	// endpoint flows through this same path.
	if (Array.isArray(response)) {
		return response;
	}

	return response.items ?? [];
}
