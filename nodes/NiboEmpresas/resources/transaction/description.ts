import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The settled side of the books: what a schedule becomes once the money has
 * actually moved.
 *
 * A **payment** is an expense that was paid, a **receipt** a revenue that was
 * received — `/payments` and `/receipts`, and the API gives the two an
 * identical contract on every operation, measured on the test company on
 * 2026-07-27. So they share one handler and this one description, exactly as
 * the two schedules and the four contacts do.
 *
 * They exist because 0.9.x left a capability in half: the node could create a
 * schedule and had no way to mark it paid, which left every settlement in an
 * HTTP Request node.
 */
interface ITransactionType {
	/** The `resource` value — a contract, unlike the label */
	value: string;
	/** How the Resource menu names it under the family word */
	side: string;
	/** How a sentence names one of them */
	noun: string;
	/** How a sentence names many of them */
	plural: string;
	/** Which kind of schedule this one settles */
	settles: string;
	/** The segment the settlement route carries — `debit` or `credit` */
	kind: string;
	/** What the API answers in `type` for the schedule this settles */
	scheduleType: string;
	/** What a workflow already calls this */
	alsoKnownAs: string;
}

/**
 * The word that gathers the two on the Resource menu, and with it in the
 * Actions tab — which is the same list, walked in this order, one heading per
 * entry.
 *
 * Chosen by Alvaro on 2026-07-27, after turning down the first suggestion
 * (`Settlement`, a word nobody says). `Transaction` groups the pair and sorts
 * immediately after `Schedule`, so the menu reads in the order the money moves:
 * schedule, then settle.
 */
const FAMILY = 'Transaction';

const TYPES: ITransactionType[] = [
	{
		value: 'payment',
		side: 'Payment',
		noun: 'payment',
		plural: 'payments',
		settles: 'debit schedule',
		kind: 'debit',
		scheduleType: 'debit',
		alsoKnownAs: 'a settled account payable',
	},
	{
		value: 'receipt',
		side: 'Receipt',
		noun: 'receipt',
		plural: 'receipts',
		settles: 'credit schedule',
		kind: 'credit',
		scheduleType: 'credit',
		alsoKnownAs: 'a settled account receivable',
	},
];

const EVERY_TYPE = TYPES.map((type) => type.value);

/** The Resource options, and part of the list the credential has to name */
export const transactionResources: INodePropertyOptions[] = TYPES.map((type) => ({
	name: `${FAMILY} - ${type.side}`,
	value: type.value,
	description: `${type.alsoKnownAs} — the ${type.settles} after the money has moved`,
}));

/**
 * Two operations in this cut, and the menu grows with the slices behind it.
 *
 * **Update is not here, and that is measurement rather than caution.**
 * `PUT /payments/{entryId}` answers 404 — including with the exact body of the
 * production workflow this project's catalogue cited as proof it worked,
 * reproduced field by field against a live record on 2026-07-27. That workflow
 * turned out to be inactive. Recategorizing a settled entry is not something
 * this API can do.
 */
export const transactionOperations: INodeProperties[] = TYPES.map((type) => ({
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: [type.value],
		},
	},
	// Alphabetical by name, which is what the n8n linter requires.
	options: [
		{
			name: 'Get',
			value: 'get',
			action: `Get a ${type.noun}`,
			description: `Retrieve one ${type.noun} by ID`,
		},
		{
			name: 'Get Many',
			value: 'list',
			action: `Get many ${type.plural}`,
			description: `Retrieve the ${type.plural} of the organization`,
		},
		{
			name: 'Settle',
			value: 'settle',
			action: `Settle a ${type.settles}`,
			description: `Record that a ${type.settles} that already exists has been ${type.value === 'payment' ? 'paid' : 'received'}`,
		},
	],
	default: 'list',
}));

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-27.
 *
 * Four absences, each a 500 measured rather than assumed:
 *
 * - **`isFlag`** — *"Could not find a property named 'isFlag'"*. It is the name
 *   the **write** side uses for this very field; the read side calls it
 *   `isFlagged`. Both are true, one on each side, and this menu is the read one.
 * - **`isDeleted`**, **`dueDate`** and **`isPaid`** — none of the three is on
 *   this view. A settled entry has no due date and is not "paid or not": it is
 *   the payment itself.
 *
 * And two presences worth naming: **`entryId`** and **`scheduleId`** compare as
 * IDs, bare — quoting either is the 500 about `Edm.Guid` and `Edm.String` that
 * the 0.9.0 filter type was written for. `scheduleId` is what finds the
 * settlement of a schedule you already have.
 *
 * Alphabetical by label, as the editor shows and the linter requires.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Accrual Date', path: 'accrualDate', type: 'date' },
	{ label: 'Date', path: 'date', type: 'date' },
	{ label: 'Description', path: 'description', type: 'text' },
	{ label: 'ID', path: 'entryId', type: 'guid' },
	{ label: 'Is Flagged', path: 'isFlagged', type: 'boolean' },
	{ label: 'Schedule ID', path: 'scheduleId', type: 'guid' },
	{ label: 'Stakeholder Name', path: 'stakeholder/name', type: 'text' },
	{ label: 'Value', path: 'value', type: 'number' },
];

export const transactionFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

export const transactionFields: INodeProperties[] = [
	...TYPES.map(
		(type): INodeProperties => ({
			displayName: 'Schedule ID',
			name: 'scheduleId',
			type: 'string',
			required: true,
			default: '',
			placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
			description: `The ID of the ${type.settles} to settle, as Nibo returns it in the scheduleId field. The node reads that schedule before writing anything: this API accepts a ${type.settles === 'debit schedule' ? 'credit' : 'debit'} one through this same route and files the money on the wrong side of the cash book without a word.`,
			displayOptions: {
				show: {
					resource: [type.value],
					operation: ['settle'],
				},
			},
		}),
	),
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
			'The account the money moved through. The API refuses a settlement without one — it answers HTTP 500 "Conta bancária não encontrada." — so the node asks for it here rather than letting that sentence arrive later. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['settle'],
			},
		},
	},
	{
		displayName: 'Date',
		name: 'date',
		type: 'dateTime',
		typeOptions: {
			// A settlement happens on a day. The API takes YYYY-MM-DD and there is
			// no hour in it, so a clock offers a decision that does not exist — and
			// one with a wrong answer, since the editor hands over the moment with
			// its offset and midnight in Brasília is the day before in UTC.
			dateOnly: true,
		},
		required: true,
		default: '',
		description: 'The day the money actually moved',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['settle'],
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
			'How much moved, typed as a positive number on both kinds. Less than the schedule is allowed and is not an error: a part payment is recorded and the schedule stays open — measured on 2026-07-27, where 100 against a schedule of 400 answered 200 and left it unpaid.',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['settle'],
			},
		},
	},
	{
		displayName: 'Entry ID',
		name: 'entryId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
		description:
			'The ID of the entry to read, as Nibo returns it in the entryId field. That is what this collection calls its key — the shorter name every other collection uses is not a field here, and sorting by it answers HTTP 500. It is read through the list filtered by ID, because this API has no route that reads one entry on its own.',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['get'],
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
				resource: EVERY_TYPE,
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
		hint: 'The API caps every page at 500 records, so a higher limit is collected in several pages',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({ resources: EVERY_TYPE, fields: FILTER_FIELDS, defaultField: 'date' }),
];
