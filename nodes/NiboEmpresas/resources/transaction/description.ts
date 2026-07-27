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
		alsoKnownAs: 'a settled account payable',
	},
	{
		value: 'receipt',
		side: 'Receipt',
		noun: 'receipt',
		plural: 'receipts',
		settles: 'credit schedule',
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
