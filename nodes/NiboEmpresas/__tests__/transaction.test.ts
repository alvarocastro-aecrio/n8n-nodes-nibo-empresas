import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeTransaction } from '../resources/transaction/execute';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';
import { niboReadBack } from '../transport/save';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('../transport/save');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;
const readBack = niboReadBack as jest.MockedFunction<typeof niboReadBack>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** A GUID with the shape this API's ID columns compare against */
const GUID = '2efffcd0-8730-4348-86da-6d9a95be6149';

function context(parameters: IDataObject, itemCount = 1, keepGoing = false) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => keepGoing,
	} as unknown as IExecuteFunctions;
}

function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][3] as unknown as IDataObject;
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	apiRequest.mockReset();
	apiRequest.mockResolvedValue({});
	readBack.mockReset();
	readBack.mockResolvedValue(undefined);
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The settled side of the books — what a schedule becomes once the money has
 * actually moved.
 *
 * Two resources with one handler, exactly as the two schedules and the four
 * contacts: measured on the test company on 2026-07-27, the API gives
 * `/payments` and `/receipts` an identical contract on every operation.
 */
describe('executeTransaction — Get Many', () => {
	it.each([
		['payment', '/payments'],
		['receipt', '/receipts'],
	])('reads %s from its own collection', async (resource, endpoint) => {
		await executeTransaction.call(context({ returnAll: true }), resource, 'list');

		expect(listRequest.mock.calls[0][1]).toBe(endpoint);
	});

	/**
	 * The fourth collection of this node with a key of its own, after the
	 * stakeholders' `id`, the schedules' `scheduleId` and the cost centres'
	 * `costCenterId`. Here `$orderby=id` is an HTTP 500 and the key is
	 * **`entryId`** — measured on 2026-07-27.
	 */
	it.each(['payment', 'receipt'])('pages %s by entryId, and never by id', async (resource) => {
		await executeTransaction.call(context({ returnAll: true }), resource, 'list');

		expect(listRequest.mock.calls[0][2]).toBe('entryId');
		expect(listRequest.mock.calls[0][2]).not.toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeTransaction.call(context({ returnAll: false, limit: 9 }), 'payment', 'list');

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 9,
			failOnIncomplete: true,
		});
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeTransaction.call(context({ returnAll: true }, 3), 'payment', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('hands back the records as the API answered them', async () => {
		listRequest.mockResolvedValue({
			records: [{ entryId: GUID, description: 'Água', value: 250 }],
			count: 1,
		});

		const items = await executeTransaction.call(context({ returnAll: true }), 'payment', 'list');

		expect(items[0].json).toEqual({ entryId: GUID, description: 'Água', value: 250 });
	});

	it('flags the last item when the scan may be incomplete', async () => {
		listRequest.mockResolvedValue({
			records: [{ entryId: 'a' }, { entryId: 'b' }],
			count: 3,
			warning: 'this result is incomplete',
		});

		const items = await executeTransaction.call(
			context({ returnAll: true, options: { failOnIncomplete: false } }),
			'payment',
			'list',
		);

		expect(items[1].json._niboPaginationWarning).toContain('incomplete');
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeTransaction.call(context({}), 'category', 'list')).rejects.toThrow(
			/category/,
		);
	});

	/**
	 * Recategorizing is not on the menu, and that is measurement rather than
	 * caution. `PUT /payments/{entryId}` answers 404 — including with the exact
	 * body of the production workflow the project's catalogue cited as proof it
	 * worked, reproduced field by field against a live record on 2026-07-27.
	 * That workflow is inactive.
	 */
	it.each(['update', 'archive'])('refuses "%s", which this API has no route for', async (operation) => {
		await expect(executeTransaction.call(context({}), 'payment', operation)).rejects.toThrow(
			new RegExp(operation),
		);
	});
});

/**
 * Get, and the door it goes through — the same one the categories use, for the
 * same reason: `GET /payments/{entryId}` is a 404, so the only way to read one
 * record is the list filtered by its ID.
 */
