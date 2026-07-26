import type { IDataObject, IExecuteFunctions, INode, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeCategory } from '../resources/category/execute';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

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
	apiRequest.mockReset();
	apiRequest.mockResolvedValue([]);
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/** A GUID with the shape the API insists on, for the reads that take one */
const GUID = 'fcc630b8-e63a-44d2-aa55-981aec3d8d02';

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

	/**
	 * The two the API genuinely has no route for, in either path — measured on
	 * 2026-07-26: `PUT /schedules/categories/{id}` and
	 * `DELETE /schedules/categories/{id}` are both 404, as they are under
	 * `/categories`. That is what makes creating a category an act with no way
	 * back, and it is why these two are not on the menu.
	 */
	it.each(['update', 'delete'])('refuses "%s", which this API has no route for', async (operation) => {
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

/**
 * Get, and the door it goes through.
 *
 * `GET /categories/{id}` is a 404 and always was — that measurement was right.
 * What was wrong was the conclusion drawn from it: the get-by-id of this API is
 * `GET /schedules/categories/{id}`, and it answers 200. It is still not what
 * this operation calls, and the reason is the asymmetry measured on 2026-07-26:
 * that door drops `subgroupId` and `subgroupName` from the record, so Get and
 * Get Many would answer two different shapes of the same category. The third
 * door — the list filtered by `id eq` — answers exactly what Get Many answers.
 */
describe('executeCategory — Get', () => {
	it('reads the one record through the list, so it matches what Get Many answers', async () => {
		listRequest.mockResolvedValue({ records: [{ id: GUID, name: 'Água' }], count: 1 });

		const items = await executeCategory.call(context({ categoryId: GUID }), 'category', 'get');

		expect(listRequest.mock.calls[0][1]).toBe('/categories');
		expect(items[0].json).toEqual({ id: GUID, name: 'Água' });
	});

	/**
	 * Bare, and this is the one place in this API where quoting is wrong.
	 * `id eq '<guid>'` answers 500 — *Found operand types 'Edm.Guid' and
	 * 'Edm.String'* — which is the opposite of what every text filter here
	 * requires. Measured on 2026-07-26, and again on the cost centres.
	 */
	it('writes the GUID without quotes, which is what this comparison takes', async () => {
		listRequest.mockResolvedValue({ records: [{ id: GUID }], count: 1 });

		await executeCategory.call(context({ categoryId: GUID }), 'category', 'get');

		expect(optionsSentToTransport().filter).toBe(`id eq ${GUID}`);
	});

	// The 500 above is reachable from any pasted value, so the shape is checked
	// here rather than found out from the server.
	it('refuses an ID that is not a GUID instead of sending a filter the API answers 500 to', async () => {
		const failure = executeCategory.call(context({ categoryId: 'Água' }), 'category', 'get');

		await expect(failure).rejects.toThrow(/GUID/i);
		expect(listRequest).not.toHaveBeenCalled();
	});

	it('refuses an empty ID', async () => {
		await expect(executeCategory.call(context({}), 'category', 'get')).rejects.toThrow(/ID/);
		expect(listRequest).not.toHaveBeenCalled();
	});

	/**
	 * A filtered list that matches nothing is a 200 with an empty envelope — for
	 * the API that is not an error at all. For an operation that asks for one
	 * record by ID it is, and this is where it becomes one.
	 */
	it('turns an empty answer into "not found", which is what this operation asked about', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		await expect(
			executeCategory.call(context({ categoryId: GUID }), 'category', 'get'),
		).rejects.toThrow(new RegExp(GUID));
	});
});

/**
 * The groups of the chart of accounts — five on the test company, and the level
 * `GET /categories` never shows.
 */
describe('executeCategory — Get Many Groups', () => {
	it('reads the groups where the writing family lives, not under /categories', async () => {
		await executeCategory.call(context({ returnAll: true }), 'category', 'groups');

		expect(listRequest.mock.calls[0][1]).toBe('/schedules/categories/groups');
	});

	/**
	 * `$skip` with no `$orderby` is a 500 here as it is everywhere else in this
	 * API, so a key is always sent — and which key was measured on 2026-07-26,
	 * because two of the obvious ones are wrong in different ways:
	 * `$orderby=id` answers 200 and **does not sort**, which is a paging key that
	 * silently loses records. `referenceCode` sorts, is unique across the groups,
	 * and puts them in the order a chart of accounts is read in.
	 */
	it('pages by the key that was measured to sort, never by id', async () => {
		await executeCategory.call(context({ returnAll: true }), 'category', 'groups');

		expect(listRequest.mock.calls[0][2]).toBe('referenceCode');
		expect(listRequest.mock.calls[0][2]).not.toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeCategory.call(context({ returnAll: false, limit: 3 }), 'category', 'groups');

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 3,
			failOnIncomplete: true,
		});
	});

	it('hands back one item per group, out of the envelope', async () => {
		listRequest.mockResolvedValue({
			records: [
				{ id: 'a', name: 'Receitas operacionais', referenceCode: '1' },
				{ id: 'b', name: 'Custos operacionais', referenceCode: '2' },
			],
			count: 2,
		});

		const items = await executeCategory.call(context({ returnAll: true }), 'category', 'groups');

		expect(items.map((item) => item.json.name)).toEqual([
			'Receitas operacionais',
			'Custos operacionais',
		]);
	});

	// The assisted filter was measured against `/categories` and nothing else.
	it('sends no filter, because this menu was never measured against this route', async () => {
		await executeCategory.call(
			context({ returnAll: true, filters: { conditions: [{ field: 'name', operator: 'eq', value: 'x' }] } }),
			'category',
			'groups',
		);

		expect(optionsSentToTransport().filter).toBeUndefined();
	});
});

