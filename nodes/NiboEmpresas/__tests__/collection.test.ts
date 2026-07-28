import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeCollection } from '../resources/collection/execute';
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

const COLLECTION = 'c1a5e0d4-77b0-4f1a-9b3e-2a6a1d0f9c11';
const SCHEDULE = '04a6a2a9-ef71-4733-9ac7-33737ac4d40c';

/**
 * A record as the API really answers it — eighteen fields, five of which no
 * schema probe could have guessed, because the type the API exposes to `$filter`
 * is not the DTO it returns.
 */
const A_COLLECTION = {
	id: COLLECTION,
	stakeholderId: 'a0e6a4b2-1f11-4f0e-9c3d-5b7e2c8a4d10',
	scheduleId: SCHEDULE,
	debtor: { document: '000.000.000-00', name: 'Fulano de Tal' },
	beneficiary: { document: '00.000.000/0001-00', name: 'Empresa LTDA' },
	description: 'teste de boleto',
	createDate: '2026-07-28T01:00:00.000Z',
	createUser: 'Alvaro Castro',
	dueDate: '2026-08-04T00:00:00Z',
	value: 10,
	paidValue: 0,
	lasStatusChangeDate: '2026-07-28T01:00:00.000Z',
	status: { code: 1, description: 'Ativação pendente' },
	deliveryStatus: { code: 0, description: 'Não entregue' },
	accountantIntegrationStatus: { code: 0, description: 'Não integrada' },
	url: 'https://cobranca.nibo.com.br/…',
};

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
		logger: { warn: jest.fn() },
	} as unknown as IExecuteFunctions;
}

function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][3] as unknown as IDataObject;
}

