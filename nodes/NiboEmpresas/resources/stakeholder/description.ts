import type { INodeProperties } from 'n8n-workflow';

// Customer, Supplier, Employee and Partner share the exact same contract in
// the API, so they share this description too. Only Customer is exposed in
// v0.1.0; the other three enter later as one option each, with no new logic.

export const stakeholderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['customer'],
			},
		},
		// Alphabetical by name, which is what the n8n linter requires and what
		// the editor shows in this exact order.
		options: [
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a customer',
				description: 'Remove a customer from the organization',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a customer',
				description: 'Retrieve one customer by ID',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many customers',
				description: 'Retrieve customers of the organization',
			},
		],
		default: 'list',
	},
];

export const stakeholderFields: INodeProperties[] = [
	{
		displayName: 'Customer ID',
		name: 'customerId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the customer to work on, as Nibo returns it in the ID field',
		displayOptions: {
			show: {
				resource: ['customer'],
				operation: ['delete', 'get'],
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
				resource: ['customer'],
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
				resource: ['customer'],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	{
		displayName: 'Filter (OData)',
		name: 'filter',
		type: 'string',
		default: '',
		placeholder: "contains(name,'LTDA')",
		description:
			"OData expression sent as $filter, to narrow the results on the server. Accented text needs no special treatment, e.g. contains(name,'SERVIÇOS').",
		displayOptions: {
			show: {
				resource: ['customer'],
				operation: ['list'],
			},
		},
	},
	{
		displayName: 'Fail on Incomplete Results',
		name: 'failOnIncomplete',
		type: 'boolean',
		default: false,
		description:
			'Whether to fail when the result may be incomplete, instead of returning the records with a warning. Records written while the pages are being read can slip past the cursor, which shows up as a record count that changes mid-scan or as fewer records than the server reported.',
		displayOptions: {
			show: {
				resource: ['customer'],
				operation: ['list'],
				returnAll: [true],
			},
		},
	},
];