/**
 * The whole hierarchy, and the only place the subgroups exist.
 *
 * Measured on 2026-07-26: three subgroups on the test company, and not one of
 * them appears in `GET /categories` — only the `subgroupId` of the categories
 * inside them. So this is not a convenience view of the list; it is the level
 * the list cannot show.
 */
describe('executeCategory — Get Tree', () => {
	const TREE = [
		{ id: 'g1', name: 'Receitas operacionais', referenceCode: 1, children: [] },
		{ id: 'g2', name: 'Custos operacionais', referenceCode: 2, children: [] },
	];

	it('reads the tree and never goes through the pager', async () => {
		apiRequest.mockResolvedValue(TREE);

		await executeCategory.call(context({}), 'category', 'tree');

		expect(apiRequest.mock.calls[0][1]).toBe('GET');
		expect(apiRequest.mock.calls[0][2]).toBe('/schedules/categories/tree');
		expect(listRequest).not.toHaveBeenCalled();
	});

	/**
	 * A bare array, like `/employees` and `/partners` — no `{items, count}` in
	 * sight. Looking for `items` here would answer nothing at all, every time.
	 */
	it('takes the bare array the route answers, one item per group', async () => {
		apiRequest.mockResolvedValue(TREE);

		const items = await executeCategory.call(context({}), 'category', 'tree');

		expect(items).toHaveLength(2);
		expect(items[0].json).toEqual(TREE[0]);
	});

	it('sends neither flag when neither was turned on', async () => {
		apiRequest.mockResolvedValue(TREE);

		await executeCategory.call(context({}), 'category', 'tree');

		expect(apiRequest.mock.calls[0][3]).toEqual({});
	});

	/**
	 * Both were measured to answer 200 on 2026-07-26, and the second filters for
	 * real: it drops interest, fines and "Outras receitas" from the answer, and
	 * shows a subgroup the call without it did not.
	 */
	it('sends each flag under the name the API knows it by, only when it is on', async () => {
		apiRequest.mockResolvedValue(TREE);

		await executeCategory.call(
			context({ includeDeleted: true, nfseValueOnly: true }),
			'category',
			'tree',
		);

		expect(apiRequest.mock.calls[0][3]).toEqual({
			IncludeDeletedCategory: true,
			CanComposeNFSeValueOnly: true,
		});
	});

	it('fails rather than guessing when the route answers something that is not a tree', async () => {
		apiRequest.mockResolvedValue({ items: [] });

		await expect(executeCategory.call(context({}), 'category', 'tree')).rejects.toThrow(/tree/i);
	});
});

