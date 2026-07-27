import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeBankAccount } from '../resources/bankAccount/execute';
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

const GUID = '95f309e3-4b64-45df-8c57-ae4a1dbeedd0';

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
 * The bank accounts, and only the reading of them.
 *
 * This resource is here for one reason: **a settlement is refused without an
 * account** — `POST /schedules/debit/{id}/payments` with no `accountId` answers
 * 500 *"Conta bancária não encontrada."* — and the node had nowhere to get one.
 * The full Account resource (balances, transfers, bank statements) is item 6 of
 * the roadmap and is deliberately still out.
 */
describe('executeBankAccount — Get Many', () => {
	it('reads the collection', async () => {
		await executeBankAccount.call(context({ returnAll: true }), 'bankAccount', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts');
	});

	/**
	 * And here the key is `id` — which is worth a test precisely because the two
	 * collections this version sits between do it the other way: `/costcenters`
	 * pages by `costCenterId` and `/payments` by `entryId`, and `id` is a 500 on
	 * both. On `/accounts` it is the reverse: `id` answers 200 and `accountId`
	 * is the 500. Measured on 2026-07-27.
	 */
	it('pages by id, which is this collection and not the neighbouring ones', async () => {
		await executeBankAccount.call(context({ returnAll: true }), 'bankAccount', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('id');
		expect(listRequest.mock.calls[0][2]).not.toBe('accountId');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeBankAccount.call(
			context({ returnAll: false, limit: 4 }),
			'bankAccount',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 4,
			failOnIncomplete: true,
		});
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeBankAccount.call(context({ returnAll: true }, 3), 'bankAccount', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('hands back the records as the API answered them', async () => {
		listRequest.mockResolvedValue({
			records: [{ id: GUID, name: 'Conta corrente', type: 'BankAccount' }],
			count: 1,
		});

		const items = await executeBankAccount.call(
			context({ returnAll: true }),
			'bankAccount',
			'list',
		);

		expect(items[0].json).toEqual({ id: GUID, name: 'Conta corrente', type: 'BankAccount' });
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeBankAccount.call(context({}), 'payment', 'list')).rejects.toThrow(
			/payment/,
		);
	});

	/**
	 * `GET /accounts/{id}` is a 404, so there is no Get to offer — one account is
	 * read through Get Many filtered by ID. And Delete does not exist in this API
	 * at all, which is precisely what the Create screen warns about.
	 */
	it.each(['get', 'update', 'delete'])(
		'refuses "%s", which this resource does not offer',
		async (operation) => {
			await expect(
				executeBankAccount.call(context({}), 'bankAccount', operation),
			).rejects.toThrow(new RegExp(operation));
		},
	);
});

/**
 * The balances, which are a collection of their own rather than a field of the
 * accounts — `GET /accounts/views/balance`, measured on 2026-07-27.
 *
 * Two collections about the same things, and almost nothing carries over: the
 * paging key differs, and the sets of filterable fields barely overlap. That is
 * why this is an operation of its own and not a switch on Get Many.
 */
describe('executeBankAccount — Get Balances', () => {
	it('reads the balance view', async () => {
		await executeBankAccount.call(context({ returnAll: true }), 'bankAccount', 'listBalances');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts/views/balance');
	});

	/**
	 * The mine of this slice. On this view `$orderby=id` and `$orderby=name` are
	 * both HTTP 500 — neither property exists on the DTO — and the key is
	 * `accountId`. It is the exact opposite of `/accounts`, which is the very
	 * collection sitting beside it in this resource.
	 */
	it('pages by accountId, where the accounts themselves page by id', async () => {
		await executeBankAccount.call(context({ returnAll: true }), 'bankAccount', 'listBalances');

		expect(listRequest.mock.calls[0][2]).toBe('accountId');
		expect(listRequest.mock.calls[0][2]).not.toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeBankAccount.call(
			context({ returnAll: false, limit: 7 }),
			'bankAccount',
			'listBalances',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 7,
			failOnIncomplete: true,
		});
	});

	it('hands back the balance and the bank balance as they came', async () => {
		listRequest.mockResolvedValue({
			records: [
				{ accountId: GUID, accountName: 'Conta corrente', balance: 250.5, bankBalance: 0 },
			],
			count: 1,
		});

		const items = await executeBankAccount.call(
			context({ returnAll: true }),
			'bankAccount',
			'listBalances',
		);

		expect(items[0].json).toEqual({
			accountId: GUID,
			accountName: 'Conta corrente',
			balance: 250.5,
			bankBalance: 0,
		});
	});

	describe('the filter it sends', () => {
		function withConditions(conditions: IDataObject[]) {
			return context({ returnAll: true, filters: { conditions } });
		}

		it('writes the account ID bare, like every ID column of this API', async () => {
			await executeBankAccount.call(
				withConditions([{ field: 'accountId', operator: 'eq', guidValue: GUID }]),
				'bankAccount',
				'listBalances',
			);

			expect(optionsSentToTransport().filter).toBe(`accountId eq ${GUID}`);
		});

		it('searches the account name, which is not called name here', async () => {
			await executeBankAccount.call(
				withConditions([
					{ field: 'accountName', operator: 'containsIgnoreCase', value: 'CORRENTE' },
				]),
				'bankAccount',
				'listBalances',
			);

			expect(optionsSentToTransport().filter).toBe("contains(tolower(accountName),'corrente')");
		});

		/**
		 * `isArchived` exists on `/accounts` and is an HTTP 500 here. There is
		 * therefore no way to ask the server for the balances of the accounts still
		 * in use, and a condition that looks like it would is refused before the
		 * request rather than answered with a server error.
		 */
		it('fails the item on isArchived, which is a 500 on this view', async () => {
			await expect(
				executeBankAccount.call(
					withConditions([{ field: 'isArchived', operator: 'eq', booleanValue: false }]),
					'bankAccount',
					'listBalances',
				),
			).rejects.toThrow(/isArchived/);
		});
	});
});

describe('executeBankAccount — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[]) {
		return context({ returnAll: true, filters: { conditions } });
	}

	it('searches the name ignoring case', async () => {
		await executeBankAccount.call(
			withConditions([{ field: 'name', operator: 'containsIgnoreCase', value: 'CORRENTE' }]),
			'bankAccount',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(name),'corrente')");
	});

	it('writes the ID bare, like every ID column of this API', async () => {
		await executeBankAccount.call(
			withConditions([{ field: 'id', operator: 'eq', guidValue: GUID }]),
			'bankAccount',
			'list',
		);

		expect(filterSent()).toBe(`id eq ${GUID}`);
	});

	it('filters the archived ones out or in', async () => {
		await executeBankAccount.call(
			withConditions([{ field: 'isArchived', operator: 'eq', booleanValue: false }]),
			'bankAccount',
			'list',
		);

		expect(filterSent()).toBe('isArchived eq false');
	});

	it('fails the item on isDeleted, which is a 500 on this view', async () => {
		await expect(
			executeBankAccount.call(
				withConditions([{ field: 'isDeleted', operator: 'eq', booleanValue: false }]),
				'bankAccount',
				'list',
			),
		).rejects.toThrow(/isDeleted/);
	});
});

