import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { executeStakeholder } from '../resources/stakeholder/execute';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/paginate');
jest.mock('../transport/request');

// Only `sleep` is replaced, so the tests run instantly while still proving how
// many gaps the handler leaves between items.
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;
const wait = sleep as jest.MockedFunction<typeof sleep>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

/** The options object the handler handed to the transport (itemIndex, endpoint, orderBy, options) */
function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][3] as unknown as IDataObject;
}

/** (itemIndex, method, endpoint, qs, body) — the transport's own signature */
function apiCall(index: number) {
	const [itemIndex, method, endpoint] = apiRequest.mock.calls[index];
	return { itemIndex, method, endpoint };
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	apiRequest.mockReset();
	apiRequest.mockResolvedValue({});
	wait.mockClear();
});

describe('executeStakeholder — list', () => {
	it('forwards Return All, the filter and the strict flag to the transport', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, filter: "contains(name,'LTDA')", failOnIncomplete: true }),
			'customer',
			'list',
		);

		expect(listRequest.mock.calls[0][1]).toBe('/customers');
		expect(listRequest.mock.calls[0][2]).toBe('id');
		expect(optionsSentToTransport()).toMatchObject({
			returnAll: true,
			filter: "contains(name,'LTDA')",
			failOnIncomplete: true,
		});
	});

	it('forwards the limit when Return All is off', async () => {
		await executeStakeholder.call(context({ returnAll: false, limit: 5 }), 'customer', 'list');

		expect(optionsSentToTransport()).toMatchObject({ returnAll: false, limit: 5 });
	});

	// Reading a parameter at index `i` is not enough: the index has to reach the
	// transport, or every item of the run would authenticate as the first one.
	it('hands each input item its own index down to the transport', async () => {
		await executeStakeholder.call(context({ returnAll: true }, 4), 'customer', 'list');

		expect(listRequest).toHaveBeenCalledTimes(4);
		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2, 3]);
	});

	it('flags the last item when the result may be incomplete', async () => {
		listRequest.mockResolvedValue({
			records: [{ id: 'a' }, { id: 'b' }],
			count: 3,
			warning: 'Nibo reported 3 records but only 2 arrived, so this result is incomplete.',
		});

		const items = await executeStakeholder.call(
			context({ returnAll: true }),
			'customer',
			'list',
		);

		expect(items).toHaveLength(2);
		expect(items[0].json).not.toHaveProperty('_niboPaginationWarning');
		expect(items[1].json._niboPaginationWarning).toContain('incomplete');
	});

	it('leaves one interval between items, and none before the first', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, requestInterval: 500 }, 3),
			'customer',
			'list',
		);

		expect(wait).toHaveBeenCalledTimes(2);
		expect(wait).toHaveBeenCalledWith(500);
	});

	it('hands the interval to the transport, which spaces the pages of each item', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, requestInterval: 500 }),
			'customer',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({ interval: 500 });
	});

	it('never waits when the interval is zero', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, requestInterval: 0 }, 3),
			'customer',
			'list',
		);

		expect(listRequest).toHaveBeenCalledTimes(3);
		expect(wait).not.toHaveBeenCalled();
	});

	it('leaves the records untouched when the scan was consistent', async () => {
		listRequest.mockResolvedValue({ records: [{ id: 'a' }], count: 1 });

		const items = await executeStakeholder.call(context({ returnAll: true }), 'customer', 'list');

		expect(items[0].json).toEqual({ id: 'a' });
	});
});

describe('executeStakeholder — get', () => {
	it('reads one record by ID and returns it as a single item', async () => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id', name: 'ACME LTDA' });

		const items = await executeStakeholder.call(
			context({ customerId: 'not-a-real-id' }),
			'customer',
			'get',
		);

		expect(apiCall(0)).toMatchObject({
			itemIndex: 0,
			method: 'GET',
			endpoint: '/customers/not-a-real-id',
		});
		expect(items).toHaveLength(1);
		expect(items[0].json).toMatchObject({ id: 'not-a-real-id', name: 'ACME LTDA' });
	});

	it('fails the item when no ID was given', async () => {
		const failure = executeStakeholder.call(context({ customerId: '  ' }), 'customer', 'get');

		await expect(failure).rejects.toThrow(/ID/);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

describe('executeStakeholder — delete', () => {
	// The API answers 204 with no body at all, so the confirmation the workflow
	// gets has to be built here — there is nothing to pass through.
	it('deletes by ID and says so, since the API answers no content', async () => {
		apiRequest.mockResolvedValue(undefined);

		const items = await executeStakeholder.call(
			context({ customerId: 'not-a-real-id' }),
			'customer',
			'delete',
		);

		expect(apiCall(0)).toMatchObject({
			method: 'DELETE',
			endpoint: '/customers/not-a-real-id',
		});
		expect(items[0].json).toEqual({ id: 'not-a-real-id', deleted: true });
	});

	it('fails the item when no ID was given', async () => {
		const failure = executeStakeholder.call(context({ customerId: '' }), 'customer', 'delete');

		await expect(failure).rejects.toThrow(/ID/);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
		expect(apiRequest).not.toHaveBeenCalled();
	});
});
