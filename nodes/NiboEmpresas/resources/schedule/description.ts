import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * Credit Schedule and Debit Schedule — what a workflow calls accounts
 * receivable and accounts payable — are one family, exactly as the four
 * stakeholders are. The API gives them the same contract, so they share one
 * handler and this one description, and what differs is the word in each text,
 * the name of the ID field and which side of the money it is.
 *
 * Two resources rather than one resource with a type field: the type is not a
 * setting of the operation, it is which set of books the operation is about,
 * and the editor is read from the top down.
 */
interface IScheduleType {
	/** The `resource` value */
	value: string;
	/** How a field that asks for one of them is labelled — "Credit Schedule ID" */
	label: string;
	/** How the Resource menu names it under the family word — "Credit" */
	side: string;
	/** How a sentence names one of them */
	noun: string;
	/** How a sentence names many of them */
	plural: string;
	/** Its own ID parameter — a parameter name is a contract, so nobody shares one */
	idParameter: string;
	/** What a workflow already calls this, which is not the word the API uses */
	alsoKnownAs: string;
	/** What the money does, for the texts that have to say it */
	movement: string;
}

// Alphabetical by label, which is the order the editor shows and the order the
// n8n linter requires of an options list. The node interleaves these with the
// stakeholders to keep that true across the whole menu.
/**
 * The word that gathers the two on the Resource menu, and with it in the Actions
 * tab — which is the same list, walked in this order, one heading per entry
 * (n8n 2.18.5 source, read on 2026-07-26).
 *
 * Alphabetically these used to fall either side of "Customer", so the tab read
 * as six unrelated things. The prefix groups them and stays alphabetical —
 * `Category` < `Contact` < `Schedule` — so no linter exception is needed.
 */
const FAMILY = 'Schedule';

const TYPES: IScheduleType[] = [
	{
		value: 'creditSchedule',
		label: 'Credit Schedule',
		side: 'Credit',
		noun: 'credit schedule',
		plural: 'credit schedules',
		idParameter: 'creditScheduleId',
		alsoKnownAs: 'accounts receivable',
		movement: 'received',
	},
	{
		value: 'debitSchedule',
		label: 'Debit Schedule',
		side: 'Debit',
		noun: 'debit schedule',
		plural: 'debit schedules',
		idParameter: 'debitScheduleId',
		alsoKnownAs: 'accounts payable',
		movement: 'paid',
	},
];

const EVERY_TYPE = TYPES.map((type) => type.value);

/** The Resource options, and part of the list the credential has to name */
export const scheduleResources: INodePropertyOptions[] = TYPES.map((type) => ({
	name: `${FAMILY} - ${type.side}`,
	value: type.value,
	description: `An entry of ${type.alsoKnownAs}, due on a date and split into categories`,
}));

// Alphabetical by name, which is what the n8n linter requires and what the
// editor shows in this exact order.
export const scheduleOperations: INodeProperties[] = TYPES.map((type) => ({
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: [type.value],
		},
	},
	options: [
		{
			name: 'Create',
			value: 'create',
			action: `Create a ${type.noun}`,
			description: `Schedule an amount to be ${type.movement} on a date`,
		},
		{
			name: 'Delete',
			value: 'delete',
			action: `Delete a ${type.noun}`,
			description: `Remove a ${type.noun} from the organization`,
		},
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
			description: `Retrieve ${type.plural} of the organization`,
		},
		{
			name: 'Update',
			value: 'update',
			action: `Update a ${type.noun}`,
			description: `Change the fields given below, leaving every other field of the ${type.noun} as it is`,
		},
	],
	default: 'list',
}));

/**
 * The category lines, which is how this API states an amount.
 *
 * There is no total field to fill in: the amount of a schedule is the sum of
 * its lines, and at least one line is what the API refuses a creation without.
 * Offered as a fixedCollection, one line at a time, because that is what the
 * payload is.
 */
