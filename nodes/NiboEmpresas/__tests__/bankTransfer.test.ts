import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeBankTransfer } from '../resources/bankTransfer/execute';
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

const TRANSFER = '95f309e3-4b64-45df-8c57-ae4a1dbeedd0';
const ORIGIN = '2efffcd0-8730-4348-86da-6d9a95be6149';

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
	apiRequest.mockResolvedValue(undefined);
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The transfers, which are a resource because the API made them one.
 *
 * `GET /accounts/transfer` and `DELETE /accounts/transfer/{id}` are in no
 * documentation at all — not Nibo's, not this project's catalogue, which knew
 * only the `POST`. They were found on 2026-07-27 by a 500 that said
 * *"Transferência não encontrada"* where a 404 was expected: a 404 says the
 * route is not there, and that sentence says it is and the ID is wrong.
 *
 * A record is **three top-level fields** — `id`, `originEntry`, `destinyEntry` —
 * with two whole entries nested inside. Nothing an account carries is on it, and
 * that is why this is a resource of its own rather than an operation of Bank
 * Account.
 */
describe('executeBankTransfer — Get Many', () => {
	it('reads the collection that no documentation mentions', async () => {
		await executeBankTransfer.call(context({ returnAll: true }), 'bankTransfer', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts/transfer');
	});

	/**
	 * `id` is the key here, and it is the only field of the three that can be
	 * one: `date`, `value`, `createDate`, `transferId` and `originEntryId` are all
	 * HTTP 500, because none of them is a top-level property of this DTO.
	 */
	it('pages by id, the only top-level field that sorts', async () => {
		await executeBankTransfer.call(context({ returnAll: true }), 'bankTransfer', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeBankTransfer.call(
			context({ returnAll: false, limit: 3 }),
			'bankTransfer',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 3,
			failOnIncomplete: true,
		});
	});

	/**
	 * The same entry is worth −123,45 here and +123,45 in `/payments`. It is the
	 * third time this project meets the pattern, and the node forwards the sign as
	 * it came: inventing a rule of its own would be a fourth convention.
	 */
	it('hands back the nested entries with their signs untouched', async () => {
		listRequest.mockResolvedValue({
			records: [
				{
					id: TRANSFER,
					originEntry: { value: -123.45, account: { id: ORIGIN } },
					destinyEntry: { value: 123.45 },
				},
			],
			count: 1,
		});

		const items = await executeBankTransfer.call(
			context({ returnAll: true }),
			'bankTransfer',
			'list',
		);

		expect((items[0].json.originEntry as IDataObject).value).toBe(-123.45);
		expect((items[0].json.destinyEntry as IDataObject).value).toBe(123.45);
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeBankTransfer.call(context({ returnAll: true }, 3), 'bankTransfer', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeBankTransfer.call(context({}), 'bankAccount', 'list')).rejects.toThrow(
			/bankAccount/,
		);
	});

	it.each(['get', 'update'])('refuses "%s", which this API has no route for', async (operation) => {
		await expect(
			executeBankTransfer.call(context({}), 'bankTransfer', operation),
		).rejects.toThrow(new RegExp(operation));
	});
});

/**
 * The filters go by the nested path, because that is where the fields are. The
 * OData builder has written a path with a `/` since 0.5.0 and five resources
 * already filter that way — what is new here is the depth: three levels, against
 * the two of `document/number`.
 */
describe('executeBankTransfer — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[]) {
		return context({ returnAll: true, filters: { conditions } });
	}

	it('filters by the account the money left, three levels down', async () => {
		await executeBankTransfer.call(
			withConditions([{ field: 'originEntry/account/id', operator: 'eq', guidValue: ORIGIN }]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe(`originEntry/account/id eq ${ORIGIN}`);
	});

	it('filters by the account the money reached', async () => {
		await executeBankTransfer.call(
			withConditions([{ field: 'destinyEntry/account/id', operator: 'eq', guidValue: ORIGIN }]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe(`destinyEntry/account/id eq ${ORIGIN}`);
	});

	it('filters by the date of the origin entry', async () => {
		await executeBankTransfer.call(
			withConditions([{ field: 'originEntry/date', operator: 'ge', dateValue: '2026-07-27' }]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe('originEntry/date ge 2026-07-27');
	});

	/**
	 * The description of a transfer arrives in `identifier`. There is no
	 * `description` field on the record at all — not nested, not on `/payments`
	 * — which is the sort of thing only a measurement tells you.
	 */
	it('searches the description where the API keeps it, in identifier', async () => {
		await executeBankTransfer.call(
			withConditions([
				{ field: 'originEntry/identifier', operator: 'containsIgnoreCase', value: 'APORTE' },
			]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(originEntry/identifier),'aporte')");
	});

	it.each(['date', 'value', 'createDate', 'transferId', 'originEntryId'])(
		'fails the item on "%s", a top-level name that is a 500 here',
		async (field) => {
			await expect(
				executeBankTransfer.call(
					withConditions([{ field, operator: 'eq', value: 'x' }]),
					'bankTransfer',
					'list',
				),
			).rejects.toThrow(new RegExp(field));
		},
	);
});

/**
 * Undoing a transfer, which really does undo it: the record leaves the
 * collection and the two entries it created go with it, so the balances of both
 * accounts return to what they were.
 */
describe('executeBankTransfer — Delete', () => {
	it('deletes through the route the 500 gave away', async () => {
		await executeBankTransfer.call(
			context({ transferId: TRANSFER }),
			'bankTransfer',
			'delete',
		);

		expect(apiRequest.mock.calls[0][1]).toBe('DELETE');
		expect(apiRequest.mock.calls[0][2]).toBe(`/accounts/transfer/${TRANSFER}`);
	});

	/**
	 * Unlike the delete of 0.10.0, there is no second thing to name: this really
	 * removes the resource of the screen, rather than reopening something else.
	 */
	it('answers deleted, which is what every Delete of this node answers', async () => {
		const items = await executeBankTransfer.call(
			context({ transferId: TRANSFER }),
			'bankTransfer',
			'delete',
		);

		expect(items[0].json).toEqual({ id: TRANSFER, deleted: true });
	});

	it('refuses an empty ID before it can become a request on the collection', async () => {
		await expect(
			executeBankTransfer.call(context({ transferId: '  ' }), 'bankTransfer', 'delete'),
		).rejects.toThrow(/no record ID/i);

		expect(apiRequest).not.toHaveBeenCalled();
	});
});

/**
 * Making one, which is the operation with a defense in front of it.
 *
 * Three of this route's error messages are wrong in the same way: a missing
 * origin account, a missing destination account and an account that does not
 * exist all answer HTTP 500 *"Não é possivel transferir valores de/para contas
 * virtuais"*. The account is not virtual — it was not sent, or it is not there —
 * and anybody reading that sentence goes looking for a setting that has nothing
 * to do with it.
 */
describe('executeBankTransfer — Create', () => {
	const DESTINATION = '7c2b1d0a-9e64-4c53-b1aa-0f7c2d9e4b31';
	const CREATED = 'c0ffee00-1111-2222-3333-444455556666';

	function creating(overrides: IDataObject = {}) {
		return context({
			originAccountId: ORIGIN,
			destinyAccountId: DESTINATION,
			date: '2026-07-27T00:00:00.000-03:00',
			value: 123.45,
			description: 'Aporte',
			...overrides,
		});
	}

	/**
	 * What the collection answers before the write, and then after it. The reset
	 * is what makes it authoritative: without it a second call would queue behind
	 * the first and the read before the write would answer somebody else's setup.
	 */
	function collectionGoes(before: IDataObject[], ...after: IDataObject[][]) {
		listRequest.mockReset();
		listRequest.mockResolvedValueOnce({ records: before, count: before.length });

		after.forEach((records, index) =>
			index === after.length - 1
				? listRequest.mockResolvedValue({ records, count: records.length })
				: listRequest.mockResolvedValueOnce({ records, count: records.length }),
		);
	}

	const NEW_RECORD = {
		id: CREATED,
		originEntry: { value: -123.45, identifier: 'Aporte', account: { id: ORIGIN } },
		destinyEntry: { value: 123.45, account: { id: DESTINATION } },
	};

	beforeEach(() => collectionGoes([], [NEW_RECORD]));

	/**
	 * The look that used to go out the instant the POST returned. The window here
	 * was three tries over a second and a half, justified by one isolated reading
	 * of 335 ms — the same method that calibrated the settled-entry window at six
	 * seconds and was measured wrong by production on 2026-08-10. This API answers
	 * 429 above roughly fourteen calls a second, tighter in business hours, and a
	 * look that cannot succeed yet is budget spent to be told no.
	 */
	it('breathes for at least a second before every look, the first one included', async () => {
		const waited = sleep as jest.MockedFunction<typeof sleep>;
		waited.mockClear();

		await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		expect(waited.mock.calls.length).toBeGreaterThanOrEqual(1);
		for (const [ms] of waited.mock.calls) {
			expect(ms).toBeGreaterThanOrEqual(1000);
		}
	});

	it('posts the body the API was measured to take', async () => {
		await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		expect(apiRequest.mock.calls[0][1]).toBe('POST');
		expect(apiRequest.mock.calls[0][2]).toBe('/accounts/transfer');
		expect(apiRequest.mock.calls[0][4]).toEqual({
			originAccountId: ORIGIN,
			destinyAccountId: DESTINATION,
			// The day that was chosen is the day that travels: the editor hands over
			// the moment with its offset, and midnight in Brasília is the day before
			// in UTC.
			date: '2026-07-27',
			value: 123.45,
			description: 'Aporte',
		});
	});

	/**
	 * Omitted, the API invents one — *"Transferência de {origin} para {destiny}"* —
	 * and answers 204 all the same. So a blank one has to be genuinely absent
	 * rather than sent empty.
	 */
	it('leaves the description out when it is blank, and the API writes its own', async () => {
		collectionGoes([], [{ ...NEW_RECORD, originEntry: { identifier: 'Transferência de A para B' } }]);

		const items = await executeBankTransfer.call(
			creating({ description: '   ' }),
			'bankTransfer',
			'create',
		);

		expect(apiRequest.mock.calls[0][4]).not.toHaveProperty('description');
		expect((items[0].json.originEntry as IDataObject).identifier).toBe(
			'Transferência de A para B',
		);
	});

	it('hands back the record it read, which is where the ID comes from', async () => {
		const items = await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		expect(items[0].json.id).toBe(CREATED);
	});

	/**
	 * The POST answers **204 with no body at all** — no ID, nothing. Without the
	 * read-back the operation would hand back what the user typed, which is
	 * indistinguishable from a call that wrote nothing, and the Delete next door
	 * would have no ID to work with.
	 *
	 * Which of the records is the new one is answered by looking before and
	 * looking again: anything else would have to guess between two transfers of
	 * the same amount on the same day.
	 */
	it('tells the new transfer from the ones that were already there', async () => {
		const OLD = { id: TRANSFER, originEntry: { value: -50 }, destinyEntry: { value: 50 } };
		collectionGoes([OLD], [OLD, NEW_RECORD]);

		const items = await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		expect(items[0].json.id).toBe(CREATED);
	});

	it('reads the collection through the two accounts, which are nested paths', async () => {
		await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		const filter = String((listRequest.mock.calls[0][3] as unknown as IDataObject).filter);

		expect(filter).toContain(`originEntry/account/id eq ${ORIGIN}`);
		expect(filter).toContain(`destinyEntry/account/id eq ${DESTINATION}`);
	});

	it('forwards the negative sign of the origin entry as it came', async () => {
		const items = await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		expect((items[0].json.originEntry as IDataObject).value).toBe(-123.45);
	});

	it('asks again when the collection has not caught up yet', async () => {
		collectionGoes([], [], [NEW_RECORD]);

		const items = await executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		expect(items[0].json.id).toBe(CREATED);
		expect(listRequest).toHaveBeenCalledTimes(3);
	});

	/**
	 * And when it never appears, the sentence has to be exactly right: the money
	 * **moved**. Telling a workflow it failed is what makes it transfer twice.
	 */
	it('says the transfer went through when it cannot be read back', async () => {
		collectionGoes([], []);

		const failure = executeBankTransfer.call(creating(), 'bankTransfer', 'create');

		await expect(failure).rejects.toThrow(/could not be read back/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/again/i),
		});
	});

	describe('the refusals, which all happen before anything is sent', () => {
		async function refused(overrides: IDataObject, expected: RegExp) {
			await expect(
				executeBankTransfer.call(creating(overrides), 'bankTransfer', 'create'),
			).rejects.toThrow(expected);

			expect(apiRequest).not.toHaveBeenCalled();
			expect(listRequest).not.toHaveBeenCalled();
		}

		it('refuses the same account on both sides', async () => {
			await refused({ destinyAccountId: ORIGIN }, /same account/i);
		});

		it.each([0, -1])('refuses the value %s, which has to be positive', async (value) => {
			await refused({ value }, /positive/i);
		});

		/**
		 * The one that matters most: left blank, the API blames a virtual account.
		 * The refusal here has to name the field that is actually empty, and it must
		 * not repeat the API's word for it.
		 */
		it('refuses a blank origin account, naming the field and not the API’s wrong reason', async () => {
			await refused({ originAccountId: '' }, /origin account/i);

			// The message says which field is empty; the explanation underneath is
			// where the API's sentence is quoted and taken apart, so that nobody who
			// meets it elsewhere goes hunting for a virtual-account setting.
			await expect(
				executeBankTransfer.call(creating({ originAccountId: '' }), 'bankTransfer', 'create'),
			).rejects.toMatchObject({ description: expect.stringMatching(/virtual/i) });
		});

		it('refuses a blank destination account', async () => {
			await refused({ destinyAccountId: '  ' }, /destination account/i);
		});
	});

	/**
	 * And the rule this version deliberately does **not** have.
	 *
	 * A settlement dated before the account's opening balance is an HTTP 500. The
	 * first draft of this slice proposed refusing the same thing here, by analogy.
	 * It was measured on 2026-07-27: a transfer dated before the account was opened
	 * answers **204 and is accepted**. A defense there would block an operation the
	 * API allows — the rule belongs to the bank statement, and only to it.
	 */
	it('sends a date earlier than the account was opened, because the API takes it', async () => {
		await executeBankTransfer.call(
			creating({ date: '1999-01-01T00:00:00.000-03:00' }),
			'bankTransfer',
			'create',
		);

		expect(apiRequest.mock.calls[0][4]).toMatchObject({ date: '1999-01-01' });
	});
});

describe('NiboEmpresas — Bank Transfer on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forTransfers(name: string, operation = 'list'): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('bankTransfer') &&
				((prop.displayOptions?.show?.operation ?? [operation]) as string[]).includes(operation),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	/**
	 * Right after Bank Account, which is where the eye looks for it — and it
	 * matters more here than it would elsewhere, because a community node has no
	 * search in its Actions tab and cannot be given one.
	 */
	it('sits next to Bank Account on the menu', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([...names].sort());
		expect(names[names.indexOf('Bank Account') + 1]).toBe('Bank Transfer');
	});

	it('is named in the credential, without which it would have none', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('bankTransfer');
	});

	it('offers the operations this version measured', () => {
		expect(optionValues(forTransfers('operation'))).toEqual(['create', 'delete', 'list']);
		expect(forTransfers('operation')?.default).toBe('list');
	});

	it('asks for both accounts on Create, each from the list of the organization', () => {
		for (const name of ['originAccountId', 'destinyAccountId']) {
			const field = forTransfers(name, 'create');

			expect(field?.typeOptions?.loadOptionsMethod).toBe('loadBankAccounts');
			expect(field?.required).toBe(true);
			expect(field?.displayOptions?.show?.operation).toEqual(['create']);
		}
	});

	/**
	 * A transfer happens on a day. The API takes `YYYY-MM-DD` and there is no hour
	 * in it, so a clock would offer a decision that does not exist — and one with
	 * a wrong answer, since midnight in Brasília is the day before in UTC.
	 */
	it('asks for the day and not the moment', () => {
		expect(forTransfers('date', 'create')?.typeOptions?.dateOnly).toBe(true);
	});

	it('leaves the description optional, because the API writes one itself', () => {
		expect(forTransfers('description', 'create')?.required).toBeUndefined();
	});

	/** The fields of one row of this resource's condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (forTransfers('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the nested paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(
			[
				'destinyEntry/account/id',
				'id',
				'originEntry/account/id',
				'originEntry/date',
				'originEntry/identifier',
				'originEntry/value',
			].sort(),
		);
	});

	it('never offers the top-level names that answer 500', () => {
		const offered = optionValues(conditionFields().find((one) => one.name === 'field'));

		for (const name of ['date', 'value', 'createDate', 'transferId', 'originEntryId']) {
			expect(offered).not.toContain(name);
		}
	});

	it('asks for the transfer ID on Delete, and only there', () => {
		const id = forTransfers('transferId', 'delete');

		expect(id?.type).toBe('string');
		expect(id?.displayOptions?.show?.operation).toEqual(['delete']);
	});
});
