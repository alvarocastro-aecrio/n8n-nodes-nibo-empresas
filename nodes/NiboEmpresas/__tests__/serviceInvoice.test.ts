import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeServiceInvoice } from '../resources/serviceInvoice/execute';
import { loadServiceProfiles } from '../resources/serviceInvoice/load';
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

/**
 * One note, read through the list filtered by its ID.
 *
 * **There is no get-by-id.** `GET /nfse/{id}` answers 404 *"Resource not
 * found"*, identical to the 404 of a route that was never there — measured on
 * 2026-07-29. Category has read a single record this way since 0.9.0, for a
 * different reason and by the same means.
 */
describe('executeServiceInvoice — Get', () => {
	function getting(id: string = INVOICE) {
		return executeServiceInvoice.call(
			context({ serviceInvoiceId: id }),
			'serviceInvoice',
			'get',
		);
	}

	it('reads the record through the list filtered by ID, never through a get-by-id', async () => {
		listRequest.mockResolvedValue({ records: [AN_INVOICE], count: 1 });

		await getting();

		expect(listRequest.mock.calls[0][1]).toBe('/nfse');
		expect(optionsSentToTransport().filter).toBe(`id eq ${INVOICE}`);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('hands back the one record, not a list of one', async () => {
		listRequest.mockResolvedValue({ records: [AN_INVOICE], count: 1 });

		const items = await getting();

		expect(items).toHaveLength(1);
		expect(items[0].json.id).toBe(INVOICE);
	});

	it('says not found, with the ID, when the filter matches nothing', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		const failure = getting();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(new RegExp(INVOICE));
	});

	it('refuses an empty ID before reading anything', async () => {
		const failure = getting('   ');

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(listRequest).not.toHaveBeenCalled();
	});
});

/**
 * The service profiles — the field that decides the whole note, and the only
 * route that answers whether an organization issues one at all.
 *
 * Undocumented by Nibo, and the single source of the `ServiceProfileId` that
 * the issuing body demands.
 */
describe('executeServiceInvoice — Get Many Service Profiles', () => {
	function listingProfiles() {
		return executeServiceInvoice.call(context({}), 'serviceInvoice', 'listProfiles');
	}

	it('reads the profiles from their own route', async () => {
		apiRequest.mockResolvedValue({ items: [{ id: PROFILE, name: 'Certificação Digital' }], count: 1 });

		await listingProfiles();

		const [, method, endpoint] = apiRequest.mock.calls[0];
		expect(method).toBe('GET');
		expect(endpoint).toBe('/nfse/serviceprofiles');
	});

	it('unwraps the envelope into one item per profile, whole', async () => {
		apiRequest.mockResolvedValue({
			items: [
				{ id: PROFILE, name: 'Certificação Digital', issAliquot: 5, cityServiceCode: '170102002' },
				{ id: 'p2', name: 'Outro' },
			],
			count: 2,
		});

		const items = await listingProfiles();

		expect(items).toHaveLength(2);
		expect(items[0].json).toMatchObject({ id: PROFILE, issAliquot: 5, cityServiceCode: '170102002' });
	});

	/**
	 * 🔴 The refusal is an **empty list**, not an error — measured on the test
	 * company on 2026-07-29: `200 {"items":[],"count":0}`, not a 403 and not a
	 * 404. It is the same shape the charges of 0.13.0 refuse in, and it means
	 * something specific enough to be worth a sentence rather than an empty box.
	 */
	it('says the organization does not issue NFS-e when there is no profile', async () => {
		apiRequest.mockResolvedValue({ items: [], count: 0 });

		const failure = listingProfiles();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(/does not issue/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/certificate|city hall/i),
		});
	});
});

/**
 * The list behind the Service Profile field, which is where the choice is
 * actually made — and the one place a wrong pick is expensive: a profile
 * decides the tax and the payment instructions printed on the note, and undoing
 * that is a cancellation at the city hall.
 */
