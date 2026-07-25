import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';

import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/request');

const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const warn = jest.fn();

const CONTEXT = {
	getNode: () => NODE,
	logger: { warn, info: jest.fn(), error: jest.fn(), debug: jest.fn() },
} as unknown as IExecuteFunctions;

/** A page of `size` records, numbered from `from`, out of `count` on the server */
function page(size: number, from: number, count: number) {
	return {
		items: Array.from({ length: size }, (_, index) => ({ id: `customer-${from + index}` })),
		count,
	};
}

/** The query string of the nth call to the API (itemIndex, method, endpoint, qs) */
function queryOf(callIndex: number): IDataObject {
	return apiRequest.mock.calls[callIndex][3] as IDataObject;
}

beforeEach(() => {
	apiRequest.mockReset();
	warn.mockReset();
});

describe('niboListRequest — envelope', () => {
	it('unwraps { items, count } into plain records', async () => {
		apiRequest.mockResolvedValueOnce(page(3, 1, 3));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: false,
			limit: 50,
		});

		expect(result.records).toEqual([
			{ id: 'customer-1' },
			{ id: 'customer-2' },
			{ id: 'customer-3' },
		]);
		expect(result.count).toBe(3);
	});

	it('accepts the bare array that /employees returns instead of an envelope', async () => {
		apiRequest.mockResolvedValueOnce([{ id: 'employee-1' }, { id: 'employee-2' }]);

		const result = await niboListRequest.call(CONTEXT, 0, '/employees', 'id', {
			returnAll: true,
			limit: 50,
		});

		expect(result.records).toHaveLength(2);
		expect(result.warning).toBeUndefined();
	});

	it('returns nothing when the envelope carries no items', async () => {
		apiRequest.mockResolvedValueOnce({ count: 0 });

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: false,
			limit: 50,
		});

		expect(result.records).toEqual([]);
	});
});

describe('niboListRequest — paging', () => {
	it('always sends the sort key, because $skip without $orderby is an HTTP 500', async () => {
		apiRequest.mockResolvedValueOnce(page(1, 1, 1));

		await niboListRequest.call(CONTEXT, 0, '/customers', 'id', { returnAll: false, limit: 50 });

		expect(queryOf(0).$orderby).toBe('id');
	});

	it('keeps paging with $skip until a short page says the collection ended', async () => {
		apiRequest
			.mockResolvedValueOnce(page(500, 1, 1620))
			.mockResolvedValueOnce(page(500, 501, 1620))
			.mockResolvedValueOnce(page(500, 1001, 1620))
			.mockResolvedValueOnce(page(120, 1501, 1620));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: true,
			limit: 50,
		});

		expect(result.records).toHaveLength(1620);
		expect(apiRequest).toHaveBeenCalledTimes(4);
		expect(queryOf(0).$skip).toBeUndefined();
		expect(queryOf(1).$skip).toBe(500);
		expect(queryOf(2).$skip).toBe(1000);
		expect(queryOf(3).$skip).toBe(1500);
		expect(result.warning).toBeUndefined();
	});

	it('hands the same item index to the transport on every page of the scan', async () => {
		apiRequest.mockResolvedValueOnce(page(500, 1, 600)).mockResolvedValueOnce(page(100, 501, 600));

		await niboListRequest.call(CONTEXT, 7, '/customers', 'id', { returnAll: true, limit: 50 });

		expect(apiRequest.mock.calls.map((call) => call[0])).toEqual([7, 7]);
	});

	it('asks for exactly the limit and stops there when Return All is off', async () => {
		apiRequest.mockResolvedValueOnce(page(5, 1, 14194));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: false,
			limit: 5,
		});

		expect(result.records).toHaveLength(5);
		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(queryOf(0).$top).toBe(5);
	});

	it('pages to reach a limit above the silent 500 cap of $top', async () => {
		apiRequest
			.mockResolvedValueOnce(page(500, 1, 14194))
			.mockResolvedValueOnce(page(200, 501, 14194));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: false,
			limit: 700,
		});

		expect(result.records).toHaveLength(700);
		expect(queryOf(0).$top).toBe(500);
		expect(queryOf(1).$top).toBe(200);
		expect(result.warning).toBeUndefined();
	});
});

describe('niboListRequest — pagination drift', () => {
	it('warns when the server count changes while paging', async () => {
		apiRequest
			.mockResolvedValueOnce(page(500, 1, 600))
			.mockResolvedValueOnce(page(90, 501, 590));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: true,
			limit: 50,
		});

		expect(result.records).toHaveLength(590);
		expect(result.warning).toContain('600');
		expect(result.warning).toContain('590');
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('stays quiet when the count holds steady', async () => {
		apiRequest
			.mockResolvedValueOnce(page(500, 1, 600))
			.mockResolvedValueOnce(page(100, 501, 600));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: true,
			limit: 50,
		});

		expect(result.warning).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
	});

	it('warns when fewer records arrive than the server reported', async () => {
		apiRequest.mockResolvedValueOnce(page(400, 1, 600));

		const result = await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: true,
			limit: 50,
		});

		expect(result.warning).toBeDefined();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('fails instead of warning when the node is set to be strict', async () => {
		apiRequest
			.mockResolvedValueOnce(page(500, 1, 600))
			.mockResolvedValueOnce(page(90, 501, 590));

		await expect(
			niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
				returnAll: true,
				limit: 50,
				failOnIncomplete: true,
			}),
		).rejects.toThrow(/590/);
	});
});

describe('niboListRequest — OData filter', () => {
	it('passes the filter expression through to the API', async () => {
		apiRequest.mockResolvedValueOnce(page(2, 1, 2));

		await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: false,
			limit: 50,
			filter: "contains(name,'SERVIÇOS')",
		});

		expect(queryOf(0).$filter).toBe("contains(name,'SERVIÇOS')");
	});

	it('sends no $filter at all when the field is left empty', async () => {
		apiRequest.mockResolvedValueOnce(page(2, 1, 2));

		await niboListRequest.call(CONTEXT, 0, '/customers', 'id', {
			returnAll: false,
			limit: 50,
			filter: '   ',
		});

		expect(queryOf(0)).not.toHaveProperty('$filter');
	});
});
