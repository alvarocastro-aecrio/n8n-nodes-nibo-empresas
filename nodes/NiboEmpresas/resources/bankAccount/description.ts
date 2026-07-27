import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The bank accounts: the list of them, and what is in them.
 *
 * The resource arrived in 0.10.0 with a single operation, and it arrived out of
 * obligation: **a settlement is refused without an account** — `POST
 * /schedules/debit/{id}/payments` with no `accountId` answers HTTP 500 *"Conta
 * bancária não encontrada."* — so the node needed somewhere to read an ID. That
 * left a resource whose name promised money and which could only hand out
 * identifiers.
 *
 * 0.11.0 pays that debt. **Get Balances** reads what each account holds, and
 * **Import Bank Statement** files a statement into the reconciliation queue.
 * Moving money between two accounts is next door, in Bank Transfer: a transfer
 * is a record of its own in this API, with its own collection and its own ID.
 *
 * Creating and editing an account stay out, and by decision rather than by
 * omission: `DELETE /accounts/{id}` is a 404, so an account created by mistake
 * is permanent, and `PUT` is the door to `balanceLockDate` — moving it back
 * unlocks a closed accounting period.
 */
const BANK_ACCOUNT = 'bankAccount';

export const bankAccountResources: INodePropertyOptions[] = [
	{
		name: 'Bank Account',
		value: BANK_ACCOUNT,
		description: 'An account of the organization, which a settled entry has to name',
	},
];

/**
 * There is still no **Get**, and it is measurement rather than an oversight:
 * `GET /accounts/{id}` is a **404**. One account is read through Get Many
 * filtered by its ID, which is the same door `/payments` has.
 *
 * Alphabetical by name, which is what the n8n linter requires — and it happens
 * to read in the right order too: the balances before the accounts they belong
 * to is odd, but a menu sorted any other way would be a lie about what the
 * editor shows.
 */
export const bankAccountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a bank account',
				description:
					'Open a new account in the organization — an act this API gives no way back from',
			},
			{
				name: 'Get Balances',
				value: 'listBalances',
				action: 'Get the balances of the bank accounts',
				description:
					'Retrieve what each account holds, from the balance view — a collection of its own, with its own fields',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many bank accounts',
				description: 'Retrieve the bank accounts of the organization',
			},
			{
				name: 'Import Bank Statement',
				value: 'importBankStatement',
				action: 'Import a bank statement',
				description:
					'Send the lines of a statement to the reconciliation queue of an account, one input item per line',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a bank account',
				description:
					'Change the fields you list and leave every other one as it is — including the balance lock date, which is how a closing automation locks a period',
			},
		],
		default: 'list',
	},
];

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-27.
 *
 * **`isDeleted` is a 500** here as it is on the categories, the cost centres
 * and the settled entries — the field is simply not on these views.
 *
 * And one absence that is **not** a 500, which is rarer and worth the note:
 * **`type`**. `type eq 'BankAccount'` answers 200 perfectly well. It is off the
 * menu because one value seen is not an enumeration — a closed list built from
 * the single type the test company happened to have would offer answers this
 * API may not accept. It goes on the day the set is counted.
 *
 * Alphabetical by label, as the editor shows and the linter requires.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'ID', path: 'id', type: 'guid' },
	{ label: 'Is Archived', path: 'isArchived', type: 'boolean' },
	{ label: 'Is Virtual', path: 'isVirtual', type: 'boolean' },
	{ label: 'Name', path: 'name', type: 'text' },
];

export const bankAccountFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

/**
 * The balance view, which is a second collection about the same accounts and
 * agrees with the first about almost nothing.
 *
 * Every path here answered HTTP 200 on 2026-07-27, and the absences are what
 * make this a menu of its own rather than a switch on the one above:
 *
 * - **`isArchived` is a 500 here.** It is a filter on `/accounts` and does not
 *   exist on this DTO, so there is no way to ask the server for the balances of
 *   the accounts still in use — they have to be matched up afterwards.
 * - **`id` and `name` are a 500 as well**, which is why the ID is `accountId`
 *   and the name is `accountName`. The same two words, and neither spelling
 *   crosses over.
 *
 * And one distinction worth the note, because it looks like a bug and is not:
 * **`balance` and `bankBalance` are different numbers.** The first is what Nibo
 * has recorded, the second what the bank itself reported — on an account with no
 * banking automation the first moved and the second stayed at `0.00`.
 *
 * Alphabetical by label, as the editor shows and the linter requires.
 */
const BALANCE_FILTER_FIELDS: IFilterField[] = [
	{ label: 'Account ID', path: 'accountId', type: 'guid' },
	{ label: 'Account Name', path: 'accountName', type: 'text' },
	{ label: 'Balance', path: 'balance', type: 'number' },
	{ label: 'Bank Balance', path: 'bankBalance', type: 'number' },
	{ label: 'Is Reconcilable', path: 'isReconcilable', type: 'boolean' },
	{ label: 'Is Virtual', path: 'isVirtual', type: 'boolean' },
];

export const bankAccountBalanceFilterFieldTypes = filterFieldTypes(BALANCE_FILTER_FIELDS);

