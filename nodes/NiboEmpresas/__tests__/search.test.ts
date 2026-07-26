import type { IDataObject, ILoadOptionsFunctions, INode } from 'n8n-workflow';

import { searchScheduleStakeholders } from '../resources/stakeholder/search';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** One page of a collection, keyed by the endpoint it comes from */
type Pages = Record<string, IDataObject[]>;

let request: jest.Mock;

/** The editor's context for a search, in the mode that has a credential */
function searchContext(parameters: IDataObject, pages: Pages = {}) {
	request = jest.fn(async (_credential: string, options: IDataObject) => {
		const url = String(options.url ?? '');
		const collection = url.slice(url.lastIndexOf('/'));
		const items = pages[collection] ?? [];

		return { items, count: items.length };
	});

	return {
		getCurrentNodeParameter: (name: string) => parameters[name],
		getNode: () => NODE,
		getCredentials: jest.fn().mockResolvedValue({ baseUrl: '' }),
		helpers: { httpRequestWithAuthentication: request },
	} as unknown as ILoadOptionsFunctions;
}

/** Which collections were asked, in order */
function collectionsAsked(): string[] {
	return request.mock.calls.map((call) => {
		const url = String((call[1] as IDataObject).url ?? '');
		return url.slice(url.lastIndexOf('/'));
	});
}

/** The query string of the nth call */
function querySent(index = 0): IDataObject {
	return (request.mock.calls[index][1] as IDataObject).qs as IDataObject;
}

/**
 * The list behind the Stakeholder field of a schedule.
 *
 * Unlike the category list, this one cannot be loaded whole: the contract
 * records an organization with 14,194 customers. So it is a search — typed in
 * the editor, answered by the server — and the collections it asks are the ones
 * the API accepts for that kind of schedule.
 *
 * Measured on the cobaia on 2026-07-26, the whole matrix: a credit schedule
 * takes a customer or a partner, a debit takes a supplier, an employee or a
 * partner, and anything else answers `Stakeholder is not compatible`.
 */
describe('searchScheduleStakeholders — which collections it asks', () => {
	it.each([
		['creditSchedule', ['/customers', '/partners']],
		['debitSchedule', ['/suppliers', '/employees', '/partners']],
	])('asks %s only the collections the API accepts', async (resource, expected) => {
		await searchScheduleStakeholders.call(searchContext({ authMode: 'credential', resource }));

		expect(collectionsAsked()).toEqual(expected);
	});

	it('refuses a resource that is not a schedule', async () => {
		const failure = searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'customer' }),
		);

		await expect(failure).rejects.toThrow(/schedule/i);
	});

	/**
	 * The same refusal the category list gives, and for the same reason: a
	 * contact ID belongs to one organization, and in the per-item mode there is
	 * no credential to read one with.
	 */
	it('refuses in the per-item token mode, pointing at the expression instead', async () => {
		const failure = searchScheduleStakeholders.call(
			searchContext({ authMode: 'field', resource: 'creditSchedule' }),
		);

		await expect(failure).rejects.toThrow(/per item/i);
		expect(request).not.toHaveBeenCalled();
	});
});

describe('searchScheduleStakeholders — the search itself', () => {
	it('sends no filter when nothing was typed', async () => {
		await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(querySent()).not.toHaveProperty('$filter');
	});

	// Searched on the server, ignoring case — the same expression the assisted
	// filter writes, escaped the same way.
	it('turns what was typed into a server-side search', async () => {
		await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }),
			'ACME',
		);

		expect(querySent().$filter).toBe("contains(tolower(name),'acme')");
	});

	// The defect the whole 0.5.0 line was about: an apostrophe typed raw closes
	// the literal and the API answers 500 with nothing pointing at the quote.
	it('escapes an apostrophe in what was typed', async () => {
		await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }),
			"D'ALESSANDRO",
		);

		expect(querySent().$filter).toBe("contains(tolower(name),'d''alessandro')");
	});

	it('orders by the key that pages, so the pages do not overlap', async () => {
		await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(querySent().$orderby).toBe('id');
	});
});

describe('searchScheduleStakeholders — what it hands back', () => {
	const PAGES: Pages = {
		'/customers': [
			{ id: 'c1', name: 'ACME LTDA' },
			{ id: 'c2', name: 'BETA SA' },
		],
		'/partners': [{ id: 'p1', name: 'ACME HOLDING' }],
	};

	it('names the contact and hands back its ID', async () => {
		const { results } = await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }, PAGES),
		);

		expect(results[0]).toMatchObject({ value: 'c1' });
		expect(results[0].name).toContain('ACME LTDA');
	});

	/**
	 * "ACME LTDA" alone does not say whether it is a customer or a partner, and
	 * both are on this list. The kind is what tells them apart.
	 */
	it('says which kind of contact each one is', async () => {
		const { results } = await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }, PAGES),
		);

		expect(results.find((one) => one.value === 'c1')?.name).toMatch(/customer/i);
		expect(results.find((one) => one.value === 'p1')?.name).toMatch(/partner/i);
	});

	it('brings every collection into one list', async () => {
		const { results } = await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }, PAGES),
		);

		expect(results.map((one) => one.value)).toEqual(['c1', 'c2', 'p1']);
	});

	it('answers an empty list rather than failing when nothing matches', async () => {
		const { results } = await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }, {}),
			'nothing like this',
		);

		expect(results).toEqual([]);
	});

	// A bare array is an answer too — /employees and /partners give one.
	it('reads a collection that answers a bare array', async () => {
		const context = searchContext({ authMode: 'credential', resource: 'debitSchedule' });
		request.mockImplementation(async (_credential: string, options: IDataObject) =>
			String(options.url).endsWith('/employees') ? [{ id: 'e1', name: 'ADA' }] : { items: [], count: 0 },
		);

		const { results } = await searchScheduleStakeholders.call(context);

		expect(results.map((one) => one.value)).toEqual(['e1']);
	});
});

/**
 * Paging, which is the whole reason this is a search and not a list. The editor
 * asks for more by handing back the token it was given.
 */
describe('searchScheduleStakeholders — paging', () => {
	/** A collection with more records than one page holds */
	function fullPage(prefix: string, size: number): IDataObject[] {
		return Array.from({ length: size }, (_, index) => ({
			id: `${prefix}${index}`,
			name: `${prefix} ${index}`,
		}));
	}

	it('offers a token while a collection still has more', async () => {
		const { paginationToken } = await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }, {
				'/customers': fullPage('c', 100),
			}),
		);

		expect(paginationToken).toBeDefined();
	});

	it('continues where it stopped when handed that token back', async () => {
		const context = searchContext({ authMode: 'credential', resource: 'creditSchedule' }, {
			'/customers': fullPage('c', 100),
		});
		const { paginationToken } = await searchScheduleStakeholders.call(context);

		request.mockClear();
		await searchScheduleStakeholders.call(context, undefined, paginationToken as string);

		expect(querySent().$skip).toBe(100);
	});

	it('stops offering a token once everything has been walked', async () => {
		const { paginationToken } = await searchScheduleStakeholders.call(
			searchContext({ authMode: 'credential', resource: 'creditSchedule' }, {
				'/customers': [{ id: 'c1', name: 'ACME' }],
			}),
		);

		expect(paginationToken).toBeUndefined();
	});
});
