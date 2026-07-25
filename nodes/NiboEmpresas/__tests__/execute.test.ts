import type { IDataObject, IExecuteFunctions, INode, INodePropertyOptions } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeStakeholder } from '../resources/stakeholder/execute';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';
import { niboCreate, niboSafeUpdate } from '../transport/save';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('../transport/save');

// Only `sleep` is replaced, so the tests run instantly while still proving how
// many gaps the handler leaves between items.
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;
const create = niboCreate as jest.MockedFunction<typeof niboCreate>;
const safeUpdate = niboSafeUpdate as jest.MockedFunction<typeof niboSafeUpdate>;
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
	create.mockReset();
	create.mockResolvedValue({ id: 'not-a-real-id' });
	safeUpdate.mockReset();
	safeUpdate.mockResolvedValue({ id: 'not-a-real-id' });
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
			context({ returnAll: true, options: { requestInterval: 500 } }, 3),
			'customer',
			'list',
		);

		expect(wait).toHaveBeenCalledTimes(2);
		expect(wait).toHaveBeenCalledWith(500);
	});

	it('hands the interval to the transport, which spaces the pages of each item', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, options: { requestInterval: 500 } }),
			'customer',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({ interval: 500 });
	});

	it('never waits when the interval is zero', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, options: { requestInterval: 0 } }, 3),
			'customer',
			'list',
		);

		expect(listRequest).toHaveBeenCalledTimes(3);
		expect(wait).not.toHaveBeenCalled();
	});

	it('waits a second between items when nobody asked for anything', async () => {
		await executeStakeholder.call(context({ returnAll: true }, 2), 'customer', 'list');

		expect(wait).toHaveBeenCalledWith(1000);
	});

	// The interval used to be a field of its own. A node saved back then still
	// carries it there, and its author still means it.
	it('still honours the interval of a node saved before it became an option', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, requestInterval: 250 }, 2),
			'customer',
			'list',
		);

		expect(wait).toHaveBeenCalledWith(250);
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

describe('executeStakeholder — create', () => {
	/** The payload the handler built out of the UI fields */
	function payloadSent(): IDataObject {
		return create.mock.calls[0][2];
	}

	it('sends the first-class fields as the document payload the API expects', async () => {
		await executeStakeholder.call(
			context({ name: 'ACME LTDA', documentNumber: '00000000000000', documentType: 'CNPJ' }),
			'customer',
			'create',
		);

		expect(create.mock.calls[0][0]).toBe(0);
		expect(create.mock.calls[0][1]).toBe('/customers');
		expect(payloadSent()).toEqual({
			name: 'ACME LTDA',
			document: { number: '00000000000000', type: 'CNPJ' },
		});
	});

	it('files each additional field under the branch the API keeps it in', async () => {
		await executeStakeholder.call(
			context({
				name: 'ACME LTDA',
				documentNumber: '00000000000000',
				documentType: 'CNPJ',
				additionalFields: {
					companyName: 'Acme',
					contactName: 'Ada',
					email: 'billing@example.com,ap@example.com',
					phone: '2130000000',
					addressLine1: 'R EXAMPLE',
					addressNumber: 100,
					addressState: 'RJ',
				},
			}),
			'customer',
			'create',
		);

		expect(payloadSent()).toEqual({
			name: 'ACME LTDA',
			document: { number: '00000000000000', type: 'CNPJ' },
			companyInformation: { companyName: 'Acme' },
			communication: {
				contactName: 'Ada',
				email: 'billing@example.com,ap@example.com',
				phone: '2130000000',
			},
			address: { line1: 'R EXAMPLE', number: 100, state: 'RJ' },
		});
	});

	it('leaves out the branches nobody filled in', async () => {
		await executeStakeholder.call(
			context({
				name: 'ACME LTDA',
				documentNumber: '00000000000000',
				documentType: 'CNPJ',
				additionalFields: {},
			}),
			'customer',
			'create',
		);

		expect(payloadSent()).not.toHaveProperty('communication');
		expect(payloadSent()).not.toHaveProperty('address');
	});

	it('returns the record the API stored, with the document type normalized', async () => {
		create.mockResolvedValue({
			id: 'not-a-real-id',
			name: 'ACME LTDA',
			document: { number: '00000000000000', type: 'Cnpj' },
		});

		const items = await executeStakeholder.call(
			context({ name: 'ACME LTDA', documentNumber: '00000000000000', documentType: 'CNPJ' }),
			'customer',
			'create',
		);

		expect(items[0].json.document).toEqual({ number: '00000000000000', type: 'CNPJ' });
	});
});