/**
 * Creating an account — the act this API gives no way back from.
 *
 * `DELETE /accounts/{id}` is a 404 and `isArchived` is ignored on a PUT, both
 * measured on 2026-07-27: an account this operation creates is **permanent and
 * visible**, and the only way to tuck it away is Nibo's own screen. The notice
 * on the form says so before the button.
 *
 * And the API moves the opening date: a bare `2026-07-01` on the POST was
 * stored as `2026-06-30` — one day earlier — while the same date on a PUT is
 * stored exactly. So Create reads its work back and repairs the date with a
 * corrective PUT when it drifted.
 */
describe('executeBankAccount — Create', () => {
	const CREATED = 'c0ffee00-1111-2222-3333-444455556666';

	function creating(overrides: IDataObject = {}) {
		return context({
			name: 'CONTA NOVA',
			openBalance: 500,
			dateOfOpenBalance: '2026-07-01T00:00:00.000-03:00',
			...overrides,
		});
	}

	/** What the list answers on each read-back, in order */
	function readBackAnswers(...records: Array<IDataObject | undefined>) {
		listRequest.mockReset();
		for (const record of records.slice(0, -1)) {
			listRequest.mockResolvedValueOnce({
				records: record === undefined ? [] : [record],
				count: record === undefined ? 0 : 1,
			});
		}
		const last = records[records.length - 1];
		listRequest.mockResolvedValue({
			records: last === undefined ? [] : [last],
			count: last === undefined ? 0 : 1,
		});
	}

	const STORED_RIGHT = {
		id: CREATED,
		name: 'CONTA NOVA',
		openBalance: 500,
		dateOfOpenBalance: '2026-07-01T00:00:00Z',
		isArchived: false,
	};
	const STORED_SHIFTED = { ...STORED_RIGHT, dateOfOpenBalance: '2026-06-30T00:00:00Z' };

	beforeEach(() => {
		apiRequest.mockResolvedValue(CREATED);
		readBackAnswers(STORED_RIGHT);
	});

	it('posts the name, the opening balance and the day — and never bankNumber', async () => {
		await executeBankAccount.call(creating(), 'bankAccount', 'create');

		expect(apiRequest.mock.calls[0][1]).toBe('POST');
		expect(apiRequest.mock.calls[0][2]).toBe('/accounts');
		expect(apiRequest.mock.calls[0][4]).toEqual({
			name: 'CONTA NOVA',
			openBalance: 500,
			dateOfOpenBalance: '2026-07-01',
		});
	});

	it('leaves the opening date out of the body when it was not given', async () => {
		readBackAnswers({ ...STORED_RIGHT, dateOfOpenBalance: '2026-07-27T00:00:00Z' });

		await executeBankAccount.call(creating({ dateOfOpenBalance: '' }), 'bankAccount', 'create');

		expect(apiRequest.mock.calls[0][4]).not.toHaveProperty('dateOfOpenBalance');
		// And with nothing asked there is nothing to repair: no PUT.
		expect(apiRequest.mock.calls.filter((call) => call[1] === 'PUT')).toHaveLength(0);
	});

	it('reads the account back through the list, by the bare GUID', async () => {
		const items = await executeBankAccount.call(creating(), 'bankAccount', 'create');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts');
		expect((listRequest.mock.calls[0][3] as unknown as IDataObject).filter).toBe(
			`id eq ${CREATED}`,
		);
		expect(items[0].json).toEqual(STORED_RIGHT);
	});

	/**
	 * The repair this operation exists for. The POST stored the day before the
	 * one that was asked, so the node puts it right with the call that was
	 * measured to store dates exactly.
	 */
	it('repairs the shifted opening date with a corrective PUT', async () => {
		readBackAnswers(STORED_SHIFTED, STORED_RIGHT);

		const items = await executeBankAccount.call(creating(), 'bankAccount', 'create');

		const put = apiRequest.mock.calls.find((call) => call[1] === 'PUT');
		expect(put?.[2]).toBe(`/accounts/${CREATED}`);
		expect((put?.[4] as IDataObject).dateOfOpenBalance).toBe('2026-07-01');
		// The whole record travels, not a fragment: a partial PUT is a 500 here.
		expect((put?.[4] as IDataObject).name).toBe('CONTA NOVA');
		expect(items[0].json).toEqual(STORED_RIGHT);
	});

	it('sends no PUT when the stored date already is the asked one', async () => {
		await executeBankAccount.call(creating(), 'bankAccount', 'create');

		expect(apiRequest.mock.calls.filter((call) => call[1] === 'PUT')).toHaveLength(0);
	});

	it('fails honestly when the repair did not take', async () => {
		readBackAnswers(STORED_SHIFTED, STORED_SHIFTED);

		await expect(
			executeBankAccount.call(creating(), 'bankAccount', 'create'),
		).rejects.toThrow(/opening date/i);
	});

	it('refuses a blank name before anything is sent', async () => {
		await expect(
			executeBankAccount.call(creating({ name: '   ' }), 'bankAccount', 'create'),
		).rejects.toThrow(/name/i);

		expect(apiRequest).not.toHaveBeenCalled();
	});

	/**
	 * The wording matters more here than anywhere: the account **was** created,
	 * and a workflow told otherwise creates it twice — and twice is forever.
	 */
	it('says the account was created when it cannot be read back', async () => {
		readBackAnswers(undefined);

		const failure = executeBankAccount.call(creating(), 'bankAccount', 'create');

		await expect(failure).rejects.toThrow(/was created/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/again/i),
		});
	});
});