describe('executeTransaction — Get', () => {
	it('reads the one record through the list, since there is no get-by-id', async () => {
		listRequest.mockResolvedValue({ records: [{ entryId: GUID, value: 250 }], count: 1 });

		const items = await executeTransaction.call(context({ entryId: GUID }), 'payment', 'get');

		expect(listRequest.mock.calls[0][1]).toBe('/payments');
		expect(items[0].json).toEqual({ entryId: GUID, value: 250 });
	});

	/**
	 * Bare, like every ID column of this API and unlike every text field of it.
	 * `entryId eq '<guid>'` answers 500 — *Found operand types 'Edm.Guid' and
	 * 'Edm.String'* — measured here on 2026-07-27, as it was on the categories
	 * and the cost centres before.
	 */
	it('writes the GUID without quotes, which is what this comparison takes', async () => {
		listRequest.mockResolvedValue({ records: [{ entryId: GUID }], count: 1 });

		await executeTransaction.call(context({ entryId: GUID }), 'payment', 'get');

		expect(optionsSentToTransport().filter).toBe(`entryId eq ${GUID}`);
	});

	it('refuses an ID that is not a GUID instead of sending a filter the API answers 500 to', async () => {
		const failure = executeTransaction.call(context({ entryId: 'Água' }), 'payment', 'get');

		await expect(failure).rejects.toThrow(/GUID/i);
		expect(listRequest).not.toHaveBeenCalled();
	});

	it('refuses an empty ID', async () => {
		await expect(executeTransaction.call(context({}), 'payment', 'get')).rejects.toThrow(/ID/);
		expect(listRequest).not.toHaveBeenCalled();
	});

	it('turns an empty answer into "not found", which is what this operation asked about', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		await expect(
			executeTransaction.call(context({ entryId: GUID }), 'payment', 'get'),
		).rejects.toThrow(new RegExp(GUID));
	});
});

describe('executeTransaction — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[]) {
		return context({ returnAll: true, filters: { conditions } });
	}

	it('searches the description ignoring case', async () => {
		await executeTransaction.call(
			withConditions([{ field: 'description', operator: 'containsIgnoreCase', value: 'ÁGUA' }]),
			'payment',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(description),'água')");
	});

	// The one a report actually wants: everything settled since a date.
	it('compares the date bare, as this API takes a date', async () => {
		await executeTransaction.call(
			withConditions([{ field: 'date', operator: 'ge', dateValue: '2026-01-01' }]),
			'payment',
			'list',
		);

		expect(filterSent()).toBe('date ge 2026-01-01');
	});

	it('finds the settlement of a schedule by the schedule ID, unquoted', async () => {
		await executeTransaction.call(
			withConditions([{ field: 'scheduleId', operator: 'eq', guidValue: GUID }]),
			'payment',
			'list',
		);

		expect(filterSent()).toBe(`scheduleId eq ${GUID}`);
	});

	it('finds the entries of a bank account, unquoted, through the nested path the read side answers', async () => {
		await executeTransaction.call(
			withConditions([{ field: 'account/id', operator: 'eq', guidValue: GUID }]),
			'payment',
			'list',
		);

		expect(filterSent()).toBe(`account/id eq ${GUID}`);
	});

	it('searches the account name ignoring case', async () => {
		await executeTransaction.call(
			withConditions([{ field: 'account/name', operator: 'containsIgnoreCase', value: 'Itaú' }]),
			'payment',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(account/name),'itaú')");
	});

	/**
	 * The flag is the sharpest trap of this collection: the API takes `isFlag`
	 * on a **write** and answers `isFlagged` on a **read**, and filtering by the
	 * write name is an HTTP 500 — *Could not find a property named 'isFlag'*.
	 * Both names are true, one on each side, and this menu is the read side.
	 */
	it('filters the flag by the name the read side uses', async () => {
		await executeTransaction.call(
			withConditions([{ field: 'isFlagged', operator: 'eq', booleanValue: true }]),
			'payment',
			'list',
		);

		expect(filterSent()).toBe('isFlagged eq true');
	});

	it.each(['isFlag', 'isDeleted', 'dueDate', 'isPaid', 'accountId'])(
		'fails the item on "%s", which is a 500 on this view',
		async (field) => {
			const failure = executeTransaction.call(
				withConditions([{ field, operator: 'eq', booleanValue: false }]),
				'payment',
				'list',
			);

			await expect(failure).rejects.toThrow(new RegExp(field));
			await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
		},
	);
});

