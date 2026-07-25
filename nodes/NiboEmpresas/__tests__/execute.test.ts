import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';

import { executeStakeholder } from '../resources/stakeholder/execute';
import { niboListRequest } from '../transport/paginate';

jest.mock('../transport/paginate');

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function context(parameters: IDataObject) {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

/** The options object the handler handed to the transport */
function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][2] as unknown as IDataObject;
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
});

describe('executeStakeholder — list', () => {
	it('forwards Return All, the filter and the strict flag to the transport', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, filter: "contains(name,'LTDA')", failOnIncomplete: true }),
			'customer',
			'list',
		);

		expect(listRequest.mock.calls[0][0]).toBe('/customers');
		expect(listRequest.mock.calls[0][1]).toBe('id');
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

	it('leaves the records untouched when the scan was consistent', async () => {
		listRequest.mockResolvedValue({ records: [{ id: 'a' }], count: 1 });

		const items = await executeStakeholder.call(context({ returnAll: true }), 'customer', 'list');

		expect(items[0].json).toEqual({ id: 'a' });
	});
});