/**
 * The operation this project spent three versions believing did not exist.
 *
 * `POST /categories` is a 404, which was measured and true. `POST
 * /schedules/categories` answers **200** and creates the category, which was
 * never asked. It takes `categoryGroupId`, `name` and `type`, with `subGroupId`
 * optional, and answers a bare GUID with no envelope around it.
 */
describe('executeCategory — Create', () => {
	const CREATED = { id: GUID, name: 'Consultoria', type: 'out' };

	function creating(parameters: IDataObject = {}) {
		apiRequest.mockResolvedValue(GUID);
		listRequest.mockResolvedValue({ records: [CREATED], count: 1 });

		return context({
			categoryGroupId: 'group-1',
			name: 'Consultoria',
			type: 'out',
			...parameters,
		});
	}

	/** The body of the POST the handler sent */
	function bodySent(): IDataObject {
		return apiRequest.mock.calls[0][4] as IDataObject;
	}

	it('writes where the writing family lives, never under /categories', async () => {
		await executeCategory.call(creating(), 'category', 'create');

		expect(apiRequest.mock.calls[0][1]).toBe('POST');
		expect(apiRequest.mock.calls[0][2]).toBe('/schedules/categories');
	});

	it('sends the three fields the API asks for', async () => {
		await executeCategory.call(creating(), 'category', 'create');

		expect(bodySent()).toEqual({
			categoryGroupId: 'group-1',
			name: 'Consultoria',
			type: 'out',
		});
	});

	/**
	 * Measured on 2026-07-26, and it cost the test company a category nobody can
	 * ever remove: a `subGroupId` that does not exist answers 500 *"Subgroupo não
	 * encontrado."*, and a real one is accepted — the category is born inside the
	 * subgroup, and comes back from `/categories` with `subgroupId` and
	 * `subgroupName` on it.
	 */
	it('sends subGroupId only when a subgroup was chosen', async () => {
		await executeCategory.call(
			creating({ additionalFields: { subGroupId: 'sub-1' } }),
			'category',
			'create',
		);

		expect(bodySent().subGroupId).toBe('sub-1');
	});

	it('leaves subGroupId out of the body when none was chosen', async () => {
		await executeCategory.call(creating({ additionalFields: {} }), 'category', 'create');

		expect(bodySent()).not.toHaveProperty('subGroupId');
	});

	/**
	 * The API answers the creation with the GUID and nothing else — no record, no
	 * envelope. A workflow gets the whole record anyway, which is what Employee
	 * and Partner have done since 0.4.4, and it is read through the same door Get
	 * uses so that the two answer the same shape.
	 */
	it('reads the new record back, because the API answers a bare GUID', async () => {
		const items = await executeCategory.call(creating(), 'category', 'create');

		expect(optionsSentToTransport().filter).toBe(`id eq ${GUID}`);
		expect(items[0].json).toEqual(CREATED);
	});

	it('takes the GUID out of a data envelope too, if one ever arrives', async () => {
		apiRequest.mockResolvedValue({ data: GUID });
		listRequest.mockResolvedValue({ records: [CREATED], count: 1 });

		const items = await executeCategory.call(creating(), 'category', 'create');

		expect(items[0].json).toEqual(CREATED);
	});

	it('says so when the API answers a creation with nothing it can read as an ID', async () => {
		const ctx = creating();
		apiRequest.mockResolvedValue({ something: 'else' });

		await expect(executeCategory.call(ctx, 'category', 'create')).rejects.toThrow(
			/did not say what it created/i,
		);
	});

	it.each([
		['categoryGroupId', /group/i],
		['name', /name/i],
	])('refuses a creation with no %s, before it is written', async (parameter, said) => {
		const failure = executeCategory.call(creating({ [parameter]: '' }), 'category', 'create');

		await expect(failure).rejects.toThrow(said);
		expect(apiRequest).not.toHaveBeenCalled();
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
	const REVENUE = {
		id: 'rev',
		name: 'Receita com vendas',
		referenceCode: '1.1.001',
		type: 'in',
		group: { name: 'Receitas operacionais' },
	};
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

	/**
	 * The half that fits this kind of schedule, minus the automatic families that
	 * cannot end in a schedule anybody can read.
	 *
	 * Measured on the cobaia on 2026-07-26, one representative of each family,
	 * created for real and looked at on Nibo's own screen:
	 *
	 * - **Retentions** (`groupType` 3, the fourteen "Retido sobre…") are accepted
	 *   by the API and then **show up broken**: the schedule displays one category
	 *   inside it and another, without a value, outside.
	 * - **"Outras receitas"** (7) does the same, and it was the one that caught
	 *   this — a schedule of Alvaro's, in the browser.
	 * - **Discounts** (1) are refused by the API itself, on both sides:
	 *   *"Categoria de juros, multa ou desconto invalida"*.
	 *
	 * Filtered on the server, in the call that was already being made. The
	 * operator was measured too: `groupType ne 1 and groupType ne 3` answers 200
	 * on this API, which does not accept every OData expression.
	 */
	it.each([
		['creditSchedule', "type eq 'in' and groupType ne 1 and groupType ne 3 and groupType ne 7"],
		['debitSchedule', "type eq 'out' and groupType ne 1 and groupType ne 3 and groupType ne 7"],
	])('asks %s only for the categories that fit it and can be scheduled', async (resource, filter) => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(loadContext({ authMode: 'credential', resource }));

		expect(querySent().$filter).toBe(filter);
	});

	// One call, as before: the exclusion rides along with the filter that was
	// already there rather than costing a second read or a pass in the browser.
	it('leaves them out on the server, in the one call it already made', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(request).toHaveBeenCalledTimes(1);
	});

	/**
	 * And the family that stays, which is what keeps this a measurement rather
	 * than a hunch: interest (`groupType` 2, Juros Recebidos and Juros Pagos) was
	 * created for real and reads correctly on the Nibo screen, so it goes on being
	 * offered even though Nibo owns it and nobody can edit it.
	 */
	it('goes on offering the interest categories, which were measured to work', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(querySent().$filter).not.toContain('groupType ne 2');
	});

	it('names the credential when it calls, so the token comes from it', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(request.mock.calls[0][0]).toBe('niboEmpresasApi');
	});

	// A chart of accounts is read by its code, not alphabetically.
	/**
	 * The order is the server's, and the key says what a person means by it:
	 * grouped, then in whatever order the organization dragged them into on the
	 * Nibo screen, then by name.
	 *
	 * `group/referenceCode` is in there and never appears on screen. It is the
	 * only thing that puts Receitas before Custos before Despesas — the sequence
	 * a chart of accounts is read in — where sorting the group names as text
	 * would open on "Atividades de financiamento".
	 */
	it('asks the server for the categories grouped and in the organization order', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }),
		);

		expect(querySent().$orderby).toBe('group/referenceCode,order,name');
	});

	// Whatever the server sends back is the order shown: re-sorting it here
	// would throw away the `order` field, which is the one thing that carries
	// what the organization itself decided.
	it('keeps the order the API answered with, without re-sorting it', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const list = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [
				{ id: 'c', name: 'Água', type: 'out', group: { name: 'Despesas operacionais' } },
				{ id: 'a', name: 'Receita com vendas', type: 'in', group: { name: 'Receitas operacionais' } },
				{ id: 'b', name: 'Receita com serviços', type: 'in', group: { name: 'Receitas operacionais' } },
			]),
		);

		expect(list.map((option) => option.value)).toEqual(['c', 'a', 'b']);
	});

	/**
	 * The name alone, and the group underneath it — the two things the Nibo
	 * screen itself shows.
	 *
	 * `referenceCode` used to be in front of the name, and it was a mistake:
	 * it is an internal code of the standard chart of accounts that appears
	 * nowhere in Nibo, and unfamiliar numbers in front of familiar names are
	 * what made a working list look like another company's.
	 */
	it('shows the name alone, with the group under it', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const [option] = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [REVENUE]),
		);

		expect(option.name).toBe('Receita com vendas');
		expect(option.description).toBe('Receitas operacionais');
		expect(option.value).toBe('rev');
	});

	it('never puts the reference code on the screen, wherever it appears in the data', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const list = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [REVENUE]),
		);

		expect(JSON.stringify(list)).not.toContain('1.1.001');
	});

	it('still lists a category that carries no group at all', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const [option] = await loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, [
				{ id: 'none', name: 'Sem grupo', type: 'in' },
			]),
		);

		expect(option.name).toBe('Sem grupo');
		expect(option.description).toBeUndefined();
	});

	/**
	 * An empty box explains nothing, and this list has a specific reason for
	 * coming back empty that nobody can see: it is filtered to the half that
	 * fits the schedule, and it belongs to whichever credential is selected
	 * above. Both facts are invisible on the screen, so the emptiness has to
	 * carry them.
	 *
	 * Changed in 0.7.2, after an afternoon lost to exactly this class of
	 * confusion — a list that looks the same everywhere because every Nibo
	 * organization starts from the same chart of accounts.
	 */
	it('explains an empty answer instead of showing an empty box', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const failure = loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'creditSchedule' }, []),
		);

		await expect(failure).rejects.toThrow(/no categor/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/credential/i),
		});
	});

	it('names the kind it was looking for, so the filter is not a mystery', async () => {
		const { loadScheduleCategories } = await import('../resources/category/load');
		const failure = loadScheduleCategories.call(
			loadContext({ authMode: 'credential', resource: 'debitSchedule' }, []),
		);

		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/expense/i),
		});
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