describe('NiboEmpresas — the two transaction resources on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forTransactions(name: string): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('payment'),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	/**
	 * The family word was chosen by Alvaro on 2026-07-27, after rejecting the
	 * first suggestion. It groups the pair and lands immediately after
	 * `Schedule`, so the menu — and the Actions tab, which is the same list —
	 * reads in the order the money moves: schedule, then settle.
	 */
	it('names them as one family, right after the schedules', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([...names].sort());
		expect(names.slice(-2)).toEqual(['Transaction - Payment', 'Transaction - Receipt']);
		expect(names.indexOf('Schedule - Debit')).toBeLessThan(
			names.indexOf('Transaction - Payment'),
		);
	});

	// A label is a word; a `value` is a contract.
	it('stores the short values a workflow will carry', () => {
		expect(optionValues(property('resource'))).toEqual(
			expect.arrayContaining(['payment', 'receipt']),
		);
	});

	it('names both in the credential like every other resource', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toEqual(
			expect.arrayContaining(['payment', 'receipt']),
		);
	});

	it('offers the operations these slices built', () => {
		expect(optionValues(forTransactions('operation'))).toEqual(['create', 'delete', 'get', 'list', 'settle']);
		expect(forTransactions('operation')?.default).toBe('list');
	});

	/**
	 * The two operations that work on one entry that already exists — reading it
	 * and removing it. Delete needs the schedule ID as well, because the route
	 * that answers 204 carries both.
	 */
	it('asks for the entry ID where one entry is worked on, and for both IDs on Delete', () => {
		expect(forTransactions('entryId')?.displayOptions?.show?.operation).toEqual(['delete', 'get']);
		expect(forTransactions('entryId')?.required).toBe(true);
		expect(forTransactions('scheduleId')?.displayOptions?.show?.operation).toEqual([
			'delete',
			'settle',
		]);
	});

	/** The fields of one row of this resource's condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (forTransactions('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(
			[
				'account/id',
				'account/name',
				'accrualDate',
				'date',
				'description',
				'entryId',
				'isFlagged',
				'scheduleId',
				'stakeholder/name',
				'value',
			].sort(),
		);
	});

	it.each(['isFlag', 'isDeleted', 'dueDate', 'isPaid', 'accountId'])('never offers %s', (field) => {
		expect(optionValues(conditionFields().find((one) => one.name === 'field'))).not.toContain(
			field,
		);
	});

	// The bare-GUID literal the 0.9.0 transport learned, reused here unchanged.
	it('collects the three ID fields in the box that never quotes them', () => {
		for (const path of ['entryId', 'scheduleId', 'account/id']) {
			const box = conditionFields().find(
				(one) =>
					one.name === 'guidValue' &&
					((one.displayOptions?.show?.field ?? []) as string[]).includes(path),
			);

			expect(box?.type).toBe('string');
		}
	});
});

/**
 * The operation this whole version exists for: marking a schedule that already
 * exists as actually paid or received.
 *
 * Until 0.10.0 the node could create a schedule and had no way to settle it, so
 * every settlement in a workflow stayed an HTTP Request node.
 */
