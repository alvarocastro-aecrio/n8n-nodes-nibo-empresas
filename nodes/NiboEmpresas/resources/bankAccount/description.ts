import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The bank accounts — and only the reading of them.
 *
 * This resource exists for one reason, and it is a hard one: **a settlement is
 * refused without an account.** `POST /schedules/debit/{id}/payments` with no
 * `accountId` answers HTTP 500 *"Conta bancária não encontrada."*, and until
 * this cut the node had nowhere to get one. Worse, an organization can
 * genuinely have none — the test company had zero — so the emptiness is a real
 * state a workflow runs into.
 *
 * The **full** Account resource is item 6 of the project's roadmap: balances,
 * transfers and bank-statement imports. None of that is here. What is here is
 * the minimum the settlement needs, which is the same cut Category got in 0.7.0
 * when a schedule needed a category ID.
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
 * One operation, because it is all this cut needs and all that was measured.
 * `GET /accounts/{id}` is a **404** — so there is no Get to offer even if there
 * were a reason to.
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
				operation: ['list'],
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
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({ resources: [BANK_ACCOUNT], fields: FILTER_FIELDS, defaultField: 'name' }),
];
