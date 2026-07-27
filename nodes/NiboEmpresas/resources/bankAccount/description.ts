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