const CATEGORIES: INodeProperties = {
	displayName: 'Categories',
	name: 'categories',
	type: 'fixedCollection',
	typeOptions: {
		multipleValues: true,
	},
	placeholder: 'Add Category',
	default: {},
	description:
		'The lines this schedule is split into. The amount of the schedule is their sum — this API keeps no total of its own. Splitting across several categories has to be enabled for the organization in Nibo: where it is off, the API refuses a second line with "Utilize apenas uma categoria", and the node says what that means.',
	options: [
		{
			displayName: 'Category',
			name: 'category',
			values: [
				{
					// A list since 0.7.0, and still a plain string underneath. A
					// resourceLocator would read better and would store `{mode, value}`
					// where a bare ID is stored today, breaking every node saved under
					// 0.6.0 — the name, the place, the default and the stored shape are
					// all contract. What changes is only that the ID can now be found.
					displayName: 'Category Name or ID',
					name: 'categoryId',
					type: 'options',
					typeOptions: {
						loadOptionsMethod: 'loadScheduleCategories',
						// The editor fetches a list once and refetches it on exactly
						// three things (read out of the n8n 2.18.5 editor on
						// 2026-07-26): the refresh button, a watch on the node's
						// credentials, and a watch on the value of this very key.
						// Declaring nothing here left the field showing whichever half
						// of the chart of accounts it happened to load first — switch
						// to the other kind of schedule and the wrong half stayed.
						// `authMode` is here for the way back from the per-item mode,
						// where the list refuses to load: without it the refusal would
						// outlive the reason for it.
						loadOptionsDependsOn: ['resource', 'authMode'],
					},
					default: '',
					description:
						'The financial category this line falls under. The list is read with the credential selected above and shows only the categories that fit this kind of schedule — a revenue category cannot carry a payment, and the API refuses the pair by complaining about the amount instead. Every Nibo organization starts from the same chart of accounts, so two organizations show the same names and differ only in the IDs behind them: switching the credential clears this field, and that is what tells you the list was read again. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'number',
					default: 0,
					description:
						'The amount of this line. Always typed as a positive number, on both kinds of schedule — it is what the API takes on a write, and it is what decides the sign it answers with on a read.',
				},
				{
					// Measured on the cobaia on 2026-07-26 before it was offered: the
					// API takes a description inside a category line, stores it and
					// answers with it, accents included. The project's reference had
					// the field marked suspicious after a payload that once crashed
					// the server — that turned out to be the encoding, not this.
					// "Detalhamento" on the Nibo screen, so the label follows theirs.
					// The parameter keeps `description`, which is what the API calls
					// this field and what a node saved under 0.7.7 already carries —
					// a label is a word, a parameter name is a contract.
					displayName: 'Detail',
					name: 'description',
					type: 'string',
					default: '',
					description:
						'What this line is about, when the schedule is split into several and each needs saying. Left empty it is not sent at all, and the line carries no detail.',
				},
			],
		},
	],
};

/**
 * How the shares of the apportionment are read — the field behind
 * `costCenterValueType`, which is `0` and `1` in the payload and therefore not
 * something anybody should be typing.
 *
 * Measured on the test company on 2026-07-26, both ways round, because nothing
 * about the two numbers says which is which: **1 is percentage, 0 is value**.
 * Sending the wrong pair — type 0 with `percent` on the lines — answers HTTP 500
 * complaining that the amounts do not add up to the schedule, and never that the
 * pair is the wrong way round.
 *
 * A field of the **block**, not of each row: the API keeps a single
 * `costCenterValueType` for the whole schedule, so a row that asked again would
 * be a question the payload has no second place to put.
 *
 * **It is on the screen from the start, and it cannot be made to wait for a cost
 * center line.** 0.11.0 tried, with `show` on `/costCenters.costCenter` and
 * `_cnd: exists`, at Alvaro's request after using the form — and it took the
 * field out of use altogether: `The value "" is not supported!` under an empty
 * box, reported on 2026-07-27.
 *
 * The reason is in n8n's own `getNodeParameters`, and it is not reachable from
 * the condition. Before deciding what is displayed, it resolves the values it
 * will check against with `onlySimpleTypes` — an object that holds no collection
 * of any kind — so `/costCenters.costCenter` is `undefined` there however the
 * form is filled in, the field counts as hidden, and **its value is dropped from
 * what the node saves**. The editor still draws it, because it decides that from
 * the full parameters, so what is left on the screen is the field with nothing
 * in it and a refusal underneath. `displayParameter` on its own answers the
 * condition correctly, which is why the tests of 0.11.0 passed: they asked the
 * second step without the first.
 *
 * There is no wording that survives this. "No line yet" and "the check cannot
 * see collections" arrive as the same `undefined`, and only one of them is a
 * thing this node knows.
 */