/**
 * The bank statement, and the reason this version exists.
 *
 * `POST /accounts/{id}/bankstatement` answers **204 with no body** whatever
 * happens, and it accepts a batch **half way** without a word: a line dated
 * before the account was opened, or dated in a shape the API cannot read, is
 * dropped in silence while the rest goes in. Measured on 2026-07-27 — a batch of
 * two moved the pending counter by one.
 *
 * And there is no way to check afterwards. Every route that would read the
 * reconciliation queue is a 404; the only observable sign is
 * `pendingReconciliationCount` on the balance view, which counts transactions
 * rather than batches and takes **minutes** to move. So every defense this
 * operation has must happen before the request, because after it there is
 * nothing left to defend with.
 */
describe('executeBankAccount — Import Bank Statement', () => {
	const OPENED = '2026-01-01T00:00:00';
	const OTHER_ACCOUNT = '7c2b1d0a-9e64-4c53-b1aa-0f7c2d9e4b31';

	/** One input item per statement line, plus what is read off the first of them */
	function importing(lines: IDataObject[], shared: IDataObject = {}) {
		const common: IDataObject = { accountId: GUID, batchName: 'extrato.csv', ...shared };

		return {
			getInputData: () => lines.map(() => ({ json: {} })),
			getNodeParameter: (name: string, index: number, fallback?: unknown) =>
				lines[index]?.[name] ?? common[name] ?? fallback,
			getNode: () => NODE,
			continueOnFail: () => false,
		} as unknown as IExecuteFunctions;
	}

	const LINE = { description: 'PIX RECEBIDO', value: -10.5, date: '2026-07-27T00:00:00.000-03:00' };

	function bodySent(): IDataObject {
		return apiRequest.mock.calls[0][4] as IDataObject;
	}

	beforeEach(() => {
		listRequest.mockResolvedValue({
			records: [{ id: GUID, name: 'Conta corrente', dateOfOpenBalance: OPENED }],
			count: 1,
		});
	});

	/**
	 * The first aggregating operation of this node, and it aggregates because the
	 * API's format is a batch. One item in, one line of the statement.
	 */
	it('turns any number of items into one call', async () => {
		await executeBankAccount.call(
			importing([LINE, { ...LINE, value: 20 }, { ...LINE, value: -3 }]),
			'bankAccount',
			'importBankStatement',
		);

		const writes = apiRequest.mock.calls.filter((call) => call[1] === 'POST');

		expect(writes).toHaveLength(1);
		expect((bodySent().transactions as IDataObject[])).toHaveLength(3);
	});

	it('posts to the statement route of the account', async () => {
		await executeBankAccount.call(importing([LINE]), 'bankAccount', 'importBankStatement');

		expect(apiRequest.mock.calls[0][1]).toBe('POST');
		expect(apiRequest.mock.calls[0][2]).toBe(`/accounts/${GUID}/bankstatement`);
	});

	it('reads the description, the value and the date of each item', async () => {
		await executeBankAccount.call(
			importing([LINE, { description: 'TARIFA', value: -8, date: '2026-07-28' }]),
			'bankAccount',
			'importBankStatement',
		);

		expect(bodySent().transactions).toEqual([
			{ description: 'PIX RECEBIDO', value: -10.5, date: '2026-07-27' },
			{ description: 'TARIFA', value: -8, date: '2026-07-28' },
		]);
	});

	/**
	 * One batch goes to one account and carries one name, so both are read off the
	 * first item. What the others say about them is not ignored — see the refusal
	 * below.
	 */
	it('takes the batch name from the first item', async () => {
		await executeBankAccount.call(
			importing([LINE, LINE], { batchName: 'julho.ofx' }),
			'bankAccount',
			'importBankStatement',
		);

		expect(bodySent().batchName).toBe('julho.ofx');
	});

	it('answers one item for the whole batch, carrying the count', async () => {
		const items = await executeBankAccount.call(
			importing([LINE, LINE]),
			'bankAccount',
			'importBankStatement',
		);

		expect(items).toHaveLength(1);
		expect(items[0].json).toMatchObject({
			accountId: GUID,
			batchName: 'extrato.csv',
			transactionCount: 2,
		});
	});

	/**
	 * A bare `success: true` would be the exact kind of lie this node exists not
	 * to tell: the API said 204 and 204 says nothing about what was filed.
	 */
	it('does not pretend Nibo confirmed anything, and says where to look', async () => {
		const items = await executeBankAccount.call(
			importing([LINE]),
			'bankAccount',
			'importBankStatement',
		);

		expect(items[0].json).not.toHaveProperty('success');
		expect(String(items[0].json._niboReconciliationNotice)).toMatch(/minutes|Get Balances/i);
		expect(String(items[0].json._niboReconciliationNotice)).toMatch(
			/pendingReconciliationCount/,
		);
	});

	describe('the refusals, which all happen before anything is sent', () => {
		async function refused(
			lines: IDataObject[],
			shared: IDataObject,
			expected: RegExp,
		): Promise<void> {
			await expect(
				executeBankAccount.call(importing(lines, shared), 'bankAccount', 'importBankStatement'),
			).rejects.toThrow(expected);

			expect(apiRequest.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(0);
		}

		/**
		 * **The defense this version is about.** The line is swallowed with a 204 and
		 * cannot be read back, so the refusal has to name which line it is — in a
		 * batch of two hundred, "an invalid date" is not information — and the date it
		 * is being compared with, which is a property of the account and is precisely
		 * what the API leaves out when it complains about this elsewhere.
		 */
		it('refuses a line dated before the account was opened, naming the line and the date', async () => {
			await expect(
				executeBankAccount.call(
					importing([LINE, { ...LINE, date: '2025-12-31' }]),
					'bankAccount',
					'importBankStatement',
				),
			).rejects.toThrow(/item 1/i);

			await expect(
				executeBankAccount.call(
					importing([LINE, { ...LINE, date: '2025-12-31' }]),
					'bankAccount',
					'importBankStatement',
				),
			).rejects.toMatchObject({ description: expect.stringContaining('2026-01-01') });

			expect(apiRequest.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(0);
		});

		it('lets a line dated on the opening day itself through', async () => {
			await executeBankAccount.call(
				importing([{ ...LINE, date: '2026-01-01' }]),
				'bankAccount',
				'importBankStatement',
			);

			expect(bodySent().transactions).toEqual([
				{ description: 'PIX RECEBIDO', value: -10.5, date: '2026-01-01' },
			]);
		});

		/**
		 * `29/07/2026` is the shape a Brazilian spreadsheet writes, and the API takes
		 * it with a 204 and files nothing. Refused here — and `07/12/2026` is refused
		 * with it, because nothing in the value says whether it is 7 December or 12
		 * July, and guessing would file the money in the wrong month.
		 */
		it.each(['29/07/2026', '07/12/2026', 'ontem', ''])(
			'refuses the date "%s", which this node will not guess at',
			async (date) => {
				await refused([LINE, { ...LINE, date }], {}, /item 1/i);
			},
		);

		it('refuses a value that is not a number', async () => {
			await refused([{ ...LINE, value: 'muito' }], {}, /item 0/i);
		});

		it('refuses items that name different accounts, because one batch has one account', async () => {
			await refused([LINE, { ...LINE, accountId: OTHER_ACCOUNT }], {}, /one account/i);
		});

		/**
		 * The same rule the account list has followed since 0.10.0: an account ID
		 * belongs to one organization, so a batch cannot belong to two.
		 */
		it('refuses the per-item token mode, where a batch would span organizations', async () => {
			await refused([LINE], { authMode: 'field' }, /per item/i);
		});

		it('refuses a batch with no account at all', async () => {
			await refused([LINE], { accountId: '' }, /no bank account/i);
		});

		it('refuses an empty batch rather than sending one', async () => {
			await refused([], {}, /no line/i);
		});
	});

	/**
	 * The opening date is a property of the **account**, and the only way to know
	 * it is to ask. `GET /accounts/{id}` is a 404, so it is read through the list
	 * filtered by ID — bare, as this API compares an ID column.
	 */
	it('reads the account first, to learn the day it was opened', async () => {
		await executeBankAccount.call(importing([LINE]), 'bankAccount', 'importBankStatement');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts');
		expect((listRequest.mock.calls[0][3] as unknown as IDataObject).filter).toBe(`id eq ${GUID}`);
	});

	it('refuses when Nibo has no such account, instead of writing into nothing', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		await expect(
			executeBankAccount.call(importing([LINE]), 'bankAccount', 'importBankStatement'),
		).rejects.toThrow(/no bank account/i);

		expect(apiRequest.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(0);
	});

	/**
	 * An account with no opening date recorded has nothing to compare against.
	 * Refusing every line for that would be refusing on a rule the account does
	 * not have.
	 */
	it('imports without the date check when the account has no opening date', async () => {
		listRequest.mockResolvedValue({ records: [{ id: GUID, name: 'Conta corrente' }], count: 1 });

		await executeBankAccount.call(
			importing([{ ...LINE, date: '1999-01-01' }]),
			'bankAccount',
			'importBankStatement',
		);

		expect(bodySent().transactions).toHaveLength(1);
	});
});

/**
 * The list behind the account field of a settlement.
 *
 * Same shape as every other list of this node, and the same refusal in the
 * per-item token mode — an account ID belongs to one organization.
 */
describe('loadBankAccounts', () => {
	const ACCOUNTS = [
		{ id: 'a', name: 'Conta corrente', bankNumber: 341, isArchived: false },
		{ id: 'b', name: 'Caixinha', bankNumber: 0, isArchived: false },
	];

	let request: jest.Mock;

	function loadContext(parameters: IDataObject, items: IDataObject[] = ACCOUNTS) {
		request = jest.fn().mockResolvedValue({ items, count: items.length });

		return {
			getCurrentNodeParameter: (name: string) => parameters[name],
			getNode: () => NODE,
			getCredentials: jest.fn().mockResolvedValue({ baseUrl: '' }),
			helpers: { httpRequestWithAuthentication: request },
		} as never;
	}

	it('reads the accounts by name, with the credential', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		const list = await loadBankAccounts.call(loadContext({ authMode: 'credential' }));

		expect(request.mock.calls[0][0]).toBe('niboEmpresasApi');
		expect(request.mock.calls[0][1].url).toContain('/accounts');
		expect(request.mock.calls[0][1].qs.$orderby).toBe('name');
		expect(list.map((option) => option.value)).toEqual(['a', 'b']);
	});

	/**
	 * An archived account is one somebody put away on purpose. Offering it on
	 * the form that files money into an account would be offering the one answer
	 * its owner already said no to — and `isArchived eq false` was measured to
	 * answer 200, so it costs nothing to leave them out on the server.
	 */
	it('leaves the archived accounts out, on the server', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		await loadBankAccounts.call(loadContext({ authMode: 'credential' }));

		expect(request.mock.calls[0][1].qs.$filter).toBe('isArchived eq false');
	});

	it('refuses in the per-item token mode, and points at the resource instead', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		const failure = loadBankAccounts.call(loadContext({ authMode: 'field' }));

		await expect(failure).rejects.toThrow(/per item/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/Bank Account/),
		});
		expect(request).not.toHaveBeenCalled();
	});

	/**
	 * The emptiness that matters most in this whole version: an organization can
	 * genuinely have no bank account — the test company had none — and without
	 * one **no settlement is possible at all**. So the message says what to do,
	 * not just that the list is empty.
	 */
	it('explains an empty answer, because without an account no settlement is possible', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		const failure = loadBankAccounts.call(loadContext({ authMode: 'credential' }, []));

		await expect(failure).rejects.toThrow(/no bank account/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/settle|Nibo/i),
		});
	});
});

