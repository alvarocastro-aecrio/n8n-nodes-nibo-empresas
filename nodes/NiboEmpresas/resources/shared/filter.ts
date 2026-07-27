import type {
	IDataObject,
	IExecuteFunctions,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { IODataCondition, ODataFieldType } from '../../transport/odata';
import { buildODataFilter } from '../../transport/odata';

/**
 * The assisted filter, once, for every resource that has one.
 *
 * It arrived in 0.5.0 inside the stakeholder module, because the stakeholders
 * were the only family there was. The schedules are the second, and the filter
 * they need differs from it in exactly one thing: the menu of fields. Not the
 * rows, not the operators, not the order in which the three answers beat each
 * other — so none of that is written twice.
 *
 * What a resource brings is its own **closed, measured** menu. What it gets
 * back is the pair of parameters the editor draws and the function the handler
 * calls. The extraction changed no behavior at all: the stakeholder tests of
 * 0.5.x are what says so.
 */

/**
 * A field the assisted filter can be built on: what the editor calls it, where
 * the API keeps it, and what kind of value it holds.
 *
 * The type is not decoration — it is what decides the literal. Text goes
 * between quotes, boolean, number and date go bare, and the builder in
 * `transport/odata.ts` is what writes each one.
 */
export interface IFilterField {
	label: string;
	/** The path as the API names it, e.g. `document/number` or `stakeholder/name` */
	path: string;
	type: ODataFieldType;
	/**
	 * The answers a field of type `options` can take — required for that type and
	 * meaningless for every other.
	 *
	 * The API takes the same quoted text either way; what the list buys is the
	 * person not having to guess that a category's type is spelled `in` and not
	 * `revenue`, `Receita` or `IN`.
	 */
	choices?: INodePropertyOptions[];
}

export interface IFilterMenu {
	/** The resources these parameters are drawn for */
	resources: string[];
	/** The closed menu, alphabetical by label, every path measured against the API */
	fields: IFilterField[];
	/** Which path a row starts on, so a row added and untouched is a whole condition */
	defaultField: string;
	/**
	 * Which scans these conditions belong to. Every resource until 0.11.0 had
	 * exactly one, so the name of that one is the default and nothing that already
	 * calls this had to change.
	 *
	 * The bank accounts are the first resource with two, and they are two because
	 * the API has two collections: the accounts and their balances disagree on the
	 * name of nearly every field they share, and `isArchived` is a filter on one
	 * and an HTTP 500 on the other. One menu for both would be a screen where the
	 * chosen field can turn into a server error when a switch is flipped.
	 */
	operations?: string[];
}

/**
 * What kind of value each path holds, for the handler that turns the rows of
 * the editor into conditions. The menu is UI and lives in the resource; the
 * builder knows nothing about Nibo and is told the type.
 */
export function filterFieldTypes(fields: IFilterField[]): Record<string, ODataFieldType> {
	return Object.fromEntries(fields.map((field) => [field.path, field.type]));
}

/**
 * The two parameters the editor draws: the rows and the operator that joins
 * them.
 *
 * Both take themselves off the screen the moment the OData expression under
 * Options carries something — and out of the request with it, see `listFilter`.
 * A field nobody can see must never be filtering underneath one they can.
 */
export function filterProperties(menu: IFilterMenu): INodeProperties[] {
	const operations = menu.operations ?? ['list'];

	return [
		{
			displayName: 'Filters',
			name: 'filters',
			type: 'fixedCollection',
			typeOptions: {
				multipleValues: true,
			},
			placeholder: 'Add Condition',
			default: {},
			description: 'The conditions a record has to meet to be returned',
			options: [
				{
					displayName: 'Condition',
					name: 'conditions',
					values: conditionFields(menu),
				},
			],
			displayOptions: {
				show: {
					resource: menu.resources,
					operation: operations,
				},
				// Write an expression by hand and the conditions leave the screen —
				// and leave the request with it. The editor reads `exists` as
				// "filled in": not null, not undefined and not empty. Added and left
				// blank is not a filter, so it costs the conditions nothing.
				hide: {
					'/options.filter': [{ _cnd: { exists: true } }],
				},
			},
		},
		{
			displayName: 'Combine Conditions',
			name: 'filterCombine',
			type: 'options',
			options: [
				{ name: 'And', value: 'and', description: 'Return only the records that meet every condition' },
				{
					name: 'Or',
					value: 'or',
					description: 'Return the records that meet at least one of the conditions',
				},
			],
			default: 'and',
			description:
				'How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.',
			displayOptions: {
				show: {
					resource: menu.resources,
					operation: operations,
				},
				hide: {
					'/options.filter': [{ _cnd: { exists: true } }],
				},
			},
		},
	];
}

/**
 * One row of the builder: which field, which operator, which value.
 *
 * Operator and value are declared once per type rather than once each. The
 * editor shows the declaration whose `field` list holds the chosen path, so a
 * date is never offered `contains` — an expression the API answers 500 to — and
 * a yes-or-no is collected as a checkbox rather than as the text `true`.
 *
 * A type no field of the menu carries is not declared at all: an operator box
 * for a kind of field this resource does not have would be a box the editor can
 * never draw.
 *
 * Each `default` is a literal on purpose: the n8n linter reads defaults straight
 * from the source, and a value it cannot see is one it reports as missing.
 */
function conditionFields(menu: IFilterMenu): INodeProperties[] {
	const { defaultField } = menu;

	const pathsOf = (type: ODataFieldType): string[] =>
		menu.fields.filter((field) => field.type === type).map((field) => field.path);

	const forType = (type: ODataFieldType, declarations: INodeProperties[]): INodeProperties[] => {
		const paths = pathsOf(type);

		return paths.length === 0
			? []
			: declarations.map((declaration) => ({
					...declaration,
					displayOptions: { show: { field: paths } },
				}));
	};

	return [
		{
			displayName: 'Field',
			name: 'field',
			type: 'options',
			options: menu.fields.map((field) => ({ name: field.label, value: field.path })),
			// Kept as the name unpacked above rather than written `menu.defaultField`
			// here: the n8n linter reads defaults straight from the source, tolerates
			// one it cannot follow, and reports `a.b` as no default at all.
			default: defaultField,
			description: 'The field the condition is about',
		},
		...forType('text', [
			{
				displayName: 'Operator',
				name: 'operator',
				type: 'options',
				options: [
					{ name: 'Contains', value: 'contains' },
					{
						name: 'Contains (Ignoring Case)',
						value: 'containsIgnoreCase',
						description: 'Matches however the record was typed, in capitals or not',
					},
					{ name: 'Ends With', value: 'endswith' },
					{ name: 'Equals', value: 'eq' },
					{ name: 'Not Equals', value: 'ne' },
					{ name: 'Starts With', value: 'startswith' },
				],
				default: 'contains',
			},
		]),
		...forType('boolean', [
			{
				displayName: 'Operator',
				name: 'operator',
				type: 'options',
				options: [
					{ name: 'Is', value: 'eq' },
					{ name: 'Is Not', value: 'ne' },
				],
				default: 'eq',
			},
		]),
		...forType('number', [
			{
				displayName: 'Operator',
				name: 'operator',
				type: 'options',
				options: [
					{ name: 'Equals', value: 'eq' },
					{ name: 'Greater Than', value: 'gt' },
					{ name: 'Greater Than or Equal To', value: 'ge' },
					{ name: 'Less Than', value: 'lt' },
					{ name: 'Less Than or Equal To', value: 'le' },
					{ name: 'Not Equals', value: 'ne' },
				],
				default: 'gt',
			},
		]),
		...forType('date', [
			{
				displayName: 'Operator',
				name: 'operator',
				type: 'options',
				options: [
					{ name: 'After', value: 'gt' },
					{ name: 'Before', value: 'lt' },
					{ name: 'On or After', value: 'ge' },
					{ name: 'On or Before', value: 'le' },
				],
				default: 'gt',
			},
		]),
		// An identifier is the same one or a different one, and there is nothing
		// else to ask of it.
		...forType('guid', [
			{
				displayName: 'Operator',
				name: 'operator',
				type: 'options',
				options: [
					{ name: 'Is', value: 'eq' },
					{ name: 'Is Not', value: 'ne' },
				],
				default: 'eq',
			},
		]),
		// One declaration per field rather than one per type, which is what every
		// other kind gets. Two closed lists in one menu do not hold the same
		// choices, and a shared box would offer one field the other's answers —
		// which the API would then reject for a reason nothing on the screen shows.
		...menu.fields.filter((field) => field.type === 'options').flatMap(choiceFields),
		...forType('text', [
			{
				displayName: 'Value',
				name: 'value',
				type: 'string',
				default: '',
				placeholder: 'ACME',
				description:
					'What to look for. It is quoted and escaped for you, so a name carrying an apostrophe works as typed. A condition left empty here is ignored.',
			},
		]),
		...forType('boolean', [
			{
				displayName: 'Value',
				name: 'booleanValue',
				type: 'boolean',
				default: true,
				description:
					'Whether the condition looks for the records where this is true or for the others',
			},
		]),
		...forType('number', [
			{
				displayName: 'Value',
				name: 'numberValue',
				type: 'number',
				default: 0,
				description:
					'The amount to compare with. Unlike the other kinds of field, an amount is never ignored: left at zero the condition is still sent, so "greater than" returns everything above nothing.',
			},
		]),
		...forType('date', [
			{
				displayName: 'Value',
				name: 'dateValue',
				type: 'dateTime',
				default: '',
				description: 'The moment to compare with. A condition left empty here is ignored.',
			},
		]),
		...forType('guid', [
			{
				displayName: 'Value',
				name: 'guidValue',
				type: 'string',
				default: '',
				placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
				description:
					'The ID as Nibo returns it. It travels without quotes, which is what this API takes on an ID column and refuses everywhere else, so anything that is not an ID is refused before the request rather than answered with a 500 about operand types. A condition left empty here is ignored.',
			},
		]),
	];
}

/**
 * The operator and the value box of one closed-list field.
 *
 * Both are shown only for this field's own path, which is what keeps two lists
 * in one menu from sharing a box. The default is the first choice, so a row
 * added and left untouched is still a whole condition — and it is unpacked into
 * a name first because the n8n linter reads defaults straight from the source
 * and reports `a[0].b` as no default at all.
 */
function choiceFields(field: IFilterField): INodeProperties[] {
	const choices = field.choices ?? [];
	const firstChoice = String(choices[0]?.value ?? '');
	const show = { field: [field.path] };

	return [
		{
			displayName: 'Operator',
			name: 'operator',
			type: 'options',
			options: [
				{ name: 'Is', value: 'eq' },
				{ name: 'Is Not', value: 'ne' },
			],
			default: 'eq',
			displayOptions: { show },
		},
		{
			displayName: 'Value',
			name: 'optionsValue',
			type: 'options',
			options: choices,
			default: firstChoice,
			description: `Which ${field.label.toLowerCase()} to look for`,
			displayOptions: { show },
		},
	];
}

/** One row of the condition builder, as the editor stores it */
interface IFilterRow {
	field?: string;
	operator?: string;
	/** Where a text field is typed */
	value?: string;
	/** The checkbox of a yes-or-no field */
	booleanValue?: boolean;
	/** The box of an amount */
	numberValue?: number;
	/** The list of a field whose answers are a closed set */
	optionsValue?: string;
	/** The picker of a date field */
	dateValue?: string;
	/** The box of an ID field, whose literal is the one this API takes bare */
	guidValue?: string;
}

/**
 * The `$filter` this item is read with, in the order the three answers beat
 * each other.
 *
 * 1. **The expression written by hand under Options wins.** Filling it in is
 *    what takes the conditions off the screen, so it has to be what takes them
 *    out of the request too. A field nobody can see must never be filtering
 *    underneath one they can — the same rule, read from both sides, that 0.5.2
 *    was about all along.
 * 2. **Otherwise the conditions are built.**
 * 3. **Otherwise the expression a node saved before 0.5.2 still carries** in the
 *    field of the body it was typed into, under this very name. That node goes
 *    on filtering exactly as it did — the retaguarda the interval (0.4.2) and
 *    the strict scan (0.4.3) already have. A fallback, never an override: it is
 *    a value nobody can see any more either.
 */
export function listFilter(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
	types: Record<string, ODataFieldType>,
): string {
	const written = typeof options.filter === 'string' ? options.filter.trim() : '';
	if (written !== '') {
		return written;
	}

	const rows = ((this.getNodeParameter('filters', itemIndex, {}) as IDataObject).conditions ??
		[]) as IFilterRow[];

	const built = buildODataFilter(
		rows.map((row) => filterCondition.call(this, row, itemIndex, types)),
		this.getNodeParameter('filterCombine', itemIndex, 'and') as string,
	);

	return built === '' ? String(this.getNodeParameter('filter', itemIndex, '') ?? '') : built;
}

/**
 * One row turned into a condition the builder can write.
 *
 * The type comes from the menu of the resource, and it is what decides the
 * literal — so a field this version does not have a type for cannot be written
 * at all. That can only be a node saved against a different menu, and dropping
 * the condition would hand back more records than the workflow asked for, which
 * is the direction a workflow deletes by. It fails instead, carrying its index.
 */
function filterCondition(
	this: IExecuteFunctions,
	row: IFilterRow,
	itemIndex: number,
	types: Record<string, ODataFieldType>,
): IODataCondition {
	const field = String(row.field ?? '').trim();
	const type = types[field];

	if (field !== '' && type === undefined) {
		throw new NodeOperationError(this.getNode(), `This node cannot filter on the field "${field}"`, {
			itemIndex,
			description:
				'It is not one of the fields the API answers a filter on. Pick another field, or write the expression yourself in Filter (OData), under Options at the end of the node.',
		});
	}

	return {
		field,
		operator: String(row.operator ?? ''),
		// A row with no field is an unfinished row and the builder skips it — but
		// it is still handed a type, and text is the type of nothing typed yet.
		type: type ?? 'text',
		value: filterValue(row, type),
	};
}

/** Each type is collected in its own box, so the value arrives as what it is */
function filterValue(row: IFilterRow, type: ODataFieldType | undefined): unknown {
	if (type === 'boolean') {
		return row.booleanValue;
	}
	if (type === 'number') {
		return row.numberValue;
	}
	if (type === 'options') {
		return row.optionsValue;
	}
	if (type === 'date') {
		return row.dateValue;
	}
	if (type === 'guid') {
		return row.guidValue;
	}

	return row.value;
}