const APPORTION_BY: INodeProperties = {
	displayName: 'Apportion By',
	name: 'apportionBy',
	type: 'options',
	// Alphabetical by name, as the linter asks.
	options: [
		{
			name: 'Percentage',
			value: 'percent',
			description: 'Each line carries a share of the whole, and the shares have to add up to 100',
		},
		{
			name: 'Value',
			value: 'value',
			description:
				'Each line carries an amount, and the amounts have to add up to the amount of the schedule',
		},
	],
	default: 'percent',
	description:
		'How the share of each cost center line above is read. It is sent only when there is at least one line, so a schedule with no apportionment is written exactly as it was before this field existed.',
};

/**
 * The apportionment lines — which parts of the company this amount belongs to.
 *
 * A category says what an amount is; a cost centre says whose it is. This API
 * takes both on the same schedule, and until 0.9.0 the node offered no way to
 * say the second.
 *
 * Unlike the split across **categories**, several lines here need nothing turned
 * on in Nibo: measured on 2026-07-26 on the test company, which has the category
 * split off and took 60% + 40% across two cost centres in the same run.
 */
const COST_CENTERS: INodeProperties = {
	displayName: 'Cost Centers',
	name: 'costCenters',
	type: 'fixedCollection',
	typeOptions: {
		multipleValues: true,
	},
	placeholder: 'Add Cost Center',
	default: {},
	description:
		'The parts of the company this amount is attributed to. Leave it empty and the schedule carries no apportionment, which is what every schedule written before this field existed does.',
	options: [
		{
			displayName: 'Cost Center',
			name: 'costCenter',
			values: [
				{
					displayName: 'Cost Center Name or ID',
					name: 'costCenterId',
					type: 'options',
					typeOptions: {
						loadOptionsMethod: 'loadCostCenters',
						// The way back from the per-item mode, where the list refuses to
						// load: without it the refusal would outlive the reason for it.
						loadOptionsDependsOn: ['authMode'],
					},
					default: '',
					description:
						'The cost center this line is for. The list is read with the credential selected above, and a cost center ID belongs to one organization — so switching the credential clears this field. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				},
				{
					// One box, not two, and that is what makes "never both" true rather
					// than merely intended: which key this becomes is decided once, in
					// Apportion By, and a line can only ever carry the one.
					displayName: 'Share',
					name: 'share',
					type: 'number',
					default: 0,
					description:
						'How much of the schedule this line takes: a percentage of it, or an amount of it, according to Apportion By above. Percentages have to add up to 100 and amounts to the amount of the schedule, and the API refuses the write when they do not.',
				},
			],
		},
	],
};

/**
 * The contact the schedule belongs to, on both forms that name one.
 *
 * A search since 0.8.0, and still called `stakeholderId`. The name is the
 * contract; the handler reads both what this component stores and the plain
 * string a node saved before it still carries.
 *
 * Declared once and used twice — on the create screen and inside Update Fields
 * — because a `resourceLocator` is supported inside a `collection`, read in the
 * n8n 2.18.5 source on 2026-07-26 where official nodes of this version do it.
 * Two declarations would be two fields free to drift apart, and a contact is
 * changed as often as it is chosen.
 */
const STAKEHOLDER: INodeProperties = {
	displayName: 'Stakeholder',
	name: 'stakeholderId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	description:
		'The contact this schedule belongs to. The list is searched on the server and offers only the kinds the API accepts here — a customer or a partner on a credit schedule, a supplier, an employee or a partner on a debit one; anything else is refused with "Stakeholder is not compatible".',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Search for a contact…',
			typeOptions: {
				searchListMethod: 'searchScheduleStakeholders',
				// Searched on the server: an organization can have thousands of
				// customers, and filtering a page of them in the browser would
				// only ever find what happened to be on that page.
				searchable: true,
				searchFilterRequired: false,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
			hint: 'The ID as Nibo returns it, or an expression reading it from the incoming item',
		},
	],
};

