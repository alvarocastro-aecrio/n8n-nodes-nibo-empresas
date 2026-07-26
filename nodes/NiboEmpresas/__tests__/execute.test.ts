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
	it('forwards Return All and the filter to the transport', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, filter: "contains(name,'LTDA')" }),
			'customer',
			'list',
		);

		expect(listRequest.mock.calls[0][1]).toBe('/customers');
		expect(listRequest.mock.calls[0][2]).toBe('id');
		expect(optionsSentToTransport()).toMatchObject({
			returnAll: true,
			filter: "contains(name,'LTDA')",
		});
	});

	// A scan that may have missed records is a bad answer to build on, so the
	// node refuses it unless someone says otherwise.
	it('refuses a possibly incomplete scan when nobody said anything', async () => {
		await executeStakeholder.call(context({ returnAll: true }), 'customer', 'list');

		expect(optionsSentToTransport()).toMatchObject({ failOnIncomplete: true });
	});

	it('tolerates one when the option says so', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, options: { failOnIncomplete: false } }),
			'customer',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({ failOnIncomplete: false });
	});

	// It used to be a field of its own, and off by default. A node saved back
	// then chose that, even by not touching it.
	it('keeps the choice of a node saved before it became an option', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, failOnIncomplete: false }),
			'customer',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({ failOnIncomplete: false });
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

