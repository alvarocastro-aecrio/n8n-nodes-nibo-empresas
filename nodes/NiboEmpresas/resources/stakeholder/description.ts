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
		options: [
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
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		description: 'Max number of results to return',
		hint: 'The API caps every page at 500 records',
		displayOptions: {
			show: {
				resource: ['customer'],
				operation: ['list'],
			},
		},
	},
];