/** Drives the real filter builder through the handler, and reads what it wrote */
function filterFrom(rows: IDataObject[]): string {
	return String(optionsSentToTransport().filter ?? '');
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	apiRequest.mockReset();
	apiRequest.mockResolvedValue(undefined);
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The charges — boleto and Pix — that Nibo issues from a receivable.
 *
 * Everything here was measured on 2026-07-28, and two of the measurements only
 * exist because the test organization **cannot issue charges at all**: it has no
 * collection profile, and a profile ties a bank provider to the company. The
 * schema came from the empty collection there; the record, the status codes and
 * the public link came from reading a production organization.
 */
describe('executeCollection — Get Many', () => {
	it('reads the collection under the /public/ prefix, which is unique in this API', async () => {
		await executeCollection.call(context({ returnAll: true }), 'collection', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/public/collections');
	});

	/**
	 * `collectionId` is the name anybody would try first, by analogy with
	 * `scheduleId` and `costCenterId`, and it answers HTTP 500. The key is `id`.
	 */
	it('pages by id, since collectionId does not exist', async () => {
		await executeCollection.call(context({ returnAll: true }), 'collection', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeCollection.call(
			context({ returnAll: false, limit: 3 }),
			'collection',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 3,
			failOnIncomplete: true,
		});
	});

	it('hands the record back whole, with the nested parts untouched', async () => {
		listRequest.mockResolvedValue({ records: [A_COLLECTION], count: 1 });

		const items = await executeCollection.call(
			context({ returnAll: true }),
			'collection',
			'list',
		);

		expect(items[0].json).toMatchObject({
			id: COLLECTION,
			status: { code: 1, description: 'Ativação pendente' },
			debtor: { name: 'Fulano de Tal' },
			url: A_COLLECTION.url,
		});
	});
});

/**
 * The filter menu, which is the whole of what this operation is used for — and
 * the place where a measurement of mine was wrong for a few hours.
 */
describe('executeCollection — the assisted filter', () => {
	function filtering(rows: IDataObject[]) {
		return executeCollection.call(
			context({ returnAll: true, filters: { conditions: rows }, filterCombine: 'and' }),
			'collection',
			'list',
		);
	}

	/**
	 * 🔴 The correction. Probed against an **empty** collection, `status/id`,
	 * `status/name` and `status/value` all answered *"Could not find a property"*,
	 * and this project briefly concluded that a charge could not be filtered by
	 * its status — the one filter everybody wants. `status/code` was never tried.
	 * Against real data it answers 200.
	 *
	 * And the literal goes **bare**: `status/code eq '3'` is a 500 about
	 * incompatible types.
	 */
	it('filters by status through status/code, with the literal bare', async () => {
		await filtering([{ field: 'status/code', operator: 'eq', optionsValue: '3' }]);

		expect(filterFrom([])).toBe('status/code eq 3');
	});

	it('filters by the delivery state the same way', async () => {
		await filtering([{ field: 'deliveryStatus/code', operator: 'ne', optionsValue: '0' }]);

		expect(filterFrom([])).toBe('deliveryStatus/code ne 0');
	});

	/**
	 * The typo is the API's own: the property is `lasStatusChangeDate`, missing
	 * the `t` of "last". Writing it correctly answers 500. So the wrong spelling
	 * is what travels, and the label on screen is the right one.
	 */
	it('sends the misspelling the API insists on', async () => {
		await filtering([
			{ field: 'lasStatusChangeDate', operator: 'ge', dateValue: '2026-01-01' },
		]);

		expect(filterFrom([])).toBe('lasStatusChangeDate ge 2026-01-01');
	});

	it('compares a GUID bare, which is how this API compares an ID column', async () => {
		await filtering([{ field: 'scheduleId', operator: 'eq', guidValue: SCHEDULE }]);

		expect(filterFrom([])).toBe(`scheduleId eq ${SCHEDULE}`);
	});

	// The payer is the one thing a person searches a charge by, and `debtor` is
	// where the API keeps it — not in any of the names one would guess.
	it('searches the payer by the nested path the record really has', async () => {
		await filtering([{ field: 'debtor/name', operator: 'contains', value: 'Fulano' }]);

		expect(filterFrom([])).toBe("contains(debtor/name,'Fulano')");
	});
});

/**
 * There is no get-by-id: `GET /public/collections/{id}` is a 404, and so is
 * `/collections/{id}`. The way to one record is the list filtered by its ID —
 * the same door Category has used since 0.9.0.
 */
describe('executeCollection — Get', () => {
	function getting(id: string = COLLECTION) {
		return executeCollection.call(context({ collectionId: id }), 'collection', 'get');
	}

	it('reads the record through the list filtered by ID, never through a get-by-id', async () => {
		listRequest.mockResolvedValue({ records: [A_COLLECTION], count: 1 });

		await getting();

		expect(listRequest.mock.calls[0][1]).toBe('/public/collections');
		expect(optionsSentToTransport().filter).toBe(`id eq ${COLLECTION}`);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('hands back the one record, not a list of one', async () => {
		listRequest.mockResolvedValue({ records: [A_COLLECTION], count: 1 });

		const items = await getting();

		expect(items).toHaveLength(1);
		expect(items[0].json.id).toBe(COLLECTION);
	});

	/**
	 * An empty envelope is not an error for the API — a filter matched nothing —
	 * but for an operation that asked for one record by ID it is exactly what
	 * "not found" means, and it is said here.
	 */
	it('says not found, with the ID, when the filter matches nothing', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		const failure = getting();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(new RegExp(COLLECTION));
	});

	it('refuses an empty ID before reading anything', async () => {
		const failure = getting('   ');

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(listRequest).not.toHaveBeenCalled();
	});
});

/**
 * The profiles, and the reason this operation exists at all: a profile is
 * **obligatory** to issue a charge, it comes from nowhere else, and listing them
 * is the only way to find out whether an organization can issue one. That is how
 * the test company was found not to.
 */
describe('executeCollection — Get Many Profiles', () => {
	function listingProfiles() {
		return executeCollection.call(context({}), 'collection', 'listProfiles');
	}

	it('reads the profiles from their own route', async () => {
		apiRequest.mockResolvedValue({ items: [{ id: 'p1', name: 'Perfil' }], count: 1 });

		await listingProfiles();

		const [, method, endpoint] = apiRequest.mock.calls[0];
		expect(method).toBe('GET');
		expect(endpoint).toBe('/public/collections-profiles');
	});

	it('unwraps the envelope into one item per profile', async () => {
		apiRequest.mockResolvedValue({
			items: [
				{ id: 'p1', name: 'Perfil', paymentMethods: [{ paymentForm: 'BankSlip' }] },
				{ id: 'p2', name: 'Outro' },
			],
			count: 2,
		});

		const items = await listingProfiles();

		expect(items).toHaveLength(2);
		expect(items[0].json).toMatchObject({ id: 'p1', paymentMethods: [{ paymentForm: 'BankSlip' }] });
	});

	/**
	 * An empty list is a 200, and it means something specific and actionable:
	 * this organization cannot issue charges at all. Handing back nothing would
	 * leave somebody looking for a bug in their filter.
	 */
	it('says the organization does not issue charges when there is no profile', async () => {
		apiRequest.mockResolvedValue({ items: [], count: 0 });

		const failure = listingProfiles();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/bank provider|provider/i),
		});
	});
});