describe('executeTransaction — Settle', () => {
	const SCHEDULE = 'f0d1ba25-a132-4dd3-a832-9efadcae3ad1';
	const ACCOUNT = '95f309e3-4b64-45df-8c57-ae4a1dbeedd0';

	/** What the API answers: the schedule for the kind check, then the entry ID */
	function apiAnswers(type = 'debit') {
		apiRequest.mockReset();
		apiRequest.mockResolvedValueOnce({ scheduleId: SCHEDULE, type }).mockResolvedValue(GUID);
		readBack.mockResolvedValue({ entryId: GUID, scheduleId: SCHEDULE, value: 250 });
	}

	function settling(parameters: IDataObject = {}) {
		return context({
			scheduleId: SCHEDULE,
			accountId: ACCOUNT,
			date: '2026-07-27T00:00:00.000-03:00',
			value: 250,
			...parameters,
		});
	}

	beforeEach(() => apiAnswers());

	/** (itemIndex, method, endpoint, qs, body) */
	function settlementCall() {
		const [, method, endpoint, , body] = apiRequest.mock.calls[1];
		return { method, endpoint, body };
	}

	it.each([
		['payment', '/schedules/debit/', '/payments'],
		['receipt', '/schedules/credit/', '/receipts'],
	])('posts a %s settlement to the route its kind carries', async (resource, prefix, suffix) => {
		apiAnswers(resource === 'payment' ? 'debit' : 'credit');

		await executeTransaction.call(settling({}), resource, 'settle');

		expect(settlementCall().method).toBe('POST');
		expect(settlementCall().endpoint).toBe(`${prefix}${SCHEDULE}${suffix}`);
	});

	// `{accountId, date, value}` and nothing else — measured on 2026-07-27.
	it('sends the three fields the route takes, with the date as a plain day', async () => {
		await executeTransaction.call(settling(), 'payment', 'settle');

		expect(settlementCall().body).toEqual({
			accountId: ACCOUNT,
			date: '2026-07-27',
			value: 250,
		});
	});

	/**
	 * The refusal that costs a round trip and saves a confusing one: without an
	 * account the API answers 500 *"Conta bancária não encontrada."*, which
	 * names a thing the form never asked about if the field was left blank.
	 */
	it('refuses without a bank account, before anything is sent', async () => {
		const failure = executeTransaction.call(settling({ accountId: '' }), 'payment', 'settle');

		await expect(failure).rejects.toThrow(/bank account/i);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('refuses without a schedule to settle', async () => {
		const failure = executeTransaction.call(settling({ scheduleId: '' }), 'payment', 'settle');

		await expect(failure).rejects.toThrow(/ID/);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	/**
	 * And the guard that matters most, because the API does not have it:
	 * `POST /schedules/credit/{id}/receipts` on a **debit** schedule answers 200
	 * — measured on 2026-07-27 — and files the money on the wrong side of the
	 * cash book without a word. The node reads the schedule first and refuses.
	 */
	it('refuses to settle a schedule of the other kind, which the API would accept', async () => {
		const ctx = settling();
		apiRequest.mockReset();
		apiRequest.mockResolvedValueOnce({ scheduleId: SCHEDULE, type: 'credit' });

		const failure = executeTransaction.call(ctx, 'payment', 'settle');

		await expect(failure).rejects.toThrow(/credit/i);
		// read once to check, and never written
		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('checks the kind through the get-by-id every schedule shares', async () => {
		await executeTransaction.call(settling(), 'payment', 'settle');

		const [, method, endpoint] = apiRequest.mock.calls[0];
		expect(method).toBe('GET');
		expect(endpoint).toBe(`/schedules/credit/${SCHEDULE}`);
	});

	/**
	 * The route answers the **entryId** — not the scheduleId, which is what the
	 * one-shot creation answers. Two keys on the two ends of the same family, so
	 * each operation reads back by its own.
	 */
	it('reads the new entry back by the entryId the route answered', async () => {
		const items = await executeTransaction.call(settling(), 'payment', 'settle');

		expect(readBack.mock.calls[0][1]).toBe('/payments');
		expect(readBack.mock.calls[0][3]).toBe(`entryId eq ${GUID}`);
		expect(items[0].json).toEqual({ entryId: GUID, scheduleId: SCHEDULE, value: 250 });
	});

	// A partial settlement is a real thing: 100 against a schedule of 400 answers
	// 200 and leaves the schedule open. Nothing here may treat it as an error.
	it('sends a part of the amount without complaining', async () => {
		await executeTransaction.call(settling({ value: 100 }), 'payment', 'settle');

		expect((settlementCall().body as IDataObject).value).toBe(100);
	});

	/**
	 * And the one sentence that has to be exactly right: if the entry cannot be
	 * read back, the settlement still happened. Saying it failed would make a
	 * workflow settle the same schedule twice.
	 */
	it('says the entry was written when it cannot be read back, never that it failed', async () => {
		const ctx = settling();
		readBack.mockResolvedValue(undefined);

		const failure = executeTransaction.call(ctx, 'payment', 'settle');

		await expect(failure).rejects.toThrow(/was settled|did go through/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/again|twice/i),
		});
	});

	/**
	 * The same cheap proof the creation uses, except that here `isPaid` cannot be
	 * the test: a part of the amount is a **real** settlement and leaves the
	 * schedule open. What is compared is how much has been paid — and the reading
	 * to compare against is already being made, for the kind check.
	 */
	describe('when the entry cannot be read back', () => {
		beforeEach(() => {
			readBack.mockResolvedValue(undefined);
		});

		function paidGoingFrom(before: number | undefined, after: number) {
			apiRequest.mockReset();
			apiRequest
				.mockResolvedValueOnce({ scheduleId: SCHEDULE, type: 'debit', paidValue: before })
				.mockResolvedValueOnce(GUID)
				.mockResolvedValueOnce({ scheduleId: SCHEDULE, type: 'debit', paidValue: after });
		}

		it('hands back what it knows, with a warning, when more has been paid than before', async () => {
			paidGoingFrom(0, 250);

			const items = await executeTransaction.call(settling(), 'payment', 'settle');

			expect(items[0].json.entryId).toBe(GUID);
			expect(items[0].json._niboReadBackPending).toEqual(expect.stringContaining(GUID));
		});

		it('counts a part of the amount as settled, which isPaid alone would not', async () => {
			paidGoingFrom(0, 100);

			const items = await executeTransaction.call(settling({ value: 100 }), 'payment', 'settle');

			expect(items[0].json._niboReadBackPending).toEqual(expect.any(String));
		});

		it('fails, and says nothing moved, when the same amount is paid as before', async () => {
			paidGoingFrom(250, 250);

			const failure = executeTransaction.call(settling(), 'payment', 'settle');

			await expect(failure).rejects.toThrow(/did not settle|nothing moved/i);
		});

		it('keeps the old refusal when the schedule cannot be read a second time', async () => {
			apiRequest.mockReset();
			apiRequest
				.mockResolvedValueOnce({ scheduleId: SCHEDULE, type: 'debit' })
				.mockResolvedValueOnce(GUID)
				.mockRejectedValueOnce(new Error('boom'));

			const failure = executeTransaction.call(settling(), 'payment', 'settle');

			await expect(failure).rejects.toThrow(/was settled/i);
		});
	});
});

/**
 * The one-shot: record an amount already moved, creating the schedule and
 * settling it in the same call.
 *
 * Its defense is the sharpest measurement of this version — without a bank
 * account the route answers **200** and creates an **unsettled schedule**
 * instead of a settled entry.
 */
describe('executeTransaction — Create', () => {
	const ACCOUNT = '95f309e3-4b64-45df-8c57-ae4a1dbeedd0';
	const SCHEDULE = 'f0d1ba25-a132-4dd3-a832-9efadcae3ad1';
	const CATEGORY = '188d0f6b-16df-410a-b8f5-9ee29b391e11';

	function creating(parameters: IDataObject = {}, keepGoing = false) {
		return context(
			{
				accountId: ACCOUNT,
				stakeholderId: { __rl: true, mode: 'list', value: 'a-contact' },
				date: '2026-07-27T00:00:00.000-03:00',
				description: 'Água',
				isFlagged: false,
				categories: { category: [{ categoryId: CATEGORY, value: 15 }] },
				additionalFields: {},
				...parameters,
			},
			1,
			keepGoing,
		);
	}

	function bodySent(): IDataObject {
		return apiRequest.mock.calls[0][4] as IDataObject;
	}

	beforeEach(() => {
		apiRequest.mockReset();
		apiRequest.mockResolvedValue(SCHEDULE);
		readBack.mockResolvedValue({ entryId: GUID, scheduleId: SCHEDULE, value: 15 });
	});

	it.each([
		['payment', '/payments'],
		['receipt', '/receipts'],
	])('posts a %s to its own collection', async (resource, endpoint) => {
		await executeTransaction.call(creating(), resource, 'create');

		expect(apiRequest.mock.calls[0][1]).toBe('POST');
		expect(apiRequest.mock.calls[0][2]).toBe(endpoint);
	});

	/**
	 * The refusal this operation exists to make. Without the account the API
	 * answers 200 and creates an open schedule — a success that is not one.
	 */
	it('refuses without a bank account, and never sends anything', async () => {
		const failure = executeTransaction.call(creating({ accountId: '' }), 'payment', 'create');

		await expect(failure).rejects.toThrow(/bank account/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/unsettled schedule/i),
		});
		expect(apiRequest).not.toHaveBeenCalled();
	});

	// `isFlag` on the wire, `isFlagged` on the screen — the short spelling exists
	// only in this write body, and nobody should have to know that.
	it('writes the flag under the name only the write side uses', async () => {
		await executeTransaction.call(creating({ isFlagged: true }), 'payment', 'create');

		expect(bodySent().isFlag).toBe(true);
		expect(bodySent()).not.toHaveProperty('isFlagged');
	});

	it('sends the day, the contact out of the search component, and the lines', async () => {
		await executeTransaction.call(creating(), 'payment', 'create');

		expect(bodySent()).toMatchObject({
			accountId: ACCOUNT,
			stakeholderId: 'a-contact',
			date: '2026-07-27',
			categories: [{ categoryId: CATEGORY, value: 15 }],
		});
	});

	/**
	 * Left empty it has to be genuinely absent, because that absence is what
	 * makes the API copy the date — which is exactly what the field warns about.
	 */
	it('leaves the accrual date out of the body when it was left empty', async () => {
		await executeTransaction.call(creating({ accrualDate: '' }), 'payment', 'create');

		expect(bodySent()).not.toHaveProperty('accrualDate');
	});

	it('sends the accrual date as a plain day when one was chosen', async () => {
		await executeTransaction.call(
			creating({ accrualDate: '2026-06-01T00:00:00.000-03:00' }),
			'payment',
			'create',
		);

		expect(bodySent().accrualDate).toBe('2026-06-01');
	});

	/**
	 * By the **schedule** ID, because that is what this route answers — where the
	 * settlement route answers the entry ID. Reading back by the wrong one finds
	 * nothing at all.
	 */
	it('reads back by the schedule ID this route answers, not by the entry ID', async () => {
		const items = await executeTransaction.call(creating(), 'payment', 'create');

		expect(readBack.mock.calls[0][3]).toBe(`scheduleId eq ${SCHEDULE}`);
		expect(items[0].json).toEqual({ entryId: GUID, scheduleId: SCHEDULE, value: 15 });
	});

	it('refuses an entry with no category line', async () => {
		const failure = executeTransaction.call(
			creating({ categories: { category: [] } }),
			'payment',
			'create',
		);

		await expect(failure).rejects.toThrow(/no category line/i);
	});

	/**
	 * The three branches the schedule answers for, and the reason this operation
	 * stopped being able to abort a batch over a slow list.
	 *
	 * Measured on 2026-08-11: `GET /schedules/credit/{id}` answers in 38–67 ms
	 * right after the POST, where the list of settled entries takes seconds — and
	 * its `isPaid` says which of the two things happened.
	 */
	describe('when the entry cannot be read back', () => {
		beforeEach(() => {
			readBack.mockResolvedValue(undefined);
		});

		const scheduleSaying = (isPaid: boolean) => {
			apiRequest.mockReset();
			apiRequest.mockResolvedValueOnce(SCHEDULE);
			apiRequest.mockResolvedValueOnce({ scheduleId: SCHEDULE, isPaid, value: 15 });
		};

		it('hands back what it knows, with a warning, when the schedule says it was settled', async () => {
			scheduleSaying(true);

			const items = await executeTransaction.call(creating(), 'receipt', 'create');

			expect(items[0].json.scheduleId).toBe(SCHEDULE);
			expect(items[0].json._niboReadBackPending).toEqual(expect.stringContaining(SCHEDULE));
			expect(items[0].pairedItem).toEqual({ item: 0 });
		});

		it('asks the schedule by ID, which is the route measured to answer at once', async () => {
			scheduleSaying(true);

			await executeTransaction.call(creating(), 'receipt', 'create');

			expect(apiRequest.mock.calls[1][1]).toBe('GET');
			expect(apiRequest.mock.calls[1][2]).toBe(`/schedules/credit/${SCHEDULE}`);
		});

		/**
		 * The case the old throw existed for, and could not name: without an account
		 * this route answers 200 and creates an **open** schedule. The money was not
		 * recorded as moved, and saying "do not send it again" would be wrong here.
		 */
		it('fails, and says the money did not move, when the schedule came out open', async () => {
			scheduleSaying(false);

			const failure = executeTransaction.call(creating(), 'receipt', 'create');

			await expect(failure).rejects.toThrow(/open schedule|was not settled/i);
			await expect(failure).rejects.toMatchObject({
				description: expect.stringContaining(SCHEDULE),
			});
		});

		it('keeps the old refusal when the schedule cannot be read either', async () => {
			apiRequest.mockReset();
			apiRequest.mockResolvedValueOnce(SCHEDULE);
			apiRequest.mockRejectedValue(new Error('boom'));

			const failure = executeTransaction.call(creating(), 'receipt', 'create');

			await expect(failure).rejects.toThrow(/was created/i);
			await expect(failure).rejects.toMatchObject({
				description: expect.stringMatching(/twice|again/i),
			});
		});

		/**
		 * The hazard this branch would otherwise carry, and it is worse than the
		 * one it replaces. A schedule can be readable a moment before its paid flag
		 * has caught up — the same eventual consistency that makes this branch run
		 * at all. Calling that an open schedule tells an operator the money did not
		 * move when it did, and the sentence sends them to Settle: the money would
		 * be recorded twice. So a single `false` is never the answer.
		 */
		it('asks again before calling it open, because the flag can lag the record', async () => {
			apiRequest.mockReset();
			apiRequest
				.mockResolvedValueOnce(SCHEDULE)
				.mockResolvedValueOnce({ scheduleId: SCHEDULE, isPaid: false })
				.mockResolvedValueOnce({ scheduleId: SCHEDULE, isPaid: true, value: 15 });

			const items = await executeTransaction.call(creating(), 'receipt', 'create');

			expect(items[0].json._niboReadBackPending).toEqual(expect.any(String));
		});

		it('breathes at least a second before every one of those asks', async () => {
			const waited = sleep as jest.MockedFunction<typeof sleep>;
			apiRequest.mockReset();
			apiRequest.mockResolvedValueOnce(SCHEDULE).mockResolvedValue({ scheduleId: SCHEDULE, isPaid: false });

			await executeTransaction.call(creating(), 'receipt', 'create').catch(() => undefined);

			expect(waited.mock.calls.length).toBeGreaterThanOrEqual(2);
			for (const [ms] of waited.mock.calls) {
				expect(ms).toBeGreaterThanOrEqual(1000);
			}
		});

		it('still calls it open when the flag stays false through every ask', async () => {
			apiRequest.mockReset();
			apiRequest.mockResolvedValueOnce(SCHEDULE).mockResolvedValue({ scheduleId: SCHEDULE, isPaid: false });

			const failure = executeTransaction.call(creating(), 'receipt', 'create');

			await expect(failure).rejects.toThrow(/open schedule|was not settled/i);
		});
	});

	it('never asks the schedule when the list answered', async () => {
		await executeTransaction.call(creating(), 'receipt', 'create');

		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	/**
	 * The option exists so one bad item does not cost the rest of the batch — and
	 * until now it threw away the one thing that proves the money is already in.
	 * The schedule ID lives inside the description, and the description was the
	 * half the catch dropped. Whoever turned the option on to keep the batch was
	 * left holding a sentence about not sending it again, without the ID that
	 * says which one.
	 */
	it('keeps the description, and the ID inside it, when continueOnFail swallows the failure', async () => {
		readBack.mockResolvedValue(undefined);

		const items = await executeTransaction.call(creating({}, true), 'receipt', 'create');

		expect(items[0].json.error).toMatch(/was created/i);
		expect(items[0].json.errorDescription).toEqual(expect.stringContaining(SCHEDULE));
	});
});

/**
 * Undoing a settlement — and the route that took three wrong guesses to find.
 *
 * The project's catalogue documented `DELETE /schedules/{scheduleId}/payments/
 * {paymentId}`, which is a **404**. So are `DELETE /payments/{entryId}` and
 * `DELETE /schedules/{scheduleId}/payments`. The one that answers **204** carries
 * the kind: `DELETE /schedules/debit/{scheduleId}/payments/{entryId}`, and the
 * schedule goes back to unpaid. Measured on 2026-07-27.
 */
describe('executeTransaction — Delete', () => {
	const SCHEDULE = 'f0d1ba25-a132-4dd3-a832-9efadcae3ad1';

	function deleting(parameters: IDataObject = {}) {
		return context({ scheduleId: SCHEDULE, entryId: GUID, ...parameters });
	}

	it.each([
		['payment', `/schedules/debit/${SCHEDULE}/payments/${GUID}`],
		['receipt', `/schedules/credit/${SCHEDULE}/receipts/${GUID}`],
	])('deletes a %s through the route that carries the kind', async (resource, route) => {
		await executeTransaction.call(deleting(), resource, 'delete');

		expect(apiRequest.mock.calls[0][1]).toBe('DELETE');
		expect(apiRequest.mock.calls[0][2]).toBe(route);
	});

	// The segment the catalogue omitted is the difference between 204 and 404.
	it('never sends the route without the kind, which is the 404', async () => {
		await executeTransaction.call(deleting(), 'payment', 'delete');

		expect(apiRequest.mock.calls[0][2]).not.toBe(`/schedules/${SCHEDULE}/payments/${GUID}`);
	});

	/**
	 * The API answers 204 with no body, so the confirmation is built here — and
	 * it says the second thing that happened, which no field of the answer could:
	 * the schedule this entry settled is open again.
	 */
	it('confirms what the 204 does not say, including the schedule reopening', async () => {
		const items = await executeTransaction.call(deleting(), 'payment', 'delete');

		expect(items[0].json).toEqual({
			entryId: GUID,
			scheduleId: SCHEDULE,
			deleted: true,
			scheduleReopened: true,
		});
	});

	it.each([
		['scheduleId', 'entryId'],
		['entryId', 'scheduleId'],
	])('refuses when %s is missing, because the route needs both', async (missing) => {
		const failure = executeTransaction.call(
			deleting({ [missing]: '' }),
			'payment',
			'delete',
		);

		await expect(failure).rejects.toThrow(/ID/);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});