/**
 * The two that are always on the screen when a schedule is created.
 *
 * They were under Additional Fields until 0.7.1, and Alvaro moved them out
 * after using the form: a schedule without a description is a line nobody can
 * read later in Nibo, and the flag is the thing you set at the moment you
 * create the entry, not something you go looking for in a menu.
 *
 * On **Update** they stay inside the menu, and that is not an oversight. There,
 * a field on the screen is a field that gets written: leaving Description
 * visible and empty would erase the stored one on every update of anything
 * else. The menu is what makes "a field you did not add is not touched" true.
 */
function firstClassFields(): INodeProperties[] {
	return [
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			default: '',
			description: 'What this schedule is about, as it will read in Nibo',
		},
		// `isFlagged` here, `isFlag` on a payment: the two are one letter apart in
		// the same API, and the wrong one is accepted and ignored. Nobody types
		// either — the spelling is fixed in the payload.
		{
			displayName: 'Is Flagged',
			name: 'isFlagged',
			type: 'boolean',
			default: false,
			description: 'Whether to raise the flag Nibo shows next to a schedule that needs attention',
		},
	];
}

/**
 * What is left for the menus: offered under Additional Fields when creating and
 * under Update Fields when changing, and declared once so the two cannot drift.
 * Alphabetical by display name, as the linter asks.
 */
function writableFields(): INodeProperties[] {
	return [
		{
			displayName: 'Reference',
			name: 'reference',
			type: 'string',
			default: '',
			description: 'A free reference of your own, such as an invoice or a contract number',
		},
	];
}

/** The editor lists a menu in the order it is declared, and alphabetical is the convention */
function byDisplayName(fields: INodeProperties[]): INodeProperties[] {
	return [...fields].sort((one, other) => one.displayName.localeCompare(other.displayName));
}

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-26, on
 * `/schedules/credit` and `/schedules/debit` alike. Three absences are the
 * point of it:
 *
 * - **`type` is not here.** Inside one of these collections it is a constant,
 *   so filtering by it can only ever say "yes" or "nothing".
 * - **`isDeleted` is not here.** It is a 500: the field does not exist on this
 *   view, whatever the documentation of other collections suggests.
 * - **`costCenterValueType` is not here.** A 500 as well — the enum does not
 *   compare, exactly as `document/type` does not on the stakeholders.
 *
 * Alphabetical by label: the order the editor shows and the one the n8n linter
 * requires of an options list.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Accrual Date', path: 'accrualDate', type: 'date' },
	{ label: 'Created At', path: 'createDate', type: 'date' },
	{ label: 'Description', path: 'description', type: 'text' },
	{ label: 'Due Date', path: 'dueDate', type: 'date' },
	{ label: 'Has Invoice', path: 'hasInvoice', type: 'boolean' },
	{ label: 'Is Flagged', path: 'isFlagged', type: 'boolean' },
	{ label: 'Is Overdue', path: 'isDued', type: 'boolean' },
	{ label: 'Is Paid', path: 'isPaid', type: 'boolean' },
	{ label: 'Reference', path: 'reference', type: 'text' },
	{ label: 'Schedule Date', path: 'scheduleDate', type: 'date' },
	{ label: 'Stakeholder Name', path: 'stakeholder/name', type: 'text' },
	{ label: 'Updated At', path: 'updateDate', type: 'date' },
	{ label: 'Value', path: 'value', type: 'number' },
];