describe('NiboEmpresas — Bank Account on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forAccounts(name: string, operation = 'list'): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('bankAccount') &&
				// The Operation field itself names no operation, and a field shown on
				// every one of them names none either: both belong to whichever is asked
				// for.
				((prop.displayOptions?.show?.operation ?? [operation]) as string[]).includes(operation),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	it('opens the menu, being the first name alphabetically', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names[0]).toBe('Bank Account');
		expect(names).toEqual([...names].sort());
	});

	it('is named in the credential like every other resource', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('bankAccount');
	});

	it('offers the operations this version measured, alphabetically by label', () => {
		const operation = forAccounts('operation');

		expect(optionValues(operation)).toEqual([
			'create',
			'listBalances',
			'list',
			'importBankStatement',
		]);
		expect((operation?.options as INodePropertyOptions[]).map((one) => one.name)).toEqual([
			'Create',
			'Get Balances',
			'Get Many',
			'Import Bank Statement',
		]);
		expect(operation?.default).toBe('list');
	});

	it('asks for the name, the opening balance and the opening day on Create', () => {
		expect(forAccounts('name', 'create')?.required).toBe(true);
		expect(forAccounts('openBalance', 'create')?.type).toBe('number');
		expect(forAccounts('dateOfOpenBalance', 'create')?.typeOptions?.dateOnly).toBe(true);
	});

	/**
	 * `bankNumber` is what anybody would expect on this form, and it is not
	 * there on purpose: the POST ignores it in silence — 341 went in, 0 came
	 * out, measured on 2026-07-27. A field the screen collects and the server
	 * throws away is a form that lies.
	 */
	it('never offers bankNumber, which the POST ignores in silence', () => {
		expect(forAccounts('bankNumber', 'create')).toBeUndefined();
	});

	it('warns before the button that a created account has no way back', () => {
		const notice = forAccounts('createAccountNotice', 'create');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/deleted|archived/i);
	});

	it('asks for the account, the batch and the three fields of a line on the import', () => {
		for (const name of ['accountId', 'batchName', 'description', 'value', 'date']) {
			expect(
				forAccounts(name, 'importBankStatement')?.displayOptions?.show?.operation,
			).toEqual(['importBankStatement']);
		}
	});

	it('asks for the day and not the moment, as the API takes no hour', () => {
		expect(forAccounts('date', 'importBankStatement')?.typeOptions?.dateOnly).toBe(true);
	});

	/**
	 * The one screen of this resource that has to warn before the button: the API
	 * takes a batch half way and says nothing, and nothing can be read back
	 * afterwards.
	 */
	it('warns on the import screen that Nibo does not confirm what it filed', () => {
		const notice = forAccounts('importNotice', 'importBankStatement');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/reconcil/i);
	});

	/** The fields of one row of the condition builder of a given operation */
	function conditionFields(operation = 'list'): INodeProperties[] {
		const collections = (forAccounts('filters', operation)?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(['id', 'isArchived', 'isVirtual', 'name'].sort());
	});

	/**
	 * `type` is left off on purpose, and it is the one absence that is not a 500:
	 * `type eq 'BankAccount'` answers 200. But one value seen is not an
	 * enumeration, and a closed list of a set nobody has counted would offer
	 * answers the API may not have. It goes on the menu the day the set is
	 * measured.
	 */
	it('leaves type off, because one value seen is not a closed list', () => {
		expect(optionValues(conditionFields().find((one) => one.name === 'field'))).not.toContain(
			'type',
		);
	});

	/**
	 * The balance view has a menu of its own, and it has to: the two collections
	 * disagree on the name of nearly every field they both have, and `isArchived`
	 * is a 500 on one and a filter on the other. One menu with a switch would be a
	 * screen whose chosen field can turn into a server error.
	 */
	it('gives Get Balances the fields measured on the balance view', () => {
		const field = conditionFields('listBalances').find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(
			['accountId', 'accountName', 'balance', 'bankBalance', 'isReconcilable', 'isVirtual'].sort(),
		);
	});

	it('never offers isArchived on the balances, where it is a 500', () => {
		expect(
			optionValues(conditionFields('listBalances').find((one) => one.name === 'field')),
		).not.toContain('isArchived');
	});

	/**
	 * The hand-written expression is offered on every scan of this node, and a
	 * scan the option cannot see is a scan whose filter box is missing from the
	 * screen.
	 */
	it('offers the hand-written OData expression on the balances too', () => {
		const options = (property('options')?.options ?? []) as INodeProperties[];
		const filter = options.find((one) => one.name === 'filter');

		expect(filter?.displayOptions?.show?.['/operation']).toContain('listBalances');
	});
});
