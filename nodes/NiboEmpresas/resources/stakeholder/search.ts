import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * How many of each collection one page holds.
 *
 * Not the API's cap of 500 — that is what a scan uses. This is a dropdown, and
 * a hundred names is already more than anyone reads before typing. The editor
 * asks for more by handing back the token it was given, so a page is a page and
 * never a truncation.
 */
const PAGE_SIZE = 100;

/**
 * Which contacts a schedule of each kind will take.
 *
 * Measured on the cobaia on 2026-07-26, the whole matrix, creating for real and
 * deleting each one: a credit schedule takes a customer or a partner, a debit
 * takes a supplier, an employee or a partner, and every other pairing answers
 * HTTP 500 `Stakeholder is not compatible`.
 *
 * The partner is on both sides, and that is not an oddity: capital is put in and
 * drawn out, so a sócio both receives and pays. It is Nibo's rule, which is what
 * makes it right for the list to follow it — the same reason the category list
 * shows only the half that fits.
 */
const STAKEHOLDERS_OF: Record<string, Array<{ endpoint: string; kind: string }>> = {
	creditSchedule: [
		{ endpoint: '/customers', kind: 'Customer' },
		{ endpoint: '/partners', kind: 'Partner' },
	],
	debitSchedule: [
		{ endpoint: '/suppliers', kind: 'Supplier' },
		{ endpoint: '/employees', kind: 'Employee' },
		{ endpoint: '/partners', kind: 'Partner' },
	],
};

/**
 * How far into each collection the search has walked. `null` is a collection
 * that has run out — asking it again would only cost a call to learn nothing.
 */
type Walked = Array<number | null>;

/**
 * The search behind the Stakeholder field of a schedule.
 *
 * A search rather than a list, and that is the whole point: categories are 22
 * and can be handed over whole, while the contract records an organization with
 * 14,194 customers. Loading that would be 28 calls to open a field, and capping
 * it would hide the very contact somebody is looking for. So what is typed goes
 * to the server, and what comes back is one page with a way to ask for the next.
 *
 * Every collection is asked on every page, rather than one collection at a time.
 * A credit schedule takes customers and partners, and there are thousands of the
 * first and a handful of the second — walking them in turn would bury the
 * partners behind fourteen thousand customers, where nobody would ever scroll to
 * find them.
 *
 * Like the category list, it talks to the API on its own: `ILoadOptionsFunctions`
 * has no item index to hand the transport, and this only ever runs in the mode
 * where a credential exists.
 */
export async function searchScheduleStakeholders(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'The contact list cannot be searched when the token is read per item',
			{
				description:
					'A contact ID belongs to one organization, so a contact picked here would be right for one of them and wrong for every other one this node walks. Switch this field to "By ID" and put an expression there, reading the ID from the incoming item.',
			},
		);
	}

	const resource = String(this.getCurrentNodeParameter('resource') ?? '');
	const collections = STAKEHOLDERS_OF[resource];
	if (collections === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`The resource "${resource}" has no contact list — this search belongs to a schedule`,
			{
				description:
					'Credit Schedule and Debit Schedule are the resources that name a contact, and this is the search behind that field.',
			},
		);
	}

	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const search = searchExpression(filter);

	const walked = walkedSoFar(paginationToken, collections.length);
	const results: INodeListSearchItems[] = [];
	const next: Walked = [];

	for (const [index, collection] of collections.entries()) {
		const skip = walked[index];
		if (skip === null) {
			next.push(null);
			continue;
		}

		// `id` is the key measured to be unique across the four collections, and
		// the API answers 500 to a `$skip` without an `$orderby` — so it is always
		// sent, and it is what keeps two pages from overlapping.
		const qs: IDataObject = { $orderby: 'id', $top: PAGE_SIZE };
		if (skip > 0) {
			qs.$skip = skip;
		}
		if (search !== undefined) {
			qs.$filter = search;
		}

		const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
			method: 'GET',
			url: `${baseUrl}${collection.endpoint}`,
			qs,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json; charset=utf-8',
			},
			json: true,
		});

		// Detect the envelope by shape, never by the name of the collection —
		// /employees and /partners answer a bare array while /customers and
		// /suppliers answer an envelope, which was learned the hard way in 0.4.4.
		const records = (
			Array.isArray(response) ? response : ((response as IDataObject)?.items ?? [])
		) as IDataObject[];

		for (const record of records) {
			results.push({
				// "ACME LTDA" alone does not say whether it is a customer or a
				// partner, and on a credit schedule both are on this list.
				name: `${String(record.name ?? '').trim()} · ${collection.kind}`,
				value: String(record.id ?? ''),
			});
		}

		// A page shorter than asked for is the end of that collection: there is no
		// "has more" flag to read.
		next.push(records.length < PAGE_SIZE ? null : skip + records.length);
	}

	return next.every((skip) => skip === null)
		? { results }
		: { results, paginationToken: JSON.stringify(next) };
}

/**
 * What was typed, as the expression the API takes — or nothing at all.
 *
 * The same one the assisted filter writes, escaped the same way: an apostrophe
 * typed raw closes the literal early and the API answers HTTP 500 with nothing
 * in it pointing at the quote. That defect is what the whole 0.5.0 line was
 * about, and a search box is one more door into it.
 */
function searchExpression(filter?: string): string | undefined {
	const typed = (filter ?? '').trim();

	return typed === ''
		? undefined
		: `contains(tolower(name),'${typed.toLowerCase().replace(/'/g, "''")}')`;
}

/** Where each collection stopped, from the token the editor handed back */
function walkedSoFar(paginationToken: string | undefined, collections: number): Walked {
	const fresh: Walked = Array.from({ length: collections }, () => 0);

	if (paginationToken === undefined || paginationToken === '') {
		return fresh;
	}

	try {
		const walked = JSON.parse(paginationToken) as Walked;

		return Array.isArray(walked) && walked.length === collections ? walked : fresh;
	} catch {
		// A token this version cannot read is a token from another one. Starting
		// over hands back the first page, which is wrong by no more than a scroll.
		return fresh;
	}
}
