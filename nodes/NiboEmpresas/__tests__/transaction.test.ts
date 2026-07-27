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

	it.each(['isFlag', 'isDeleted', 'dueDate', 'isPaid'])(
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
		expect(optionValues(forTransactions('operation'))).toEqual(['get', 'list', 'settle']);
		expect(forTransactions('operation')?.default).toBe('list');
	});

	it('asks for the entry ID on Get, and only there', () => {
		expect(forTransactions('entryId')?.displayOptions?.show?.operation).toEqual(['get']);
		expect(forTransactions('entryId')?.required).toBe(true);
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
			['accrualDate', 'date', 'description', 'entryId', 'isFlagged', 'scheduleId', 'stakeholder/name', 'value'].sort(),
		);
	});

	it.each(['isFlag', 'isDeleted', 'dueDate', 'isPaid'])('never offers %s', (field) => {
		expect(optionValues(conditionFields().find((one) => one.name === 'field'))).not.toContain(
			field,
		);
	});

	// The bare-GUID literal the 0.9.0 transport learned, reused here unchanged.
	it('collects the two ID fields in the box that never quotes them', () => {
		for (const path of ['entryId', 'scheduleId']) {
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
});
