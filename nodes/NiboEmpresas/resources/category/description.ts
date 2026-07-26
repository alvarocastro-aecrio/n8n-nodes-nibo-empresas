import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The financial categories — the chart of accounts a schedule is filed under.
 *
 * This resource exists because of a hole the 0.6.0 cut left: Create of a
 * schedule asks for a category ID, a GUID, and the node offered no way to learn
 * one. That forced an HTTP Request node just to list categories, which is the
 * thing this package was built to remove.
 *
 * It matters more than the dropdown that reads from here, and for a reason that
 * is easy to miss: **a category ID belongs to one organization**. A workflow
 * walking a portfolio one token per item cannot carry a category picked on the
 * screen — it has to look the right one up for each organization, and this is
 * what it looks it up with.
 */
const CATEGORY = 'category';

export const categoryResources: INodePropertyOptions[] = [
	{
		name: 'Category',
		value: CATEGORY,
		description: 'A line of the chart of accounts, which a schedule is filed under',
	},
];

/**
 * The operations, where 0.8.2 had one — and the ones that arrived in 0.9.0 were
 * there all along, behind a door this project had written off.
 *
 * The catalogue recorded `POST /categories`, `PUT /categories/{id}`,
 * `DELETE /categories/{id}` and `GET /categories/{id}` as 404 and concluded
 * that a category is read-only in this API. The 404s were real. The conclusion
 * was not: the writing family does not live under `/categories`, it lives under
 * **`/schedules/categories`**, and create, get-by-id, groups and tree all
 * answer 200 there — measured on the test company on 2026-07-26.
 *
 * The rule that leaves: a 404 proves the absence of **that path**, never the
 * absence of the capability.
 *
 * Update and Delete are still not here, and that is measurement rather than
 * caution: `PUT` and `DELETE /schedules/categories/{id}` are 404 as well, in
 * either path. A menu entry with nothing behind it is the bug 0.3.1 was about.
 */
export const categoryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [CATEGORY],
			},
		},
		// Alphabetical by name, which is the order the editor shows and the one
		// the n8n linter requires of an options list.
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a category',
				description: 'Retrieve one financial category by ID',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many categories',
				description: 'Retrieve the financial categories of the organization',
			},
			{
				name: 'Get Many Groups',
				value: 'groups',
				action: 'Get many category groups',
				description: 'Retrieve the groups the chart of accounts is divided into',
			},
			{
				name: 'Get Tree',
				value: 'tree',
				action: 'Get the category tree',
				description:
					'Retrieve the whole hierarchy — groups, subgroups and the categories inside them',
			},
		],
		default: 'list',
	},
];

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-26.
 *
 * One absence: **`isDeleted`**, which is a 500 — *Could not find a property
 * named 'isDeleted'* — the field is simply not on this view.
 *
 * And one presence worth explaining, because the same shape is refused
 * elsewhere: **`type` compares here**. `type eq 'in'` answers 200, while the
 * stakeholders' `document/type eq 'Cpf'` is a 500, which is why that one is on
 * no menu. Neither was assumed; both were asked.
 *
 * Alphabetical by label: the order the editor shows and the one the n8n linter
 * requires of an options list.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Group Name', path: 'group/name', type: 'text' },
	{ label: 'Is Editable', path: 'isEditable', type: 'boolean' },
	{ label: 'Name', path: 'name', type: 'text' },
	{ label: 'Reference Code', path: 'referenceCode', type: 'text' },
	{
		label: 'Type',
		path: 'type',
		type: 'options',
		// The API's own two words. Offered as a list because `in` and `out` are
		// not what anyone would guess for "revenue" and "expense".
		choices: [
			{ name: 'Expense', value: 'out', description: 'A category a payment is filed under' },
			{ name: 'Revenue', value: 'in', description: 'A category a receipt is filed under' },
		],
	},
];

export const categoryFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

/** The two operations that walk a collection page by page */
const SCANS = ['list', 'groups'];

export const categoryFields: INodeProperties[] = [
	{
		displayName: 'Category ID',
		name: 'categoryId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
		description:
			'The ID of the category to read, as Nibo returns it. It is read through the list filtered by ID rather than through the route that reads one record by ID, so that Get and Get Many answer the very same record — that route drops the subgroup, and a node that answered one shape here and another there would be inventing a difference the API does not have.',
		displayOptions: {
			show: {
				resource: [CATEGORY],
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
				resource: [CATEGORY],
				operation: SCANS,
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
		hint: 'A chart of accounts is usually a few dozen lines, so one page is normally all of it',
		displayOptions: {
			show: {
				resource: [CATEGORY],
				operation: SCANS,
				returnAll: [false],
			},
		},
	},
	// The tree takes no page and no filter — it answers the whole hierarchy in
	// one bare array — so these two are everything there is to decide about it.
	// Both were measured to answer 200 on 2026-07-26, and both travel only when
	// they are on.
	{
		displayName: 'Include Deleted Categories',
		name: 'includeDeleted',
		type: 'boolean',
		default: false,
		description:
			'Whether to include the categories that were deleted in Nibo. They carry isDeleted as true, so they can be told apart from the rest.',
		displayOptions: {
			show: {
				resource: [CATEGORY],
				operation: ['tree'],
			},
		},
	},
	{
		// The label spells out what the flag does rather than naming the document:
		// the n8n linter title-cases every display name, which turns NFS-e into
		// NFS-E — a spelling the document does not have. The description carries
		// the name instead, where nothing rewrites it.
		displayName: 'Only Service Invoice Categories',
		name: 'nfseValueOnly',
		type: 'boolean',
		default: false,
		description:
			'Whether to narrow the tree to the categories an NFS-e amount can be composed of. Measured on 2026-07-26: it drops interest, fines and "Outras receitas" from the answer, and it reveals a subgroup the call without it does not show.',
		displayOptions: {
			show: {
				resource: [CATEGORY],
				operation: ['tree'],
			},
		},
	},
	...filterProperties({ resources: [CATEGORY], fields: FILTER_FIELDS, defaultField: 'name' }),
];
