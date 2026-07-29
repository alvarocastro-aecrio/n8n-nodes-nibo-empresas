import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeServiceInvoice } from '../resources/serviceInvoice/execute';
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

const INVOICE = 'be35e904-0669-40d3-bad1-cc7277d56781';
const SCHEDULE = 'a01f0058-d321-4805-bd73-810e88b98557';
const PROFILE = '7c5cc26f-a1f1-4770-aa42-993949243372';

/**
 * A note as the API really answers it, cut down to the fields any of this
 * reasons about — the whole record is 41 fields, and 42 across the states,
 * because a terminal state does not carry the other one's fields.
 *
 * Everything here was measured on 2026-07-29 against a production organization,
 * under the exception recorded in section 5 of the plan: the test company
 * cannot issue a note at all, so there was nowhere else to read one.
 */
const AN_INVOICE = {
	id: INVOICE,
	provider: 'ENotas',
	status: { code: 3, description: 'Autorizada' },
	lastMessage: 'NFSe autorizada.',
	lastStatusMessage: 'Info',
	lastStatusChange: '2026-07-29T05:00:22.800Z',
	number: '35',
	verificationCode: '0000000000000000000000000000000000000000000000ABCD',
	rpsNumber: 4,
	rpsSeries: '2',
	accrualRpsDate: '2026-07-29T03:00:00Z',
	createDate: '2026-07-29T05:00:00.000Z',
	authorizeDate: '2026-07-29T05:00:22.800Z',
	value: 5,
	schedule: { id: SCHEDULE, value: 5, description: 'Teste', dueDate: '2026-07-30T00:00:00Z' },
	stakeholder: { id: 'a0e6a4b2-1f11-4f0e-9c3d-5b7e2c8a4d10', name: 'Fulano de Tal', type: 1 },
	customer: { name: 'Fulano de Tal', document: { number: '000.000.000-00', type: 'Cpf' } },
	serviceProfile: { id: PROFILE, name: 'Certificação Digital', isDeleted: false },
	service: { description: 'Teste', cityServiceCode: '170102', cnaeCode: '6319400' },
	pdfFileUrl: 'https://arquivos.nibo.com.br/download/…',
	xmlFileUrl: 'https://arquivos.nibo.com.br/download/…',
	cityWhereServiceWasProvided: 'Rio de Janeiro',
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
function filterSent(): string {
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
 * The service invoices — NFS-e — of the organization.
 *
 * Read against a production organization on 2026-07-29, because the test
 * company answers `GET /nfse/serviceprofiles` with `count: 0`: a note needs a
 * digital certificate and a service profile approved by the city hall, and a
 * company created that morning has neither.
 */
describe('executeServiceInvoice — Get Many', () => {
	it('reads the collection from /nfse, with no prefix of its own', async () => {
		await executeServiceInvoice.call(context({ returnAll: true }), 'serviceInvoice', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/nfse');
	});

	/**
	 * `id` and `lastStatusChange` both answer 200, and `id` is what the rest of
	 * this node already pages by — one key fewer to remember. `accrualDate` and
	 * `issueDate`, which this project's catalogue suggested, are both 500.
	 */
	it('pages by id, the key the whole node already uses', async () => {
		await executeServiceInvoice.call(context({ returnAll: true }), 'serviceInvoice', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeServiceInvoice.call(
			context({ returnAll: false, limit: 3 }),
			'serviceInvoice',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 3,
			failOnIncomplete: true,
		});
	});

	it('hands the record back whole, with the nested parts untouched', async () => {
		listRequest.mockResolvedValue({ records: [AN_INVOICE], count: 1 });

		const items = await executeServiceInvoice.call(
			context({ returnAll: true }),
			'serviceInvoice',
			'list',
		);

		expect(items[0].json).toMatchObject({
			id: INVOICE,
			status: { code: 3, description: 'Autorizada' },
			service: { cityServiceCode: '170102' },
			pdfFileUrl: AN_INVOICE.pdfFileUrl,
		});
	});

	it('marks the last item when the scan may have missed records', async () => {
		listRequest.mockResolvedValue({
			records: [AN_INVOICE, { ...AN_INVOICE, id: 'other' }],
			count: 2,
			warning: 'may be incomplete',
		});

		const items = await executeServiceInvoice.call(
			context({ returnAll: true }),
			'serviceInvoice',
			'list',
		);

		expect(items[0].json._niboPaginationWarning).toBeUndefined();
		expect(items[1].json._niboPaginationWarning).toBe('may be incomplete');
	});
});

/**
 * The filter menu, measured field by field on 2026-07-29 — and two of the types
 * are the opposite of what the name suggests.
 */
describe('executeServiceInvoice — the assisted filter', () => {
	function filtering(rows: IDataObject[]) {
		return executeServiceInvoice.call(
			context({ returnAll: true, filters: { conditions: rows }, filterCombine: 'and' }),
			'serviceInvoice',
			'list',
		);
	}

	it('filters by status through status/code, with the literal bare', async () => {
		await filtering([{ field: 'status/code', operator: 'eq', optionsValue: '3' }]);

		expect(filterSent()).toBe('status/code eq 3');
	});

	/**
	 * 🔴 The number of the note is **text** to this API — `number eq 35` is a 500
	 * about `Edm.String` and `Edm.Int32`, and `number eq '35'` answers 200. The
	 * number of the RPS behind it is the other way round. Measured, both of them,
	 * because nobody would guess a pair like that.
	 */
	it('quotes the invoice number, which the API holds as text', async () => {
		await filtering([{ field: 'number', operator: 'eq', value: '35' }]);

		expect(filterSent()).toBe("number eq '35'");
	});

	it('sends the RPS number bare, which is the opposite of the invoice number', async () => {
		await filtering([{ field: 'rpsNumber', operator: 'eq', numberValue: 4 }]);

		expect(filterSent()).toBe('rpsNumber eq 4');
	});

	// And the series of that same RPS is text again: `rpsSeries eq 2` is a 500.
	it('quotes the RPS series', async () => {
		await filtering([{ field: 'rpsSeries', operator: 'eq', value: '2' }]);

		expect(filterSent()).toBe("rpsSeries eq '2'");
	});

	it('compares a GUID bare, which is how this API compares an ID column', async () => {
		await filtering([{ field: 'schedule/id', operator: 'eq', guidValue: SCHEDULE }]);

		expect(filterSent()).toBe(`schedule/id eq ${SCHEDULE}`);
	});

	it('searches the taker by the nested path the record really has', async () => {
		await filtering([{ field: 'stakeholder/name', operator: 'containsIgnoreCase', value: 'Fulano' }]);

		expect(filterSent()).toBe("contains(tolower(stakeholder/name),'fulano')");
	});

	it('filters by the accrual date under the name that works', async () => {
		await filtering([{ field: 'accrualRpsDate', operator: 'ge', dateValue: '2026-07-01' }]);

		expect(filterSent()).toBe('accrualRpsDate ge 2026-07-01');
	});
});

describe('NiboEmpresas — what the Service Invoice screen offers', () => {
	const description = new NiboEmpresas().description;

	function property(name: string): INodeProperties | undefined {
		return description.properties.find(
			(one) =>
				one.name === name &&
				((one.displayOptions?.show?.resource ?? []) as string[]).includes('serviceInvoice'),
		);
	}

	function fieldMenu(): INodePropertyOptions[] {
		const field = ((property('filters')?.options ?? []) as Array<{ values?: INodeProperties[] }>)
			.flatMap((one) => one.values ?? [])
			.find((one) => one.name === 'field');

		return (field?.options ?? []) as INodePropertyOptions[];
	}

	/**
	 * The n8n linter puts every display name in title case, and it turns `NFS-e`
	 * into `NFS-E` — a spelling that does not exist. 0.9.0 hit the same wall with
	 * the category tree and solved it the same way: the name of the document goes
	 * in the description, where nothing rewrites it.
	 */
	it('is called Service Invoice on screen and says NFS-e in the description', () => {
		const resources = (description.properties.find((one) => one.name === 'resource')?.options ??
			[]) as INodePropertyOptions[];
		const invoice = resources.find((one) => one.value === 'serviceInvoice');

		expect(invoice?.name).toBe('Service Invoice');
		expect(invoice?.description).toMatch(/NFS-e/);
	});

	it('offers only the paths the API was measured to filter on', () => {
		expect(fieldMenu().map((one) => one.value)).toEqual([
			'accrualRpsDate',
			'authorizeDate',
			'cancelDate',
			'cityWhereServiceWasProvided',
			'stakeholder/id',
			'stakeholder/name',
			'createDate',
			'customer/name',
			'id',
			'number',
			'lastStatusChange',
			'provider',
			'rpsNumber',
			'rpsSeries',
			'schedule/id',
			'service/description',
			'serviceProfile/id',
			'status/code',
			'updateDate',
			'value',
		]);
	});

	/**
	 * The two that answer 500, and they fail for reasons this node has met
	 * before: an enum does not compare (as `document/type` on a contact does not),
	 * and `isDeleted` is simply not in this view (as it is not in the category,
	 * the cost centre or the settled entry).
	 */
	it('never offers status/description nor isDeleted, which are both a 500', () => {
		const paths = fieldMenu().map((one) => one.value);

		expect(paths).not.toContain('status/description');
		expect(paths).not.toContain('isDeleted');
	});

	/**
	 * `accrualDate` breaks as an `$orderby` and does not exist as a field of this
	 * view; the accrual date that does filter is `accrualRpsDate`. Two names, one
	 * letter of difference in meaning, and only one of them works.
	 */
	it('offers accrualRpsDate and never accrualDate', () => {
		const paths = fieldMenu().map((one) => one.value);

		expect(paths).toContain('accrualRpsDate');
		expect(paths).not.toContain('accrualDate');
	});

	it('keeps the field menu alphabetical by label, as the linter asks', () => {
		const labels = fieldMenu().map((one) => one.name);

		expect(labels).toEqual([...labels].sort());
	});

	/**
	 * Five codes, three of which only exist because the probe watched a note go
	 * through them. `-2` and `-3` never appeared, and this list does not claim
	 * they do not exist — the fourteenth gotcha of this project holds for the
	 * value of an enum as it holds for a route.
	 */
	function statusChoices(): INodePropertyOptions[] {
		const value = ((property('filters')?.options ?? []) as Array<{ values?: INodeProperties[] }>)
			.flatMap((one) => one.values ?? [])
			.find(
				(one) =>
					one.name === 'optionsValue' &&
					(one.displayOptions?.show?.field ?? []).includes('status/code'),
			);

		return (value?.options ?? []) as INodePropertyOptions[];
	}

	it('offers the five status codes that were measured', () => {
		expect(statusChoices().map((one) => one.value)).toEqual(['3', '-4', '-1', '1', '2']);
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
	 * Measured with a bare fetch, on a note already **cancelled**: the PDF
	 * answers 200 `application/pdf` and the XML 200 `text/xml`, with no token, no
	 * cookie and no header of any kind.
	 */
	it('warns that the PDF and the XML links it returns open with no token', () => {
		const notice = property('listNotice');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/without a token|no token/i);
	});

	it('offers the scan the two parameters every scan of this node has', () => {
		expect(property('returnAll')).toBeDefined();
		expect(property('limit')).toBeDefined();
	});
});