describe('loadServiceProfiles — the list behind the field', () => {
	const A_PROFILE = {
		id: PROFILE,
		name: 'Certificação Digital',
		cityServiceCode: '170102002',
		issAliquot: 5,
	};

	function loader(response: unknown, authMode = 'credential') {
		const request = jest.fn().mockResolvedValue(response);

		const context = {
			getCurrentNodeParameter: () => authMode,
			getCredentials: async () => ({ baseUrl: 'https://api.nibo.com.br/empresas/v1' }),
			getNode: () => NODE,
			helpers: { httpRequestWithAuthentication: request },
		} as unknown as ILoadOptionsFunctions;

		return { context, request };
	}

	it('reads the profiles from the undocumented route', async () => {
		const { context: ctx, request } = loader({ items: [A_PROFILE], count: 1 });

		await loadServiceProfiles.call(ctx);

		expect(request.mock.calls[0][1]).toMatchObject({
			method: 'GET',
			url: 'https://api.nibo.com.br/empresas/v1/nfse/serviceprofiles',
		});
	});

	/**
	 * The name alone is not enough to choose by. Two profiles called something
	 * like "padrão" differ in the service code and in the tax, which is exactly
	 * what the note carries — so both travel next to the name.
	 */
	it('shows the service code and the ISS rate next to the name', async () => {
		const { context: ctx } = loader({ items: [A_PROFILE], count: 1 });

		const options = await loadServiceProfiles.call(ctx);

		expect(options[0].name).toBe('Certificação Digital');
		expect(options[0].value).toBe(PROFILE);
		expect(options[0].description).toMatch(/170102002/);
		expect(options[0].description).toMatch(/5/);
		expect(options[0].description).toMatch(/ISS/i);
	});

	it('says the organization does not issue NFS-e instead of drawing an empty box', async () => {
		const { context: ctx } = loader({ items: [], count: 0 });

		await expect(loadServiceProfiles.call(ctx)).rejects.toThrow(/does not issue/i);
	});

	// A profile belongs to one organization, so one picked here would be right
	// for one item of a portfolio loop and wrong for every other.
	it('refuses to load at all when the token is read per item', async () => {
		const { context: ctx, request } = loader({ items: [A_PROFILE], count: 1 }, 'field');

		await expect(loadServiceProfiles.call(ctx)).rejects.toThrow(/per item/i);
		expect(request).not.toHaveBeenCalled();
	});
});

/**
 * Issuing a note — the one operation of this node whose mistake lands at a city
 * hall, and the only one this project has that cannot be undone by deleting
 * something.
 *
 * The measurements behind it were taken on a **production** organization on
 * 2026-07-29, under the exception in section 5 of the plan: a schedule of R$ 5,
 * a note issued, authorized and cancelled, and the schedule deleted. The
 * cancelled note stays in the company's history for good — there is no route
 * that removes a fiscal document, and there should not be.
 */