// The handler was parameterized by type from 0.1.0 — this is what that was for.
describe('executeStakeholder — the other three types', () => {
	it.each([
		['supplier', 'supplierId', '/suppliers'],
		['employee', 'employeeId', '/employees'],
		['partner', 'partnerId', '/partners'],
	])('reads %s from its own collection', async (resource, parameter, endpoint) => {
		await executeStakeholder.call(
			context({ [parameter]: 'not-a-real-id', returnAll: true }),
			resource,
			'list',
		);

		expect(listRequest.mock.calls[0][1]).toBe(endpoint);
		expect(listRequest.mock.calls[0][2]).toBe('id');
	});

	it.each([
		['supplier', 'supplierId', '/suppliers'],
		['employee', 'employeeId', '/employees'],
		['partner', 'partnerId', '/partners'],
	])('deletes a %s by the ID field of its own', async (resource, parameter, endpoint) => {
		const items = await executeStakeholder.call(
			context({ [parameter]: 'not-a-real-id' }),
			resource,
			'delete',
		);

		expect(apiCall(0)).toMatchObject({
			method: 'DELETE',
			endpoint: `${endpoint}/not-a-real-id`,
		});
		expect(items[0].json).toEqual({ id: 'not-a-real-id', deleted: true });
	});

	it('writes a supplier to the supplier collection', async () => {
		await executeStakeholder.call(
			context({ name: 'ACME LTDA', documentNumber: '00000000000000', documentType: 'CNPJ' }),
			'supplier',
			'create',
		);

		expect(create.mock.calls[0][1]).toBe('/suppliers');
	});

	it('runs the safe update cycle on a partner too', async () => {
		await executeStakeholder.call(
			context({ partnerId: 'not-a-real-id', updateFields: { phone: '2199999999' } }),
			'partner',
			'update',
		);

		expect(safeUpdate.mock.calls[0][1]).toBe('/partners');
		expect(safeUpdate.mock.calls[0][2]).toBe('not-a-real-id');
	});

	// The 404 that reprovou the first run of 0.4.4: the suffix that lets a
	// create answer with the whole record exists on two of the four collections
	// and answers "Resource not found" on the other two.
	it.each([
		['customer', true],
		['supplier', true],
		['employee', false],
		['partner', false],
	])('tells the transport whether a %s create answers with the record', async (resource, answers) => {
		await executeStakeholder.call(
			context({ name: 'ACME LTDA', documentNumber: '00000000000000', documentType: 'CNPJ' }),
			resource as string,
			'create',
		);

		expect(create.mock.calls[0][3]).toEqual({ answersWithTheRecord: answers });
	});

	it('still refuses a type it does not know', async () => {
		const failure = executeStakeholder.call(context({}), 'accountant', 'list');

		await expect(failure).rejects.toThrow(/accountant/);
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

/**
 * The $filter the handler decides on. Two modes, one of them the builder — and
 * the retaguarda that keeps a node saved before 0.5.0 filtering exactly as it
 * did, which is what makes this release a zero breaking change.
 */
describe('executeStakeholder — the filter it sends', () => {
	/** The $filter the handler handed to the transport */
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[], rest: IDataObject = {}) {
		return context({ returnAll: true, filterType: 'conditions', filters: { conditions }, ...rest });
	}

	it('builds the expression out of the conditions', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: 'ACME' }]),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'ACME')");
	});

	// The whole reason this version exists: typed raw, this name closes the
	// literal early and the API answers 500 with nothing pointing at the quote.
	it('escapes the apostrophe that used to be an unexplained 500', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: "D'ALESSANDRO" }]),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'D''ALESSANDRO')");
	});

	it('joins two conditions with and by default', async () => {
		await executeStakeholder.call(
			withConditions([
				{ field: 'name', operator: 'contains', value: 'ACME' },
				{ field: 'address/state', operator: 'eq', value: 'RJ' },
			]),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'ACME') and address/state eq 'RJ'");
	});

	it('joins them with or when that is what was chosen', async () => {
		await executeStakeholder.call(
			withConditions(
				[
					{ field: 'name', operator: 'contains', value: 'ACME' },
					{ field: 'address/state', operator: 'eq', value: 'RJ' },
				],
				{ filterCombine: 'or' },
			),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'ACME') or address/state eq 'RJ'");
	});

	// Each type is collected in its own box, so the value reaches the builder as
	// what it is — and comes out as the literal the API takes for it.
	it('reads a yes-or-no from its checkbox and writes it bare', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'isCompany', operator: 'eq', booleanValue: false }]),
			'customer',
			'list',
		);

		expect(filterSent()).toBe('isCompany eq false');
	});

	it('reads a date from its own box and writes it bare', async () => {
		await executeStakeholder.call(
			withConditions([
				{ field: 'updateDate', operator: 'ge', dateValue: '2026-07-01T00:00:00.000Z' },
			]),
			'customer',
			'list',
		);

		expect(filterSent()).toBe('updateDate ge 2026-07-01T00:00:00.000Z');
	});

	it('sends the expression as it was written when one was added under Options', async () => {
		await executeStakeholder.call(
			context({
				returnAll: true,
				options: { filter: "contains(name,'LTDA') and isCompany eq true" },
			}),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'LTDA') and isCompany eq true");
	});

	/**
	 * Filling the expression in is what takes the conditions off the screen, so
	 * it has to be what takes them out of the request too. A field nobody can see
	 * must never be filtering underneath one they can.
	 */
	it('sends only the expression once one is written, conditions or no conditions', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: 'ACME' }], {
				options: { filter: "contains(name,'LTDA')" },
			}),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'LTDA')");
	});

	it('goes back to the conditions when the expression is taken out again', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: 'ACME' }], { options: {} }),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'ACME')");
	});

	it('builds the conditions when the option was added and left blank', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: 'ACME' }], {
				options: { filter: '   ' },
			}),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'ACME')");
	});

	/**
	 * A node saved under 0.4.4 carries `filter` as a field of the body, with no
	 * `filterType` and no option. It has to go on filtering by the expression its
	 * author wrote — the same rule the interval (0.4.2) and the strict scan
	 * (0.4.3) already follow.
	 */
	it('keeps filtering by the expression of a node saved before this version', async () => {
		await executeStakeholder.call(
			context({ returnAll: true, filter: "contains(name,'LTDA')" }),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'LTDA')");
	});

	/**
	 * And that stored value is a fallback, never an override. It is a value
	 * nobody can see any more — the field it was typed into is an Option now —
	 * and a value nobody can see must not quietly beat the conditions someone is
	 * looking at.
	 */
	it('never lets that invisible expression beat the conditions on screen', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: 'ACME' }], {
				filter: "contains(name,'LTDA')",
			}),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'ACME')");
	});

	it('sends no filter at all when nobody asked for one', async () => {
		await executeStakeholder.call(context({ returnAll: true }), 'customer', 'list');

		expect(filterSent()).toBe('');
	});

	// A row added and left untouched is an unfinished row, not "match
	// everything" — and it must not take the saved expression down with it.
	it('ignores a condition with no value, and falls back to the saved expression', async () => {
		await executeStakeholder.call(
			withConditions([{ field: 'name', operator: 'contains', value: '' }], {
				filter: "contains(name,'LTDA')",
			}),
			'customer',
			'list',
		);

		expect(filterSent()).toBe("contains(name,'LTDA')");
	});

	/**
	 * A field this version does not know can only come from a node saved with a
	 * menu that is not this one. Dropping the condition would return more records
	 * than the workflow asked for — the direction a workflow deletes by — so the
	 * item fails, carrying its index.
	 */
	it('fails the item on a field it does not know, instead of widening the result', async () => {
		const failure = executeStakeholder.call(
			withConditions([{ field: 'document/type', operator: 'eq', value: 'CPF' }]),
			'customer',
			'list',
		);

		await expect(failure).rejects.toThrow(/document\/type/);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
	});

	it('filters the same way on the other three types', async () => {
		for (const resource of ['supplier', 'employee', 'partner']) {
			listRequest.mockClear();
			await executeStakeholder.call(
				withConditions([{ field: 'name', operator: 'containsIgnoreCase', value: 'ACME' }]),
				resource,
				'list',
			);

			expect(filterSent()).toBe("contains(tolower(name),'acme')");
		}
	});
});
