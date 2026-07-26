import type { IDataObject, IExecuteFunctions, INode, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeCategory } from '../resources/category/execute';
import { niboListRequest } from '../transport/paginate';

jest.mock('../transport/paginate');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;

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

function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][3] as unknown as IDataObject;
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The resource v0.7.0 exists for. Creating a schedule needs a category ID, and
 * until now there was no way to learn one from inside the node — which forced an
 * HTTP Request node to list them, the very thing this package removes.
 */
describe('executeCategory — Get Many', () => {
	it('reads the collection, ordered by the key that pages', async () => {
		await executeCategory.call(context({ returnAll: true }), 'category', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/categories');
		expect(listRequest.mock.calls[0][2]).toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeCategory.call(context({ returnAll: false, limit: 5 }), 'category', 'list');

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 5,
			failOnIncomplete: true,
		});
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeCategory.call(context({ returnAll: true }, 3), 'category', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('hands back the records as the API answered them', async () => {
		listRequest.mockResolvedValue({
			records: [{ id: 'a', name: 'Receita com vendas', type: 'in' }],
			count: 1,
		});

		const items = await executeCategory.call(context({ returnAll: true }), 'category', 'list');

		expect(items[0].json).toEqual({ id: 'a', name: 'Receita com vendas', type: 'in' });
	});

	it('flags the last item when the scan may be incomplete', async () => {
		listRequest.mockResolvedValue({
			records: [{ id: 'a' }, { id: 'b' }],
			count: 3,
			warning: 'this result is incomplete',
		});

		const items = await executeCategory.call(
			context({ returnAll: true, options: { failOnIncomplete: false } }),
			'category',
			'list',
		);

		expect(items[1].json._niboPaginationWarning).toContain('incomplete');
	});

	// `GET /categories/{id}` is a 404 and `POST /categories` was never measured,
	// so neither is offered — and asking for one says so rather than trying.
	it.each(['get', 'create', 'update', 'delete'])('refuses "%s", which this API has no route for', async (operation) => {
		await expect(
			executeCategory.call(context({}), 'category', operation),
		).rejects.toThrow(new RegExp(operation));
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeCategory.call(context({}), 'costCenter', 'list')).rejects.toThrow(
			/costCenter/,
		);
	});
});

describe('executeCategory — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[], rest: IDataObject = {}) {
		return context({ returnAll: true, filters: { conditions }, ...rest });
	}

	// The one someone actually wants here: only the revenue ones.
	it('writes the closed list as the quoted literal the API takes', async () => {
		await executeCategory.call(
			withConditions([{ field: 'type', operator: 'eq', optionsValue: 'in' }]),
			'category',
			'list',
		);

		expect(filterSent()).toBe("type eq 'in'");
	});

	it('searches the name ignoring case', async () => {
		await executeCategory.call(
			withConditions([{ field: 'name', operator: 'containsIgnoreCase', value: 'RECEITA' }]),
			'category',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(name),'receita')");
	});

	it('joins a list with the conditions around it', async () => {
		await executeCategory.call(
			withConditions([
				{ field: 'type', operator: 'eq', optionsValue: 'out' },
				{ field: 'referenceCode', operator: 'startswith', value: '3.1' },
			]),
			'category',
			'list',
		);

		expect(filterSent()).toBe("type eq 'out' and startswith(referenceCode,'3.1')");
	});

	it('fails the item on a field this menu does not have', async () => {
		const failure = executeCategory.call(
			withConditions([{ field: 'isDeleted', operator: 'eq', booleanValue: false }]),
			'category',
			'list',
		);

		await expect(failure).rejects.toThrow(/isDeleted/);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
	});
});

/**
 * The dropdown on the schedule's Category ID field.
 *
 * It does not go through the transport, and that is not laziness: in
 * `ILoadOptionsFunctions` the signature is `getNodeParameter(name, fallback)`,
 * with no item index, while the transport calls `(name, index, fallback)` —
 * passing one through the other would read the index as the fallback. Measured
 * in the n8n 2.18.5 source on 2026-07-26, along with the two facts this whole
 * slice rests on: the context is built from the editor's CURRENT parameters, so
 * it sees the resource being chosen; and 130 nodes shipping with that version
 * load options on a field nested in a fixedCollection, as this one is.
 */