/**
 * What kind of value each path holds, for the handler that turns the rows of
 * the editor into conditions. The menu is UI and lives here; the builder knows
 * nothing about Nibo and is told the type.
 */
export const scheduleFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

export const scheduleFields: INodeProperties[] = [
	// One ID field per type, each named after itself
	...TYPES.map(
		(type): INodeProperties => ({
			displayName: `${type.label} ID`,
			name: type.idParameter,
			type: 'string',
			required: true,
			default: '',
			description: `The ID of the ${type.noun} to work on, as Nibo returns it in the schedule ID field`,
			displayOptions: {
				show: {
					resource: [type.value],
					operation: ['delete', 'get', 'update'],
				},
			},
		}),
	),
	{
		...STAKEHOLDER,
		required: true,
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Due Date',
		name: 'dueDate',
		type: 'dateTime',
		typeOptions: {
			// A schedule falls due on a day. The API takes YYYY-MM-DD and there is no
			// hour in any of these, so a clock offers a decision that does not exist —
			// and one with a wrong answer, since the editor hands over the moment with
			// its offset and 2026-08-10T00:00:00-03:00 is the 9th in UTC. `dateOnly`
			// drops the clock AND stores the plain day, which is what the API takes.
			dateOnly: true,
		},
		required: true,
		default: '',
		description: 'The date the amount falls due',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Schedule Date',
		name: 'scheduleDate',
		type: 'dateTime',
		typeOptions: {
			// A schedule falls due on a day. The API takes YYYY-MM-DD and there is no
			// hour in any of these, so a clock offers a decision that does not exist —
			// and one with a wrong answer, since the editor hands over the moment with
			// its offset and 2026-08-10T00:00:00-03:00 is the 9th in UTC. `dateOnly`
			// drops the clock AND stores the plain day, which is what the API takes.
			dateOnly: true,
		},
		required: true,
		default: '',
		description:
			'The date the money is expected to move, which is not always the date it falls due',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	// First class, next to the due date, and never inside a menu: leaving it out
	// is a decision with a consequence, and a field nobody sees is a decision
	// nobody took.
	{
		displayName: 'Accrual Date',
		name: 'accrualDate',
		type: 'dateTime',
		typeOptions: {
			// A schedule falls due on a day. The API takes YYYY-MM-DD and there is no
			// hour in any of these, so a clock offers a decision that does not exist —
			// and one with a wrong answer, since the editor hands over the moment with
			// its offset and 2026-08-10T00:00:00-03:00 is the 9th in UTC. `dateOnly`
			// drops the clock AND stores the plain day, which is what the API takes.
			dateOnly: true,
		},
		default: '',
		description:
			'The month this belongs to in the books. Left empty, the API silently copies the due date — which files the income or the expense in the month the money moves rather than the month it was earned or incurred.',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	// On the screen rather than in a menu since 0.7.1 — a schedule with no
	// description is a line nobody can read later, and the flag belongs to the
	// moment the entry is made. Above the category lines since 0.7.7: what the
	// schedule IS comes before how its amount is split, because the split is
	// the detail and the rest is the decision.
	...firstClassFields().map(
		(field): INodeProperties => ({
			...field,
			displayOptions: {
				show: {
					resource: EVERY_TYPE,
					operation: ['create'],
				},
			},
		}),
	),
	{
		...CATEGORIES,
		required: true,
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	// After the categories, because the split of an amount comes after the amount
	// — and Apportion By *under* the lines, so the block reads as one thing: the
	// lines, and then how to read them. Under them rather than after them is as
	// close to "part of the block" as this gets, for the reason written above it.
	...[COST_CENTERS, APPORTION_BY].map(
		(field): INodeProperties => ({
			...field,
			displayOptions: {
				show: {
					resource: EVERY_TYPE,
					operation: ['create'],
					...field.displayOptions?.show,
				},
			},
		}),
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: byDisplayName(writableFields()),
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
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
			'The fields to change. A field left out is not touched: the schedule keeps whatever is stored in Nibo. A text field added and left empty is written empty, which is how a value is erased on purpose — but a date or a category left empty is ignored, since a schedule with no due date or no amount is not a schedule this API keeps.',
		options: byDisplayName([
			// Description and Is Flagged are on the screen when creating, and back
			// in the menu here on purpose: on an update a field on the screen is a
			// field that gets written, so a visible empty Description would erase
			// the stored one every time anything else was changed.
			...firstClassFields(),
			...writableFields(),
			CATEGORIES,
			// The apportionment, in the menu like everything else that is changed
			// rather than set. Measured on 2026-07-26: a PUT that does not mention
			// costCenters makes the apportionment disappear — which is exactly what
			// "a field you did not add is not touched" has to prevent, and does,
			// because the safe cycle sends the stored record back whole.
			//
			// Apportion By is on the Add Field list unconditionally, for the reason
			// written above the field: a condition on the lines is a condition n8n
			// resolves by dropping the value. On its own it changes nothing — the
			// handler sends neither key without lines — and lines added without it
			// are refused rather than guessed at.
			COST_CENTERS,
			APPORTION_BY,
			{
				displayName: 'Accrual Date',
				name: 'accrualDate',
				type: 'dateTime',
				typeOptions: {
					// A schedule falls due on a day. The API takes YYYY-MM-DD and there is no
					// hour in any of these, so a clock offers a decision that does not exist —
					// and one with a wrong answer, since the editor hands over the moment with
					// its offset and 2026-08-10T00:00:00-03:00 is the 9th in UTC. `dateOnly`
					// drops the clock AND stores the plain day, which is what the API takes.
					dateOnly: true,
				},
				default: '',
				description: 'The month this belongs to in the books',
			},
			{
				displayName: 'Due Date',
				name: 'dueDate',
				type: 'dateTime',
				typeOptions: {
					// A schedule falls due on a day. The API takes YYYY-MM-DD and there is no
					// hour in any of these, so a clock offers a decision that does not exist —
					// and one with a wrong answer, since the editor hands over the moment with
					// its offset and 2026-08-10T00:00:00-03:00 is the 9th in UTC. `dateOnly`
					// drops the clock AND stores the plain day, which is what the API takes.
					dateOnly: true,
				},
				default: '',
				description: 'The date the amount falls due',
			},
			{
				displayName: 'Schedule Date',
				name: 'scheduleDate',
				type: 'dateTime',
				typeOptions: {
					// A schedule falls due on a day. The API takes YYYY-MM-DD and there is no
					// hour in any of these, so a clock offers a decision that does not exist —
					// and one with a wrong answer, since the editor hands over the moment with
					// its offset and 2026-08-10T00:00:00-03:00 is the 9th in UTC. `dateOnly`
					// drops the clock AND stores the plain day, which is what the API takes.
					dateOnly: true,
				},
				default: '',
				description: 'The date the money is expected to move',
			},
			// The same search the create screen offers, and the same parameter
			// underneath: a node that added "Stakeholder ID" before 0.8.0 still
			// carries `stakeholderId`, still finds it here, and its plain ID is
			// still what the handler reads.
			STAKEHOLDER,
		]),
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['update'],
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
	...filterProperties({ resources: EVERY_TYPE, fields: FILTER_FIELDS, defaultField: 'dueDate' }),
];
