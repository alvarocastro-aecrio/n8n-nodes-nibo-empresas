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
 * One operation, because the API has one route. `GET /categories/{id}` answers
 * **404** — measured on 2026-07-26 — and `POST /categories` has never been
 * measured at all, so neither is offered. A menu entry with nothing behind it
 * is the bug 0.3.1 was about.
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
		options: [
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many categories',
				description: 'Retrieve the financial categories of the organization',
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

export const categoryFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: [CATEGORY],
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
		hint: 'A chart of accounts is usually a few dozen lines, so one page is normally all of it',
		displayOptions: {
			show: {
				resource: [CATEGORY],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({ resources: [CATEGORY], fields: FILTER_FIELDS, defaultField: 'name' }),
];