describe('loadScheduleCategories — the list on the Category field', () => {
	const REVENUE = { id: 'rev', name: 'Receita com vendas', referenceCode: '1.1.001', type: 'in' };
	const COST = { id: 'cost', name: 'Custos produto vendido', referenceCode: '2.1.001', type: 'out' };

	let request: jest.Mock;

	/** The editor's context for a field being loaded, in the mode that has a credential */
	function loadContext(parameters: IDataObject, items: IDataObject[] = [REVENUE]) {
		request = jest.fn().mockResolvedValue({ items, count: items.length });

		return {
			getCurrentNodeParameter: (name: string) => parameters[name],
			getNode: () => NODE,
			getCredentials: jest.fn().mockResolvedValue({ baseUrl: '' }),
			helpers: { httpRequestWithAuthentication: request },
		} as never;
	}

	/** The query string of the call the loader made */
	function querySent(): IDataObject {
		return request.mock.calls[0][1].qs as IDataObject;
	}

	it.each([
		['creditSchedule', "type eq 'in'"],
		['debitSchedule', "type eq 'out'"],
	])('asks %s only for the categories that fit it', async (resource, filter) => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(loadContext({ authMode: 'credential', resource }));

		expect(querySent().$filter).toBe(filter);
	});

	it('names the credential when it calls, so the token comes from it', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(request.mock.calls[0][0]).toBe('niboEmpresasApi');
	});

	// A chart of accounts is read by its code, not alphabetically.
	it('orders the list by reference code', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const list = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [
				{ id: 'c', name: 'Água', referenceCode: '3.1.009', type: 'out' },
				{ id: 'a', name: 'Receita com vendas', referenceCode: '1.1.001', type: 'in' },
				{ id: 'b', name: 'Receita com serviços', referenceCode: '1.1.002', type: 'in' },
			]),
		);

		expect(list.map((option) => option.value)).toEqual(['a', 'b', 'c']);
	});

	it('shows the code next to the name, and hands back the ID', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const [option] = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [REVENUE]),
		);

		expect(option.name).toContain('1.1.001');
		expect(option.name).toContain('Receita com vendas');
		expect(option.value).toBe('rev');
	});

	// A category the organization typed itself may have no code at all, and it is
	// still a category somebody has to be able to pick.
	it('keeps a category with no reference code, and puts it last', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const list = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [
				{ id: 'none', name: 'Sem código', type: 'in' },
				REVENUE,
			]),
		);

		expect(list.map((option) => option.value)).toEqual(['rev', 'none']);
		expect(list[1].name).toBe('Sem código');
	});

	it('answers an empty list rather than failing when the API has nothing', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const list = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, []),
		);

		expect(list).toEqual([]);
	});

	/**
	 * The mode where it cannot work, and the message that has to say why. The
	 * shallow reason is that the list is loaded with the credential and there is
	 * none here; the one that matters is that a category ID belongs to one
	 * organization, so a category picked on screen would be right for one company
	 * of a portfolio and wrong for all the others.
	 */
	it('refuses in the per-item token mode, and points at the resource instead', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const failure = loadScheduleCategories.call(
			loadContext({ authMode: 'field', resource: 'creditSchedule' }),
		);

		await expect(failure).rejects.toThrow(/per item/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/Category/),
		});
		expect(request).not.toHaveBeenCalled();
	});
});

describe('NiboEmpresas — Category on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forCategory(name: string): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('category'),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map((option) => option.value as string);
	}

	it('joins the menu in its alphabetical place', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([
			'Category',
			'Credit Schedule',
			'Customer',
			'Debit Schedule',
			'Employee',
			'Partner',
			'Supplier',
		]);
	});

	// A resource missing from the credential's list is a resource with no
	// credential at all — the cost of the trick that puts Authentication first.
	it('is named in the credential like every other resource', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('category');
	});

	it('offers one operation, because the API has one route', () => {
		const operations = forCategory('operation');

		expect(optionValues(operations)).toEqual(['list']);
		expect(operations?.default).toBe('list');
	});

	it('offers Return All and Limit, as every scan does', () => {
		for (const name of ['returnAll', 'limit']) {
			expect(forCategory(name)?.displayOptions?.show?.operation).toEqual(['list']);
		}
	});

	/** The fields of one row of this resource's condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (forCategory('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(
			['group/name', 'isEditable', 'name', 'referenceCode', 'type'].sort(),
		);
	});

	// A 500: the field is not on this view at all.
	it('never offers isDeleted', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field)).not.toContain('isDeleted');
	});

	it('collects the type as a list of the two words the API uses', () => {
		const box = conditionFields().find(
			(one) =>
				one.name === 'optionsValue' &&
				((one.displayOptions?.show?.field ?? []) as string[]).includes('type'),
		);

		expect(box?.type).toBe('options');
		expect(optionValues(box).sort()).toEqual(['in', 'out']);
	});
});