/**
 * The two lists of the creation form.
 *
 * Both read straight from the API for the same reason `loadScheduleCategories`
 * does: in `ILoadOptionsFunctions` there is no item index, so routing through
 * the transport would read the index as the fallback.
 */
describe('the lists of the Category creation form', () => {
	const GROUPS = [
		{ id: 'g1', name: 'Receitas operacionais', referenceCode: '1' },
		{ id: 'g3', name: 'Despesas operacionais e outras receitas', referenceCode: '3' },
	];

	/**
	 * The tree as the API answers it, measured on 2026-07-26: a bare array of
	 * groups, each with `children`, and a subgroup is a child carrying
	 * `isSubgroup: true` and children of its own.
	 */
	const TREE = [
		{
			id: 'g1',
			name: 'Receitas operacionais',
			referenceCode: 1,
			children: [{ id: 'c1', name: 'Receita com vendas', isSubgroup: false }],
		},
		{
			id: 'g3',
			name: 'Despesas operacionais e outras receitas',
			referenceCode: 3,
			children: [
				{ id: 'c2', name: 'Água', isSubgroup: false },
				{ id: 's1', name: 'Impostos retidos sobre pagamentos', isSubgroup: true, children: [] },
				{ id: 's2', name: 'Pagamento de impostos retidos', isSubgroup: true, children: [] },
			],
		},
	];

	let request: jest.Mock;

	function loadContext(parameters: IDataObject, answer: unknown) {
		request = jest.fn().mockResolvedValue(answer);

		return {
			getCurrentNodeParameter: (name: string) => parameters[name],
			getNode: () => NODE,
			getCredentials: jest.fn().mockResolvedValue({ baseUrl: '' }),
			helpers: { httpRequestWithAuthentication: request },
		} as never;
	}

	describe('loadCategoryGroups', () => {
		it('reads the groups, in the order a chart of accounts is read in', async () => {
			const { loadCategoryGroups } = await import('../resources/category/load');
			const list = await loadCategoryGroups.call(
				loadContext({ authMode: 'credential' }, { items: GROUPS, count: 2 }),
			);

			expect(request.mock.calls[0][1].url).toContain('/schedules/categories/groups');
			expect(request.mock.calls[0][1].qs.$orderby).toBe('referenceCode');
			expect(list.map((option) => option.value)).toEqual(['g1', 'g3']);
			expect(list[0].name).toBe('Receitas operacionais');
		});

		it('names the credential when it calls, so the token comes from it', async () => {
			const { loadCategoryGroups } = await import('../resources/category/load');
			await loadCategoryGroups.call(
				loadContext({ authMode: 'credential' }, { items: GROUPS, count: 2 }),
			);

			expect(request.mock.calls[0][0]).toBe('niboEmpresasApi');
		});

		/**
		 * A group ID belongs to one organization, exactly as a category ID does —
		 * so a group picked on the screen would be right for one company of a
		 * portfolio and wrong for every other one. The rule 0.7.0 set, applied to
		 * the fields 0.9.0 adds.
		 */
		it('refuses in the per-item token mode, and points at the operation that reads the ID', async () => {
			const { loadCategoryGroups } = await import('../resources/category/load');
			const failure = loadCategoryGroups.call(loadContext({ authMode: 'field' }, {}));

			await expect(failure).rejects.toThrow(/per item/i);
			await expect(failure).rejects.toMatchObject({
				description: expect.stringMatching(/Get Many Groups/),
			});
			expect(request).not.toHaveBeenCalled();
		});

		it('explains an empty answer instead of showing an empty box', async () => {
			const { loadCategoryGroups } = await import('../resources/category/load');
			const failure = loadCategoryGroups.call(
				loadContext({ authMode: 'credential' }, { items: [], count: 0 }),
			);

			await expect(failure).rejects.toThrow(/no group/i);
		});
	});

	describe('loadCategorySubgroups', () => {
		it('offers the subgroups of the chosen group, and none of its categories', async () => {
			const { loadCategorySubgroups } = await import('../resources/category/load');
			const list = await loadCategorySubgroups.call(
				loadContext({ authMode: 'credential', categoryGroupId: 'g3' }, TREE),
			);

			expect(list.map((option) => option.value)).toEqual(['s1', 's2']);
			expect(list[0].name).toBe('Impostos retidos sobre pagamentos');
		});

		/**
		 * The tree is the only place a subgroup exists: measured on 2026-07-26, the
		 * three subgroups of the test company appear in no `GET /categories` answer
		 * — only the `subgroupId` of the categories inside them.
		 */
		it('reads the tree, because nothing else lists a subgroup', async () => {
			const { loadCategorySubgroups } = await import('../resources/category/load');
			await loadCategorySubgroups.call(
				loadContext({ authMode: 'credential', categoryGroupId: 'g3' }, TREE),
			);

			expect(request.mock.calls[0][1].url).toContain('/schedules/categories/tree');
		});

		// A subgroup belongs to one group, so pairing it with another would be a
		// creation the screen offered and the API refuses.
		it('asks for the group first, rather than offering subgroups of every group', async () => {
			const { loadCategorySubgroups } = await import('../resources/category/load');
			const failure = loadCategorySubgroups.call(
				loadContext({ authMode: 'credential', categoryGroupId: '' }, TREE),
			);

			await expect(failure).rejects.toThrow(/group/i);
			expect(request).not.toHaveBeenCalled();
		});

		it('says so when the chosen group has no subgroup at all', async () => {
			const { loadCategorySubgroups } = await import('../resources/category/load');
			const failure = loadCategorySubgroups.call(
				loadContext({ authMode: 'credential', categoryGroupId: 'g1' }, TREE),
			);

			await expect(failure).rejects.toThrow(/no subgroup/i);
		});

		it('refuses in the per-item token mode too', async () => {
			const { loadCategorySubgroups } = await import('../resources/category/load');
			const failure = loadCategorySubgroups.call(
				loadContext({ authMode: 'field', categoryGroupId: 'g3' }, TREE),
			);

			await expect(failure).rejects.toThrow(/per item/i);
			expect(request).not.toHaveBeenCalled();
		});
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

	/**
	 * The menu reads as three families instead of seven names in a row, and the
	 * Actions tab of the editor reads the same way — it is built by walking these
	 * options in the order they are declared, and it turns each of them into a
	 * heading ("Contact - Customer actions"). Read in the n8n 2.18.5 source on
	 * 2026-07-26: actions are never re-sorted there, so this list is the order.
	 *
	 * The prefix does the grouping without costing the alphabetical order the n8n
	 * linter wants, which is the whole reason it is a prefix and not a hand-made
	 * order: Category < Contact < Schedule.
	 */
	it('joins a menu that reads by family, and is still alphabetical', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([
			'Category',
			'Contact - Customer',
			'Contact - Employee',
			'Contact - Partner',
			'Contact - Supplier',
			'Schedule - Credit',
			'Schedule - Debit',
		]);
		expect(names).toEqual([...names].sort());
	});

	// A label is a word; a `value` is a contract. The words above changed in
	// 0.8.2 and these did not, which is why no saved workflow noticed.
	it('renames nothing a saved workflow depends on', () => {
		const values = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.value,
		);

		expect(values).toEqual([
			'category',
			'customer',
			'employee',
			'partner',
			'supplier',
			'creditSchedule',
			'debitSchedule',
		]);
	});

	// A resource missing from the credential's list is a resource with no
	// credential at all — the cost of the trick that puts Authentication first.
	it('is named in the credential like every other resource', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('category');
	});

	/**
	 * Four, where 0.8.2 offered one. The catalogue had `POST`, `PUT`, `DELETE`
	 * and `GET /categories/{id}` all marked 404 and concluded "a category is
	 * read-only in this API". The 404s were real; the conclusion was not — the
	 * writing family lives under `/schedules/categories`, and create, get-by-id,
	 * groups and tree all answer 200 there.
	 *
	 * Update and Delete are still absent, and that is not caution: they are 404
	 * in **both** paths, measured on 2026-07-26.
	 */
	it('offers the five operations the API was measured to answer, and no more', () => {
		const operations = forCategory('operation');

		expect(optionValues(operations)).toEqual(['create', 'get', 'list', 'groups', 'tree']);
		expect(operations?.default).toBe('list');
	});

	/**
	 * The one screen of this node that has to warn before the button rather than
	 * explain after it. `PUT` and `DELETE /schedules/categories/{id}` are both
	 * 404, in either path — so a category created with the wrong name stays, and
	 * the only place it can be fixed is Nibo's own screen.
	 */
	it('says on the screen that creating a category cannot be undone', () => {
		const notice = description.properties.find(
			(prop) =>
				prop.type === 'notice' &&
				((prop.displayOptions?.show?.operation ?? []) as string[]).includes('create') &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('category'),
		);

		expect(notice?.displayName).toMatch(/cannot be undone|no way back/i);
		expect(notice?.displayName).toMatch(/Nibo/);
	});

	it('asks for the group, the name and the type when creating', () => {
		for (const name of ['categoryGroupId', 'name', 'type']) {
			expect(forCategory(name)?.displayOptions?.show?.operation).toEqual(['create']);
			expect(forCategory(name)?.required).toBe(true);
		}
	});

	it('collects the type as the two words the API takes', () => {
		expect(optionValues(forCategory('type')).sort()).toEqual(['in', 'out']);
	});

	/**
	 * A subgroup is not needed for the operation to happen, so it lives in the
	 * menu — the rule §4.1 of the project's CLAUDE.md sets for the body of a node.
	 * It exists at all because it was measured, and that measurement cost the test
	 * company a second category that can never be removed.
	 */
	it('offers the subgroup in the menu, and depends the list on the chosen group', () => {
		const menu = forCategory('additionalFields');
		const subgroup = ((menu?.options ?? []) as INodeProperties[]).find(
			(option) => option.name === 'subGroupId',
		);

		expect(subgroup?.typeOptions?.loadOptionsMethod).toBe('loadCategorySubgroups');
		expect(subgroup?.typeOptions?.loadOptionsDependsOn).toContain('categoryGroupId');
	});

	it('leaves Update and Delete off the menu, being 404 in either path', () => {
		expect(optionValues(forCategory('operation'))).not.toContain('update');
		expect(optionValues(forCategory('operation'))).not.toContain('delete');
	});

	it('asks for an ID on Get, and only there', () => {
		expect(forCategory('categoryId')?.displayOptions?.show?.operation).toEqual(['get']);
		expect(forCategory('categoryId')?.required).toBe(true);
	});

	// Groups is a scan like any other: an envelope with a count, walked by pages.
	it('offers Return All and Limit on both scans', () => {
		for (const name of ['returnAll', 'limit']) {
			expect(forCategory(name)?.displayOptions?.show?.operation).toEqual(['list', 'groups']);
		}
	});

	it('offers the two tree flags on the tree alone', () => {
		for (const name of ['includeDeleted', 'nfseValueOnly']) {
			expect(forCategory(name)?.type).toBe('boolean');
			expect(forCategory(name)?.default).toBe(false);
			expect(forCategory(name)?.displayOptions?.show?.operation).toEqual(['tree']);
		}
	});

	// The assisted filter was measured against `/categories` and nowhere else.
	it('keeps the assisted filter on Get Many alone', () => {
		expect(forCategory('filters')?.displayOptions?.show?.operation).toEqual(['list']);
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