describe('executeStakeholder — update', () => {
	/** (itemIndex, endpoint, id, changes, options) — the transport's own signature */
	function updateCall() {
		const [itemIndex, endpoint, id, changes, options] = safeUpdate.mock.calls[0];
		return { itemIndex, endpoint, id, changes, options };
	}

	it('asks the safe cycle to change only the fields that were added', async () => {
		await executeStakeholder.call(
			context({ customerId: 'not-a-real-id', updateFields: { phone: '2199999999' } }),
			'customer',
			'update',
		);

		expect(updateCall()).toMatchObject({
			itemIndex: 0,
			endpoint: '/customers',
			id: 'not-a-real-id',
			changes: { communication: { phone: '2199999999' } },
		});
	});

	// Adding a field and leaving it blank is the documented way to erase a
	// stored value, so an empty string has to survive the trip to the payload.
	it('keeps a field that was added and left blank, which is how a value is erased', async () => {
		await executeStakeholder.call(
			context({ customerId: 'not-a-real-id', updateFields: { phone: '' } }),
			'customer',
			'update',
		);

		expect(updateCall().changes).toEqual({ communication: { phone: '' } });
	});

	it('can change the document without being told the type again', async () => {
		await executeStakeholder.call(
			context({ customerId: 'not-a-real-id', updateFields: { documentNumber: '11111111111' } }),
			'customer',
			'update',
		);

		expect(updateCall().changes).toEqual({ document: { number: '11111111111' } });
	});

	// Without it the confirmation would read the API's own `Cnpj` as proof that
	// a document change of `CNPJ` never took.
	it('hands the safe cycle the normalizer, so the confirmation compares like for like', async () => {
		await executeStakeholder.call(
			context({ customerId: 'not-a-real-id', updateFields: { phone: '2199999999' } }),
			'customer',
			'update',
		);

		const normalize = updateCall().options?.normalize;

		expect(normalize?.({ document: { type: 'Cnpj' } })).toEqual({
			document: { type: 'CNPJ' },
		});
	});

	// The record a read answers is not a body a write can send back: the API
	// mirrors phone and e-mail at the root, and the mirror undoes the change.
	it('hands the safe cycle the rule for what must not go back in the body', async () => {
		await executeStakeholder.call(
			context({ customerId: 'not-a-real-id', updateFields: { phone: '2199999999' } }),
			'customer',
			'update',
		);

		const writeBody = updateCall().options?.writeBody;

		expect(writeBody?.({ name: 'ACME', phone: 'old', communication: { phone: 'new' } })).toEqual({
			name: 'ACME',
			communication: { phone: 'new' },
		});
	});

	it('returns the record as the confirmation read it, normalized', async () => {
		safeUpdate.mockResolvedValue({
			id: 'not-a-real-id',
			document: { number: '00000000000000', type: 'Cnpj' },
		});

		const items = await executeStakeholder.call(
			context({ customerId: 'not-a-real-id', updateFields: { phone: '2199999999' } }),
			'customer',
			'update',
		);

		expect(items[0].json.document).toEqual({ number: '00000000000000', type: 'CNPJ' });
	});
});

// Decision 5 of the v0.4.0 plan, and the one visible change of the release:
// every operation hands out the same spelling, Get Many included.
describe('executeStakeholder — the document type on the way out', () => {
	it('normalizes the records of a scan', async () => {
		listRequest.mockResolvedValue({
			records: [{ id: 'a', document: { type: 'Cnpj' } }, { id: 'b', document: { type: 'Cpf' } }],
			count: 2,
		});

		const items = await executeStakeholder.call(context({ returnAll: true }), 'customer', 'list');

		expect(items.map((item) => (item.json.document as IDataObject).type)).toEqual(['CNPJ', 'CPF']);
	});

	it('normalizes a record read by ID', async () => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id', document: { type: 'Cnpj' } });

		const items = await executeStakeholder.call(
			context({ customerId: 'not-a-real-id' }),
			'customer',
			'get',
		);

		expect(items[0].json.document).toEqual({ type: 'CNPJ' });
	});
});

/**
 * 0.3.1 was a release about a field the editor offered and nothing was behind.
 * This is the same class of bug one level up: an operation listed in the menu
 * that the handler does not route answers "not supported" at run time, and
 * only at run time.
 */
describe('the operations the editor offers and the handler routes', () => {
	const offered = (
		(new NiboEmpresas().description.properties.find((prop) => prop.name === 'operation')?.options ??
			[]) as INodePropertyOptions[]
	).map((option) => option.value as string);

	it.each(offered)('routes "%s"', async (operation) => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id' });

		const items = await executeStakeholder.call(
			context({
				customerId: 'not-a-real-id',
				name: 'ACME LTDA',
				documentNumber: '00000000000000',
				documentType: 'CNPJ',
				updateFields: { phone: '2199999999' },
				limit: 1,
			}),
			'customer',
			operation,
		);

		expect(items).toBeDefined();
	});
});