export const bankAccountFields: INodeProperties[] = [
	/**
	 * The creation, warned about before the button: this API has no way back.
	 * `DELETE /accounts/{id}` is a 404, and `isArchived` on a PUT answers 204
	 * and changes nothing — both measured on 2026-07-27. Archiving is Nibo's
	 * screen only.
	 */
	{
		displayName:
			'An account cannot be deleted or archived through this API: what this creates is permanent, and tucking it away is only possible on Nibo\'s own screen. The node also checks the opening date after creating — this API stores it one day early on creation, and the node puts it right.',
		name: 'createAccountNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Conta corrente Itaú',
		description: 'What the account is called in Nibo',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['create'],
			},
		},
	},
	{
		// `bankNumber` is deliberately NOT on this form: the POST ignores it in
		// silence — 341 went in, 0 came out, measured on 2026-07-27. A field the
		// screen collects and the server throws away is a form that lies.
		displayName: 'Opening Balance',
		name: 'openBalance',
		type: 'number',
		default: 0,
		description:
			'What the account holds on the opening day. It becomes the starting balance Get Balances reports.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Opening Balance Date',
		name: 'dateOfOpenBalance',
		type: 'dateTime',
		typeOptions: {
			// A day, not a moment — same rule as every date of this API.
			dateOnly: true,
		},
		default: '',
		description:
			'The day the opening balance was struck. Nothing can be filed into the account before it. The API stores this one day early on creation; the node reads the account back and repairs the date, so the day you pick is the day that stays.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['create'],
			},
		},
	},
	/**
	 * The update: which account, and what to change. The merge underneath reads
	 * the record first and sends the whole of it back, which is what keeps the
	 * lock date alive through an update that does not mention it — this API
	 * CLEARS the lock on any body that omits it, with a 204 and not a word.
	 */
	{
		displayName: 'Bank Account Name or ID',
		name: 'bankAccountId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'loadBankAccounts',
			// The way back from the per-item mode, where the list refuses to load.
			loadOptionsDependsOn: ['authMode'],
		},
		required: true,
		default: '',
		description:
			'The account to change. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['update'],
			},
		},
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description:
			'The fields to change. Every field you do not add stays exactly as it is — the balance lock included.',
		options: [
			{
				displayName: 'Balance Lock Date',
				name: 'balanceLockDate',
				type: 'dateTime',
				typeOptions: { dateOnly: true },
				default: '',
				description:
					'The day the books are locked up to — nothing before it can be written or edited. Moving it forward is how a closing automation closes a month. Moving it back unlocks a closed period, so the node refuses that unless the "Allow Moving the Lock Back" option is on.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'What the account is called in Nibo',
			},
			{
				displayName: 'Opening Balance',
				name: 'openBalance',
				type: 'number',
				default: 0,
				description: 'What the account held on the opening day',
			},
			{
				displayName: 'Opening Balance Date',
				name: 'dateOfOpenBalance',
				type: 'dateTime',
				typeOptions: { dateOnly: true },
				default: '',
				description:
					'The day the opening balance was struck. Nothing can be filed into the account before it.',
			},
			// `isArchived` is deliberately NOT here: the PUT answers 204 and ignores
			// the field — measured on 2026-07-27. Offering it would be selling what
			// does not exist. Archiving is Nibo's screen only.
		],
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['update'],
			},
		},
	},
	/**
	 * The import, warned about before the button, and the warning is not about
	 * failure — it is about a success that says nothing.
	 */
	{
		displayName:
			'One input item is one line of the statement, and the node sends them as a single batch. The lines go to the reconciliation queue, not to the ledger: no entry appears and no balance moves. Nibo answers this with 204 and an empty body whether it filed everything or half of it, and nothing in this API can read the queue back — so every check this node makes happens before the lines are sent.',
		name: 'importNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['importBankStatement'],
			},
		},
	},
	{
		displayName: 'Bank Account Name or ID',
		name: 'accountId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'loadBankAccounts',
			// The way back from the per-item mode, where the list refuses to load.
			loadOptionsDependsOn: ['authMode'],
		},
		required: true,
		default: '',
		description:
			'The account the statement belongs to. It is read from the first input item and every item has to agree with it: one batch goes to one account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['importBankStatement'],
			},
		},
	},
	{
		displayName: 'Batch Name',
		name: 'batchName',
		type: 'string',
		default: '',
		placeholder: 'extrato.csv',
		description:
			'What to call this batch in Nibo, usually the name of the file it came from. Read from the first input item, since the batch is one thing.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['importBankStatement'],
			},
		},
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
		description:
			'What this line of the statement says, as it will read in the reconciliation screen. Read per item, so it is normally an expression over the incoming line.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['importBankStatement'],
			},
		},
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'number',
		required: true,
		default: 0,
		description:
			'How much moved on this line, negative for money out and positive for money in. Unlike everywhere else in this node, the sign is what says the direction here: a statement has both.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['importBankStatement'],
			},
		},
	},
	{
		displayName: 'Date',
		name: 'date',
		type: 'dateTime',
		typeOptions: {
			// The API takes a day and there is no hour in it.
			dateOnly: true,
		},
		required: true,
		default: '',
		description:
			'The day of this line. It cannot fall before the day the account was opened: Nibo accepts such a line with 204 and files nothing, so the node refuses it instead. Written by hand it has to be year-month-day — a date such as 29/07/2026 is refused rather than guessed at, because 07/12/2026 could be either month.',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['importBankStatement'],
			},
		},
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['list', 'listBalances'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		description: 'Max number of results to return',
		hint: 'An organization usually has a handful of accounts, so one page is normally all of it',
		displayOptions: {
			show: {
				resource: [BANK_ACCOUNT],
				operation: ['list', 'listBalances'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({ resources: [BANK_ACCOUNT], fields: FILTER_FIELDS, defaultField: 'name' }),
	...filterProperties({
		resources: [BANK_ACCOUNT],
		fields: BALANCE_FILTER_FIELDS,
		defaultField: 'accountName',
		operations: ['listBalances'],
	}),
];