describe('NiboEmpresas — what the Collection screen offers', () => {
	const description = new NiboEmpresas().description;

	function property(name: string): INodeProperties | undefined {
		return description.properties.find(
			(one) =>
				one.name === name &&
				((one.displayOptions?.show?.resource ?? []) as string[]).includes('collection'),
		);
	}

	function fieldMenu(): INodePropertyOptions[] {
		const field = ((property('filters')?.options ?? []) as Array<{ values?: INodeProperties[] }>)
			.flatMap((one) => one.values ?? [])
			.find((one) => one.name === 'field');

		return (field?.options ?? []) as INodePropertyOptions[];
	}

	it('joins the menu between Category and the contacts', () => {
		const names = (
			description.properties.find((one) => one.name === 'resource')?.options ?? []
		).map((one) => (one as INodePropertyOptions).name);

		expect(names).toContain('Collection');
		expect(names.indexOf('Collection')).toBe(names.indexOf('Category') + 1);
	});

	/**
	 * The closed menu, every path measured. `url`, `pdf` and `collectionProfileId`
	 * are deliberately absent: they filter, and filtering by them means nothing.
	 */
	it('offers only the paths the API was measured to filter on', () => {
		expect(fieldMenu().map((one) => one.value)).toEqual([
			'createDate',
			'deliveryStatus/code',
			'description',
			'dueDate',
			'id',
			'createUser',
			'lasStatusChangeDate',
			'paidValue',
			'debtor/document',
			'stakeholderId',
			'debtor/name',
			'scheduleId',
			'status/code',
			'value',
		]);
	});

	it('never offers url, pdf or the profile, which filter and mean nothing', () => {
		const paths = fieldMenu().map((one) => one.value);

		for (const useless of ['url', 'pdf', 'collectionProfileId']) {
			expect(paths).not.toContain(useless);
		}
	});

	it('keeps the field menu alphabetical by label, as the linter asks', () => {
		const labels = fieldMenu().map((one) => one.name);

		expect(labels).toEqual([...labels].sort());
	});

	/**
	 * The codes are not guessable — nobody knows that a paid charge is `3` — so
	 * they are a list rather than a box. The list is what was measured and says
	 * so, because a state that never appeared in the sample would otherwise look
	 * like a state that does not exist.
	 */
	it('offers the status as the named codes that were measured', () => {
		const value = ((property('filters')?.options ?? []) as Array<{ values?: INodeProperties[] }>)
			.flatMap((one) => one.values ?? [])
			.find(
				(one) =>
					one.name === 'optionsValue' &&
					(one.displayOptions?.show?.field ?? []).includes('status/code'),
			);

		expect((value?.options as INodePropertyOptions[]).map((one) => one.value)).toEqual([
			'-1',
			'1',
			'3',
		]);
	});

	it('says on that field that the measured codes are not the whole set', () => {
		const value = ((property('filters')?.options ?? []) as Array<{ values?: INodeProperties[] }>)
			.flatMap((one) => one.values ?? [])
			.find(
				(one) =>
					one.name === 'optionsValue' &&
					(one.displayOptions?.show?.field ?? []).includes('status/code'),
			);

		expect(value?.description).toMatch(/Filter \(OData\)/);
	});

	/**
	 * Measured with a bare fetch: the address answers 200 `text/html` with no
	 * token, no cookie and no header of any kind. Whoever holds the link holds
	 * the charge, and a list that handed it over silently would be the worse of
	 * the two options.
	 */
	it('warns that the url it returns opens with no token', () => {
		const notice = property('listNotice');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/without a token|no token/i);
	});

	it('refuses nothing on this screen that the API accepts', () => {
		expect(property('returnAll')).toBeDefined();
		expect(property('limit')).toBeDefined();
	});
});