describe('executeServiceInvoice — Issue', () => {
	const NEW_ID = 'be35e904-0669-40d3-bad1-cc7277d56781';
	const CONTACT = 'a0e6a4b2-1f11-4f0e-9c3d-5b7e2c8a4d10';

	const QUEUED = { id: NEW_ID, status: { code: 1, description: 'Em fila de processamento' } };
	const PROCESSING = {
		id: NEW_ID,
		status: { code: 2, description: 'Em processamento de autorização' },
	};
	const AUTHORIZED = { ...AN_INVOICE, id: NEW_ID };
	const DENIED = {
		id: NEW_ID,
		status: { code: -1, description: 'Negada' },
		lastStatusMessage: 'Error',
		lastMessage:
			'NFSe negada. \r\nCódigo: _Cert002\r\nDescrição: O certificado digital da empresa está vencido, será necessário a atualização do mesmo antes de continuar as emissões de nota fiscal.',
	};

	/** The schedule the note is issued from, as `GET /schedules/credit/{id}` answers it */
	const A_SCHEDULE = {
		scheduleId: SCHEDULE,
		value: 5,
		description: 'Teste',
		// The root `stakeholderId` is a GUID of noughts on the listing of schedules
		// and filled in on this get-by-id — the two disagree by route, so the
		// contact is read from the nested object, which is right on both. The
		// fixture carries the bad one on purpose: if the handler ever reaches for
		// the root, this test says so.
		stakeholderId: '00000000-0000-0000-0000-000000000000',
		stakeholder: { id: CONTACT, name: 'Fulano de Tal', type: 'Customer' },
	};

	function issuing(parameters: IDataObject = {}) {
		return executeServiceInvoice.call(
			context({
				scheduleId: SCHEDULE,
				serviceProfileId: PROFILE,
				accrualDate: '2026-07-29',
				...parameters,
			}),
			'serviceInvoice',
			'issue',
		);
	}

	/**
	 * The schedule is read first, the POST answers a quoted GUID, and the note is
	 * read back from the list.
	 */
	function answersWith(...records: IDataObject[]) {
		apiRequest.mockImplementation(async (_index: unknown, method: unknown, endpoint: unknown) =>
			method === 'GET' && String(endpoint).startsWith('/schedules/') ? A_SCHEDULE : NEW_ID,
		);
		for (const record of records) {
			listRequest.mockResolvedValueOnce({ records: [record], count: 1 });
		}
	}

	/** The POST, wherever it landed among the calls */
	function postCall() {
		return apiRequest.mock.calls.find((call) => call[1] === 'POST');
	}

	it('posts to /nfse with the body in the PascalCase this API asks for here', async () => {
		answersWith(AUTHORIZED);

		await issuing({
			additionalFields: {
				additionalServiceDescription: 'Mensalidade Teste',
				stateWhereServiceWasProvided: 'RJ',
				cityWhereServiceWasProvided: 'Rio de Janeiro',
			},
		});

		const [, method, endpoint, , body] = postCall() ?? [];
		expect(method).toBe('POST');
		expect(endpoint).toBe('/nfse');
		expect(body).toEqual({
			ScheduleId: SCHEDULE,
			ServiceProfileId: PROFILE,
			StakeholderId: CONTACT,
			AccrualRpsDate: '2026-07-29',
			AdditionalServiceDescription: 'Mensalidade Teste',
			StateWhereServiceWasProvided: 'RJ',
			CityWhereServiceWasProvided: 'Rio de Janeiro',
		});
	});

	/**
	 * 🔴 **There is no amount in this body, and that is not an omission.** The
	 * note takes its value from the schedule — a receivable of R$ 5 produced a
	 * note of R$ 5 — so a field for it on this screen would be a field the API
	 * never reads.
	 */
	it('sends nothing about the amount, which comes from the schedule', async () => {
		answersWith(AUTHORIZED);

		await issuing();

		const body = (postCall() ?? [])[4] as IDataObject;
		expect(Object.keys(body)).toEqual([
			'ScheduleId',
			'ServiceProfileId',
			'StakeholderId',
			'AccrualRpsDate',
		]);
	});

	it('reads the bare GUID out of the quoted string the API answers', async () => {
		answersWith(AUTHORIZED);

		const items = await issuing();

		expect(items[0].json.id).toBe(NEW_ID);
		expect(optionsSentToTransport().filter).toBe(`id eq ${NEW_ID}`);
	});

	/**
	 * The clock, as it was measured: `1` at 0.4 s, `2` at 0.8 s and `3` at
	 * 22.8 s, with the number, the PDF and the XML arriving together with the
	 * authorization.
	 */
	it('waits through Queued and Processing and hands back the authorized note', async () => {
		answersWith(QUEUED, PROCESSING, AUTHORIZED);

		const items = await issuing();

		expect(items[0].json).toMatchObject({ status: { code: 3 }, number: '35' });
		expect(listRequest).toHaveBeenCalledTimes(3);
	});

	/**
	 * 🔴 **A denied note is an item, not an exception.** The call worked; the
	 * city hall refused. Failing the operation here would tell a workflow to
	 * issue again, and the second RPS has already left.
	 */
	it('stops on a denial and hands back the city hall text whole', async () => {
		answersWith(DENIED);

		const items = await issuing();

		expect(items[0].json.status).toMatchObject({ code: -1 });
		expect(items[0].json.lastMessage).toBe(DENIED.lastMessage);
	});

	/**
	 * The wait does not hang on a code it has no name for: it stops and hands the
	 * record over as it came. Four codes are known to be on their way somewhere —
	 * `1` and `2` on the way in, `-2` and `-3` on the way out — and everything
	 * else is somewhere a note stays.
	 */
	it('treats a status code nobody has ever seen as terminal', async () => {
		answersWith({ id: NEW_ID, status: { code: -7, description: 'Algo novo' } });

		const items = await issuing();

		expect(items[0].json.status).toMatchObject({ code: -7 });
		expect(listRequest).toHaveBeenCalledTimes(1);
	});

	/**
	 * 🔴 **The correction the acceptance of this version brought.** The plan had
	 * `-2` and `-3` down as never seen, and the first cancellation run through
	 * the node walked both of them: they are the **cancellation queue**, the
	 * mirror of `1` and `2`, and `-4` follows in seconds. A wait that read "a
	 * negative code is final" would stop on a note that is still moving.
	 */
	it.each([-2, -3])('keeps waiting on %s, which is the cancellation queue', async (code) => {
		answersWith({ id: NEW_ID, status: { code, description: 'Em fila de cancelamento' } }, {
			...AN_INVOICE,
			id: NEW_ID,
			status: { code: -4, description: 'Cancelada' },
		});

		const items = await issuing();

		expect(items[0].json.status).toMatchObject({ code: -4 });
		expect(listRequest).toHaveBeenCalledTimes(2);
	});

	it.each([-1, -4])('stops on %s, where a note stays', async (code) => {
		answersWith({ id: NEW_ID, status: { code, description: 'Terminal' } });

		await issuing();

		expect(listRequest).toHaveBeenCalledTimes(1);
	});

	/**
	 * 🔴 **The timeout never says the issuing failed**, because it did not: the
	 * note is at the city hall, with its RPS. A workflow told "failed" issues
	 * again, and that is a second note.
	 */
	it('says issued and not authorized yet when the ceiling is reached', async () => {
		answersWith(QUEUED);

		const items = await issuing({ options: { authorizationTimeout: 0 } });

		const said = String(items[0].json._niboAuthorizationPending);

		expect(items[0].json.id).toBe(NEW_ID);
		expect(said).toMatch(/not authorized yet/i);
		// It says the opposite of "failed", on purpose and in those words.
		expect(said).toMatch(/nothing failed/i);
		expect(said).not.toMatch(/\bfailed to\b|could not issue|error/i);
	});

	it('never sleeps or reads twice when the wait is switched off', async () => {
		answersWith(QUEUED);

		const items = await issuing({ options: { waitForAuthorization: false } });

		expect(items[0].json.status).toMatchObject({ code: 1 });
		expect(listRequest).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	/**
	 * 🔴 **The two defaults are a test, not a comment.** A default that changes
	 * without anybody deciding is exactly the defect 0.13.1 had to correct — so
	 * with nothing added under Options, the wait is **on** and the ceiling is
	 * **300 s**, which is the decision of 2026-07-29.
	 */
	it('waits by default, with nothing added under Options', async () => {
		answersWith(QUEUED, AUTHORIZED);

		const items = await issuing();

		expect(items[0].json.status).toMatchObject({ code: 3 });
	});

	it('refuses an empty schedule ID before anything is read or written', async () => {
		const failure = issuing({ scheduleId: '   ' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	// "Before anything is written" is the claim, and reading the schedule is not
	// writing: since 0.14.1 that read is the first thing an issuing does.
	it('refuses an empty service profile before anything is written', async () => {
		answersWith();

		const failure = issuing({ serviceProfileId: '' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(postCall()).toBeUndefined();
	});

	/**
	 * 🔴 **The taker is not on the screen — it comes off the schedule.** The
	 * Alvaro's decision on 2026-07-29, and the question behind it was the right
	 * one: a receivable already names its contact, so asking for it twice was
	 * asking for a chance for the two to disagree.
	 *
	 * And it is read from `stakeholder.id`, never from the root `stakeholderId`,
	 * which a GET answers as a GUID of noughts.
	 */
	it('takes the taker off the schedule, from the nested contact', async () => {
		answersWith(AUTHORIZED);

		await issuing();

		const [, method, endpoint] = apiRequest.mock.calls[0];
		expect(method).toBe('GET');
		expect(endpoint).toBe(`/schedules/credit/${SCHEDULE}`);
		expect(((postCall() ?? [])[4] as IDataObject).StakeholderId).toBe(CONTACT);
	});

	it('never asks for a taker on the screen', () => {
		const asked = new NiboEmpresas().description.properties.filter(
			(one) =>
				one.name === 'stakeholderId' &&
				((one.displayOptions?.show?.resource ?? []) as string[]).includes('serviceInvoice'),
		);

		expect(asked).toEqual([]);
	});

	/**
	 * The reading is also the guard the issuing never had: this API validates
	 * what is written and not what it is written onto, so an invented schedule
	 * has to stop **before** the POST. Nothing reaches a city hall.
	 */
	it('stops on a schedule that does not exist, with nothing sent', async () => {
		apiRequest.mockRejectedValue(new Error('Agendamento não encontrado'));

		const failure = issuing();

		await expect(failure).rejects.toThrow(new RegExp(SCHEDULE));
		expect(apiRequest.mock.calls.every((call) => call[1] === 'GET')).toBe(true);
	});

	it('refuses a schedule with no contact rather than issuing to nobody', async () => {
		apiRequest.mockImplementation(async (_index: unknown, method: unknown) =>
			method === 'GET' ? { ...A_SCHEDULE, stakeholder: undefined } : NEW_ID,
		);

		const failure = issuing();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(/names no contact/i);
		expect(postCall()).toBeUndefined();
	});

	// A note nobody can read back is still a note that was issued. Failing here
	// would send a workflow to issue a second one.
	it('still succeeds, naming the note, when the read-back finds nothing', async () => {
		answersWith();
		listRequest.mockResolvedValue({ records: [], count: 0 });

		const items = await issuing({ options: { waitForAuthorization: false } });

		expect(items[0].json).toMatchObject({ serviceInvoiceId: NEW_ID, issued: true });
	});
});

/**
 * Cancelling, through the route this project's catalogue got wrong for the
 * **second** time.
 *
 * The catalogue listed `DELETE /nfse/{id}`, never verified. Against an invented
 * GUID, which cannot undo anything, it answers **404** — the route does not
 * exist — while `POST /nfse/{id}/cancel` answers **500 "NFSe não encontrada"**,
 * which is a business error, and a business error only exists where there is a
 * route to produce it. Exactly how the charge's cancellation was found in
 * 0.13.0, and exactly the same mistake in the same document.
 */
describe('executeServiceInvoice — Cancel', () => {
	const CANCELLED = {
		...AN_INVOICE,
		status: { code: -4, description: 'Cancelada' },
		cancelDate: '2026-07-29T05:02:00.000Z',
	};

	function cancelling(id: string = INVOICE) {
		return executeServiceInvoice.call(
			context({ serviceInvoiceId: id }),
			'serviceInvoice',
			'cancel',
		);
	}

	it('posts to the cancel route, and never to the DELETE that is a 404', async () => {
		apiRequest.mockResolvedValue(undefined);
		listRequest.mockResolvedValue({ records: [CANCELLED], count: 1 });

		await cancelling();

		const [, method, endpoint] = apiRequest.mock.calls[0];
		expect(method).toBe('POST');
		expect(endpoint).toBe(`/nfse/${INVOICE}/cancel`);
		expect(apiRequest.mock.calls.every((call) => call[1] !== 'DELETE')).toBe(true);
	});

	it('reads the note back and hands it over showing Cancelled', async () => {
		apiRequest.mockResolvedValue(undefined);
		listRequest.mockResolvedValue({ records: [CANCELLED], count: 1 });

		const items = await cancelling();

		expect(items[0].json).toMatchObject({ id: INVOICE, status: { code: -4 } });
		expect(items[0].json._niboCancellationPending).toBeUndefined();
	});

	/**
	 * 🔴 And a note that has not caught up is **not** a failure — which is where
	 * this parts company with the charge of 0.13.0. A charge is cancelled at a
	 * bank provider and was measured changing at once; a note is cancelled at a
	 * **city hall**, and the only measurement there is a re-read three seconds
	 * later. The API answered 204: the cancellation was accepted, and saying it
	 * failed would send a workflow to ask twice.
	 */
	it('says the cancellation was accepted when the record has not caught up', async () => {
		apiRequest.mockResolvedValue(undefined);
		listRequest.mockResolvedValue({ records: [AN_INVOICE], count: 1 });

		const items = await cancelling();

		expect(items[0].json.status).toMatchObject({ code: 3 });
		expect(String(items[0].json._niboCancellationPending)).toMatch(/accepted/i);
		expect(String(items[0].json._niboCancellationPending)).not.toMatch(/\bfailed\b/i);
	});

	/**
	 * 🔴 And this is what the acceptance actually found, within the hour: the
	 * read-back that follows the 204 lands on **`-2`**, not on `-4`. Cancelling
	 * has its own queue. Had this operation copied the charge of 0.13.0, which
	 * fails when the record has not changed, it would have failed **every real
	 * cancellation** while the API was doing exactly what it was told.
	 */
	it.each([-2, -3])('names the cancellation queue when the note is at %s', async (code) => {
		apiRequest.mockResolvedValue(undefined);
		listRequest.mockResolvedValue({
			records: [{ ...AN_INVOICE, status: { code, description: 'Em fila de cancelamento' } }],
			count: 1,
		});

		const items = await cancelling();

		const said = String(items[0].json._niboCancellationPending);
		expect(said).toMatch(/cancellation queue/i);
		expect(said).toMatch(/-4/);
		expect(said).not.toMatch(/\bfailed\b/i);
	});

	it('says it cancelled but could not read it back when the record is gone', async () => {
		apiRequest.mockResolvedValue(undefined);
		listRequest.mockResolvedValue({ records: [], count: 0 });

		const items = await cancelling();

		expect(items[0].json).toMatchObject({ serviceInvoiceId: INVOICE, cancelled: true });
	});

	it('refuses an empty ID rather than posting to the collection endpoint', async () => {
		const failure = cancelling('   ');

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
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
	 * Seven codes, and the last two were found by the **acceptance** of this
	 * version: cancelling a note walks `-2` → `-3` → `-4`, which the plan had
	 * written off as never seen. Two mirrored pipelines, and only `3`, `-1` and
	 * `-4` are places a note stays.
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

	it('offers the seven status codes that were measured', () => {
		expect(statusChoices().map((one) => one.value)).toEqual([
			'3',
			'-3',
			'-4',
			'-1',
			'-2',
			'1',
			'2',
		]);
	});

	it('says which of them are transient, so nobody filters for a doorway', () => {
		const transient = statusChoices()
			.filter((one) => /transient/i.test(one.description ?? ''))
			.map((one) => one.value);

		expect(transient.sort()).toEqual(['-2', '-3', '1', '2']);
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

	/** One field of the Options collection, which is the last parameter of the node */
	function option(name: string): INodeProperties | undefined {
		const options = description.properties[description.properties.length - 1];
		expect(options?.name).toBe('options');

		return ((options?.options ?? []) as INodeProperties[]).find((field) => field.name === name);
	}

	it('offers the five operations that were measured, and no more', () => {
		const operations = description.properties.find(
			(one) =>
				one.name === 'operation' &&
				((one.displayOptions?.show?.resource ?? []) as string[]).includes('serviceInvoice'),
		);

		expect((operations?.options as INodePropertyOptions[]).map((one) => one.value)).toEqual([
			'cancel',
			'get',
			'list',
			'listProfiles',
			'issue',
		]);
		expect(operations?.default).toBe('list');
	});

	/**
	 * Three things nobody would guess, all three measured on 2026-07-29 — and the
	 * middle one on a note that was **already cancelled**: both documents still
	 * answered 200 with no header of any kind.
	 */
	it('warns what cancelling leaves behind, including the documents', () => {
		const notice = property('cancelNotice');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/stays|remains|does not remove/i);
		expect(notice?.displayName).toMatch(/PDF/);
		expect(notice?.displayName).toMatch(/city hall/i);
	});

	/**
	 * 🔴 The amount has no field, and the notice is what keeps that from reading
	 * as forgetfulness: the note takes it from the schedule, measured — a
	 * receivable of R$ 5 produced a note of R$ 5.
	 */
	it('asks for neither the amount nor the taker, and says where both come from', () => {
		expect(property('value')).toBeUndefined();
		expect(property('stakeholderId')).toBeUndefined();
		expect(property('issueNotice')?.type).toBe('notice');
		expect(property('issueNotice')?.displayName).toMatch(/taker/i);
		expect(property('issueNotice')?.displayName).toMatch(/schedule/i);
	});

	it('names a profile list the node actually declares', () => {
		const method = property('serviceProfileId')?.typeOptions?.loadOptionsMethod as string;

		expect(Object.keys(new NiboEmpresas().methods.loadOptions)).toContain(method);
	});

	/**
	 * 🔴 The two defaults of 2026-07-29, read off the screen rather than off a
	 * comment. 120 s had been recommended and was withdrawn for sitting **below**
	 * the slowest sample measured, 123.1 s.
	 */
	it('waits by default and gives the city hall 300 seconds', () => {
		expect(option('waitForAuthorization')?.default).toBe(true);
		expect(option('authorizationTimeout')?.default).toBe(300);
	});

	it('offers both of those only where they can happen — on the issuing', () => {
		for (const name of ['waitForAuthorization', 'authorizationTimeout']) {
			expect(option(name)?.displayOptions?.show).toEqual({
				'/resource': ['serviceInvoice'],
				'/operation': ['issue'],
			});
		}
	});
});
