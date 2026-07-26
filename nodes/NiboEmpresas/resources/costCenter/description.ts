import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The cost centres — the other classifier of this API, and the one the node
 * never offered.
 *
 * A category says **what** an amount is; a cost centre says **which part of the
 * company** it belongs to. Nibo lets a schedule carry both, and until 0.9.0 a
 * workflow built with this node could carry neither of the second kind: the
 * apportionment field did not exist on the screen and the collection had no
 * resource at all.
 *
 * Unlike a category, this family is **reversible**: create, edit and delete all
 * answer on `/costcenters`, measured on the test company on 2026-07-26. That
 * difference is not decoration — it is why this screen carries no warning and
 * the category screen does.
 */
const COST_CENTER = 'costCenter';

export const costCenterResources: INodePropertyOptions[] = [
	{
		name: 'Cost Center',
		value: COST_CENTER,
		description: 'A part of the company an amount is attributed to, on its own or shared',
	},
];

// Alphabetical by name, which is what the n8n linter requires and what the
// editor shows in this exact order.
export const costCenterOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [COST_CENTER],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a cost center',
				description: 'Add a cost center to the organization',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a cost center',
				description: 'Remove a cost center from the organization',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a cost center',
				description: 'Retrieve one cost center by ID',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many cost centers',
				description: 'Retrieve the cost centers of the organization',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a cost center',
				description:
					'Change the fields given below, leaving every other field of the cost center as it is',
			},
		],
		default: 'list',
	},
];

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-26.
 *
 * Two absences, both measured rather than assumed:
 *
 * - **`isDeleted` is not here.** It is a 500 — *Could not find a property named
 *   'isDeleted'* — the field is not on this view, exactly as it is not on
 *   `/categories`.
 * - **`id` is not here, and neither is `$orderby=id`.** The key of this
 *   collection is `costCenterId`; `id` is a 500 on both.
 *
 * And one presence that needed its own type: the ID compares **bare**.
 * `costCenterId eq '<guid>'` is a 500 about operand types, while the same
 * expression without quotes answers 200 — the opposite of what the two text
 * fields above it require.
 *
 * Alphabetical by label: the order the editor shows and the one the n8n linter
 * requires of an options list.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Description', path: 'description', type: 'text' },
	{ label: 'External Code', path: 'externalCode', type: 'text' },
	{ label: 'ID', path: 'costCenterId', type: 'guid' },
];

export const costCenterFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

/**
 * What is writable, declared once so that Create and Update cannot drift apart.
 *
 * `externalCode` is the whole of it besides the description: measured on
 * 2026-07-26, it is optional and it stores. Nothing else on the record is
 * something a person fills in.
 */
function writableFields(): INodeProperties[] {
	return [
		{
			displayName: 'External Code',
			name: 'externalCode',
			type: 'string',
			default: '',
			description:
				'A code of your own, such as the one this cost center carries in another system. Nibo stores it as typed and offers it as a filter.',
		},
	];
}

export const costCenterFields: INodeProperties[] = [
	{
		displayName: 'Cost Center ID',
		name: 'costCenterId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
		description:
			'The ID of the cost center to work on, as Nibo returns it in the costCenterId field. That is what this collection calls its key: the shorter name every other collection uses is not a field here at all, and sorting by it answers HTTP 500.',
		displayOptions: {
			show: {
				resource: [COST_CENTER],
				operation: ['delete', 'get', 'update'],
			},
		},
	},
	// On the screen rather than in a menu, because the API refuses a creation
	// without it: omitting the description answers HTTP 500, *"A descrição é
	// obrigatório."* — measured on 2026-07-26.
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		required: true,
		default: '',
		description: 'What this cost center is called, as it will read in Nibo',
		displayOptions: {
			show: {
				resource: [COST_CENTER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: writableFields(),
		displayOptions: {
			show: {
				resource: [COST_CENTER],
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
			'The fields to change. A field left out is not touched: the cost center keeps whatever is stored in Nibo. A field added and left empty is written empty, which is how a value is erased on purpose.',
		// Description is on the screen when creating and back in the menu here on
		// purpose: on an update a field on the screen is a field that gets
		// written, so a visible empty Description would erase the stored one every
		// time anything else was changed — and this API refuses an empty one.
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'What this cost center is called, as it will read in Nibo',
			},
			...writableFields(),
		],
		displayOptions: {
			show: {
				resource: [COST_CENTER],
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
				resource: [COST_CENTER],
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
				resource: [COST_CENTER],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({
		resources: [COST_CENTER],
		fields: FILTER_FIELDS,
		defaultField: 'description',
	}),
];
