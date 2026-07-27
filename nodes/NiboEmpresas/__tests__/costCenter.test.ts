import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeCostCenter } from '../resources/costCenter/execute';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';
import { niboCreate, niboSafeUpdate } from '../transport/save';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('../transport/save');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;
const create = niboCreate as jest.MockedFunction<typeof niboCreate>;
const safeUpdate = niboSafeUpdate as jest.MockedFunction<typeof niboSafeUpdate>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const GUID = '2efffcd0-8730-4348-86da-6d9a95be6149';

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	apiRequest.mockReset();
	apiRequest.mockResolvedValue({});
	create.mockReset();
	create.mockResolvedValue({ costCenterId: GUID, description: 'Filial Rio' });
	safeUpdate.mockReset();
	safeUpdate.mockResolvedValue({ costCenterId: GUID, description: 'Filial Niterói' });
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The other classifier of this API, and the one the node never offered.
 *
 * Unlike the categories, this family is reversible: create, edit and delete all
 * answer on `/costcenters` — measured on the test company on 2026-07-26, with
 * every record created there deleted again afterwards.
 */
describe('executeCostCenter — Get Many', () => {
	it('reads the collection', async () => {
		await executeCostCenter.call(context({ returnAll: true }), 'costCenter', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/costcenters');
	});

	/**
	 * The key of this collection is `costCenterId`, and `id` is a 500 —
	 * *Could not find a property named 'id'*. Measured on 2026-07-26. It is the
	 * third collection of this node with a key of its own, after the
	 * stakeholders' `id` and the schedules' `scheduleId`.
	 */
	it('pages by costCenterId, and never by id', async () => {
		await executeCostCenter.call(context({ returnAll: true }), 'costCenter', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('costCenterId');
		expect(listRequest.mock.calls[0][2]).not.toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeCostCenter.call(
			context({ returnAll: false, limit: 7 }),
			'costCenter',
			'list',
		);

		expect(listRequest.mock.calls[0][3]).toMatchObject({
			returnAll: false,
			limit: 7,
			failOnIncomplete: true,
		});
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeCostCenter.call(context({ returnAll: true }, 3), 'costCenter', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('flags the last item when the scan may be incomplete', async () => {
		listRequest.mockResolvedValue({
			records: [{ costCenterId: 'a' }, { costCenterId: 'b' }],
			count: 3,
			warning: 'this result is incomplete',
		});

		const items = await executeCostCenter.call(
			context({ returnAll: true, options: { failOnIncomplete: false } }),
			'costCenter',
			'list',
		);

		expect(items[1].json._niboPaginationWarning).toContain('incomplete');
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeCostCenter.call(context({}), 'category', 'list')).rejects.toThrow(
			/category/,
		);
	});

	it('refuses an operation it does not have', async () => {
		await expect(executeCostCenter.call(context({}), 'costCenter', 'archive')).rejects.toThrow(
			/archive/,
		);
	});
});

describe('executeCostCenter — the filter it sends', () => {
	function filterSent(): unknown {
		return (listRequest.mock.calls[0][3] as unknown as IDataObject).filter;
	}

	function withConditions(conditions: IDataObject[]) {
		return context({ returnAll: true, filters: { conditions } });
	}

	it('searches the description ignoring case', async () => {
		await executeCostCenter.call(
			withConditions([{ field: 'description', operator: 'containsIgnoreCase', value: 'FILIAL' }]),
			'costCenter',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(description),'filial')");
	});

	it('compares the external code as the quoted literal the API takes', async () => {
		await executeCostCenter.call(
			withConditions([{ field: 'externalCode', operator: 'eq', value: 'RIO-01' }]),
			'costCenter',
			'list',
		);

		expect(filterSent()).toBe("externalCode eq 'RIO-01'");
	});

	/**
	 * The one comparison of this API that takes its literal bare.
	 * `costCenterId eq '<guid>'` answers 500 — *Found operand types 'Edm.Guid'
	 * and 'Edm.String'* — while the same expression unquoted answers 200.
	 * Measured on 2026-07-26, on this collection and on `/categories` alike.
	 */
	it('writes the ID without quotes, which is the opposite of every text field', async () => {
		await executeCostCenter.call(
			withConditions([{ field: 'costCenterId', operator: 'eq', guidValue: GUID }]),
			'costCenter',
			'list',
		);

		expect(filterSent()).toBe(`costCenterId eq ${GUID}`);
	});

	it('fails the item on an ID that is not one, rather than sending a 500', async () => {
		const failure = executeCostCenter.call(
			withConditions([{ field: 'costCenterId', operator: 'eq', guidValue: 'Filial Rio' }]),
			'costCenter',
			'list',
		);

		await expect(failure).rejects.toThrow(/Filial Rio/);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
	});

	// A 500: the field is not on this view at all, exactly as on `/categories`.
	it('fails the item on isDeleted, which this menu does not have', async () => {
		const failure = executeCostCenter.call(
			withConditions([{ field: 'isDeleted', operator: 'eq', booleanValue: false }]),
			'costCenter',
			'list',
		);

		await expect(failure).rejects.toThrow(/isDeleted/);
	});
});

describe('executeCostCenter — Get', () => {
	it('reads the one record by ID', async () => {
		apiRequest.mockResolvedValue({ costCenterId: GUID, description: 'Filial Rio' });

		const items = await executeCostCenter.call(
			context({ costCenterId: GUID }),
			'costCenter',
			'get',
		);

		expect(apiRequest.mock.calls[0][1]).toBe('GET');
		expect(apiRequest.mock.calls[0][2]).toBe(`/costcenters/${GUID}`);
		expect(items[0].json).toEqual({ costCenterId: GUID, description: 'Filial Rio' });
	});

	it('refuses an empty ID before it becomes a request on the collection', async () => {
		await expect(executeCostCenter.call(context({}), 'costCenter', 'get')).rejects.toThrow(
			/record ID/i,
		);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('says so when Nibo answers with no record', async () => {
		apiRequest.mockResolvedValue('');

		await expect(
			executeCostCenter.call(context({ costCenterId: GUID }), 'costCenter', 'get'),
		).rejects.toThrow(new RegExp(GUID));
	});
});

describe('executeCostCenter — Create', () => {
	/** The body handed to the transport */
	function bodySent(): IDataObject {
		return create.mock.calls[0][2] as IDataObject;
	}

	// Measured on 2026-07-26: omitting it answers HTTP 500, *"A descrição é
	// obrigatório."*
	it('sends the description, which the API refuses a creation without', async () => {
		await executeCostCenter.call(
			context({ description: 'Filial Rio' }),
			'costCenter',
			'create',
		);

		expect(create.mock.calls[0][1]).toBe('/costcenters');
		expect(bodySent()).toEqual({ description: 'Filial Rio' });
	});

	it('sends the external code when one was given, and nothing when it was not', async () => {
		await executeCostCenter.call(
			context({ description: 'Filial Rio', additionalFields: { externalCode: 'RIO-01' } }),
			'costCenter',
			'create',
		);

		expect(bodySent()).toEqual({ description: 'Filial Rio', externalCode: 'RIO-01' });
	});

	/**
	 * The POST answers a bare GUID — there is no `/FormatType=json` here — so the
	 * transport reads the record back. It is not told otherwise, which is what
	 * "off unless measured" means in `INiboCreateOptions`.
	 */
	it('never asks for the suffixed POST, which was not measured on this collection', async () => {
		await executeCostCenter.call(context({ description: 'Filial Rio' }), 'costCenter', 'create');

		expect(create.mock.calls[0][3]?.answersWithTheRecord).toBeUndefined();
	});

	it('hands back the record the transport read, not the ID', async () => {
		const items = await executeCostCenter.call(
			context({ description: 'Filial Rio' }),
			'costCenter',
			'create',
		);

		expect(items[0].json).toEqual({ costCenterId: GUID, description: 'Filial Rio' });
	});
});

describe('executeCostCenter — Update', () => {
	/**
	 * `GET` → merge → `PUT` → `GET` to confirm, exactly as the contacts do. The
	 * `PUT` answers **204 with no body at all**, so there is nothing in the
	 * answer to read: the confirmation is the read-back, which the transport
	 * already does for every resource.
	 */
	it('goes through the safe cycle, with the ID and only the fields that were added', async () => {
		await executeCostCenter.call(
			context({ costCenterId: GUID, updateFields: { description: 'Filial Niterói' } }),
			'costCenter',
			'update',
		);

		expect(safeUpdate.mock.calls[0][1]).toBe('/costcenters');
		expect(safeUpdate.mock.calls[0][2]).toBe(GUID);
		expect(safeUpdate.mock.calls[0][3]).toEqual({ description: 'Filial Niterói' });
	});

	it('reads and writes at the same address, so it hands the cycle no other one', async () => {
		await executeCostCenter.call(
			context({ costCenterId: GUID, updateFields: { externalCode: 'NIT-02' } }),
			'costCenter',
			'update',
		);

		expect(safeUpdate.mock.calls[0][4]).toBeUndefined();
	});

	// A field added and left empty is written empty: that is how a stored value
	// is erased on purpose, and it is the same rule the contacts follow.
	it('sends an empty external code when one was added empty', async () => {
		await executeCostCenter.call(
			context({ costCenterId: GUID, updateFields: { externalCode: '' } }),
			'costCenter',
			'update',
		);

		expect(safeUpdate.mock.calls[0][3]).toEqual({ externalCode: '' });
	});

	it('hands back the record the cycle confirmed', async () => {
		const items = await executeCostCenter.call(
			context({ costCenterId: GUID, updateFields: { description: 'Filial Niterói' } }),
			'costCenter',
			'update',
		);

		expect(items[0].json).toEqual({ costCenterId: GUID, description: 'Filial Niterói' });
	});
});

describe('executeCostCenter — Delete', () => {
	it('deletes by ID and confirms what the API does not answer', async () => {
		const items = await executeCostCenter.call(
			context({ costCenterId: GUID }),
			'costCenter',
			'delete',
		);

		expect(apiRequest.mock.calls[0][1]).toBe('DELETE');
		expect(apiRequest.mock.calls[0][2]).toBe(`/costcenters/${GUID}`);
		expect(items[0].json).toEqual({ id: GUID, deleted: true });
	});

	it('refuses an empty ID, which would be a DELETE on the whole collection', async () => {
		await expect(executeCostCenter.call(context({}), 'costCenter', 'delete')).rejects.toThrow(
			/record ID/i,
		);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

/**
 * The list behind the Cost Center field of a schedule's apportionment.
 *
 * Like every other list of this node it reads the API on its own: in
 * `ILoadOptionsFunctions` there is no item index, so routing through the
 * transport would read the index as the fallback.
 */
describe('loadCostCenters — the list on the apportionment field', () => {
	const CENTRES = [
		{ costCenterId: 'a', description: 'Filial Niterói', externalCode: 'NIT' },
		{ costCenterId: 'b', description: 'Filial Rio' },
	];

	let request: jest.Mock;

	function loadContext(parameters: IDataObject, items: IDataObject[] = CENTRES) {
		request = jest.fn().mockResolvedValue({ items, count: items.length });

		return {
			getCurrentNodeParameter: (name: string) => parameters[name],
			getNode: () => NODE,
			getCredentials: jest.fn().mockResolvedValue({ baseUrl: '' }),
			helpers: { httpRequestWithAuthentication: request },
		} as never;
	}

	it('reads the collection, by the only thing a person reads here', async () => {
		const { loadCostCenters } = await import('../resources/costCenter/load');
		await loadCostCenters.call(loadContext({ authMode: 'credential' }));

		expect(request.mock.calls[0][0]).toBe('niboEmpresasApi');
		expect(request.mock.calls[0][1].url).toContain('/costcenters');
		expect(request.mock.calls[0][1].qs.$orderby).toBe('description');
	});

	// The external code is the organization's own, and it is the one thing that
	// tells two cost centres of the same name apart.
	it('shows the description, with the external code under it when there is one', async () => {
		const { loadCostCenters } = await import('../resources/costCenter/load');
		const list = await loadCostCenters.call(loadContext({ authMode: 'credential' }));

		expect(list[0]).toEqual({ name: 'Filial Niterói', value: 'a', description: 'NIT' });
		expect(list[1]).toEqual({ name: 'Filial Rio', value: 'b', description: undefined });
	});

	/**
	 * The reason an empty answer is ordinary here and alarming on the categories:
	 * an organization starts with no cost centre at all. It is a thing somebody
	 * creates, not a thing Nibo fills in.
	 */
	it('explains an empty answer instead of showing an empty box', async () => {
		const { loadCostCenters } = await import('../resources/costCenter/load');
		const failure = loadCostCenters.call(loadContext({ authMode: 'credential' }, []));

		await expect(failure).rejects.toThrow(/no cost center/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/starts with none/i),
		});
	});

	it('refuses in the per-item token mode, and points at the resource instead', async () => {
		const { loadCostCenters } = await import('../resources/costCenter/load');
		const failure = loadCostCenters.call(loadContext({ authMode: 'field' }));

		await expect(failure).rejects.toThrow(/per item/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/Cost Center resource/),
		});
		expect(request).not.toHaveBeenCalled();
	});
});

describe('NiboEmpresas — Cost Center on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forCostCenter(name: string): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('costCenter'),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	/**
	 * A family of one, and it keeps the menu alphabetical without a prefix —
	 * "Cost Center" falls after "Contact - Supplier" and before "Schedule -
	 * Credit" on its own.
	 */
	it('joins the menu without breaking the order the Actions tab is built from', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([
			'Bank Account',
			'Category',
			'Contact - Customer',
			'Contact - Employee',
			'Contact - Partner',
			'Contact - Supplier',
			'Cost Center',
			'Schedule - Credit',
			'Schedule - Debit',
			'Transaction - Payment',
			'Transaction - Receipt',
		]);
	});

	// A resource missing from the credential's list is a resource with no
	// credential at all — the cost of the trick that puts Authentication first.
	it('is named in the credential like every other resource', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('costCenter');
	});

	it('offers the five operations the API answers, unlike the categories', () => {
		const operations = forCostCenter('operation');

		expect(optionValues(operations).sort()).toEqual([
			'create',
			'delete',
			'get',
			'list',
			'update',
		]);
		expect(operations?.default).toBe('list');
	});

	it('asks for the ID on the three operations that work on one record', () => {
		expect(forCostCenter('costCenterId')?.displayOptions?.show?.operation).toEqual([
			'delete',
			'get',
			'update',
		]);
	});

	// The API refuses a creation without it, so the screen does too.
	it('asks for the description on the screen when creating, and requires it', () => {
		expect(forCostCenter('description')?.displayOptions?.show?.operation).toEqual(['create']);
		expect(forCostCenter('description')?.required).toBe(true);
	});

	/**
	 * And back inside the menu on an update, which is not an oversight: there a
	 * field on the screen is a field that gets written, so a visible empty
	 * Description would erase the stored one on every update of anything else —
	 * and this API refuses an empty description outright.
	 */
	it('puts the description back in the menu on an update', () => {
		const menu = (forCostCenter('updateFields')?.options ?? []) as INodeProperties[];

		expect(menu.map((option) => option.name).sort()).toEqual(['description', 'externalCode']);
	});

	/** The fields of one row of this resource's condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (forCostCenter('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the three paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(
			['costCenterId', 'description', 'externalCode'].sort(),
		);
	});

	it('never offers isDeleted, which is a 500 on this view', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field)).not.toContain('isDeleted');
	});

	// An identifier is the same one or a different one; there is nothing to be
	// greater than and no substring worth looking for.
	it('offers the ID only the two operators an identifier has', () => {
		const operator = conditionFields().find(
			(one) =>
				one.name === 'operator' &&
				((one.displayOptions?.show?.field ?? []) as string[]).includes('costCenterId'),
		);

		expect(optionValues(operator)).toEqual(['eq', 'ne']);
	});

	it('collects the ID in a box of its own, so it is never quoted as text', () => {
		const box = conditionFields().find(
			(one) =>
				one.name === 'guidValue' &&
				((one.displayOptions?.show?.field ?? []) as string[]).includes('costCenterId'),
		);

		expect(box?.type).toBe('string');
	});
});
