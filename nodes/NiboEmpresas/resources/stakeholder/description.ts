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
				name: 'Create',
				value: 'create',
				action: 'Create a customer',
				description: 'Add a customer to the organization',
			},
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
			{
				name: 'Update',
				value: 'update',
				action: 'Update a customer',
				description:
					'Change the fields given below, leaving every other field of the customer as it is',
			},
		],
		default: 'list',
	},
];

// The menu shared by Create and Update. Create adds it under Additional
// Fields, Update under Update Fields, and both are built from this one list so
// they cannot drift apart. Alphabetical by display name, as the linter asks.
//
// The document type is not in the same place in the two forms — Create asks
// for it up front, Update keeps it inside the menu — and one field depends on
// it, so the path to it is a parameter of the list.
function writableFields(documentType: string): INodeProperties[] {
	return [
		{
			displayName: 'Address City',
			name: 'addressCity',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Address Country',
			name: 'addressCountry',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Address District',
			name: 'addressDistrict',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Address Line 1',
			name: 'addressLine1',
			type: 'string',
			default: '',
			description: 'Street name',
		},
		{
			displayName: 'Address Line 2',
			name: 'addressLine2',
			type: 'string',
			default: '',
			description: 'Whatever completes the address, such as a floor or a unit',
		},
		{
			displayName: 'Address Number',
			name: 'addressNumber',
			type: 'number',
			default: 0,
			description: 'House or building number, which this API keeps as a number',
		},
		{
			displayName: 'Address State',
			name: 'addressState',
			type: 'string',
			default: '',
			placeholder: 'RJ',
		},
		{
			displayName: 'Address Zip Code',
			name: 'addressZipCode',
			type: 'string',
			default: '',
			placeholder: '20000000',
		},
		{
			displayName: 'Cell Phone',
			name: 'cellPhone',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Company Name',
			name: 'companyName',
			type: 'string',
			default: '',
			description: 'The trading name, when it differs from the registered name',
			// A person has no trading name. In Create the type is answered up
			// front, so the field simply is not offered for a CPF; in Update the
			// type is a field of this same menu and usually left out, so the rule
			// can only fire when the person says right there that this is a CPF.
			displayOptions: {
				hide: {
					[documentType]: ['CPF'],
				},
			},
		},
		{
			displayName: 'Contact Name',
			name: 'contactName',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			default: '',
			placeholder: 'billing@example.com,accounts@example.com',
			description:
				'One string holding every address, separated by commas. This API keeps the e-mails of a customer in a single field, not in a list.',
		},
		{
			displayName: 'Phone',
			name: 'phone',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Website',
			name: 'webSite',
			type: 'string',
			default: '',
		},
	];
}

// The name and the document, which Update takes as ordinary optional fields
// and Create asks for up front.
const identityFields: INodeProperties[] = [
	{
		displayName: 'Document Number',
		name: 'documentNumber',
		type: 'string',
		default: '',
		description: 'Digits only, with no dots, slashes or dashes',
	},
	{
		displayName: 'Document Type',
		name: 'documentType',
		type: 'options',
		options: [
			{
				name: 'CNPJ',
				value: 'CNPJ',
			},
			{
				name: 'CPF',
				value: 'CPF',
			},
		],
		default: 'CNPJ',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'The registered name of the customer',
	},
];

/** The editor lists a menu in the order it is declared, and alphabetical is the convention */
function byDisplayName(fields: INodeProperties[]): INodeProperties[] {
	return [...fields].sort((one, other) => one.displayName.localeCompare(other.displayName));
}

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
				operation: ['delete', 'get', 'update'],
			},
		},
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'The registered name of the customer',
		displayOptions: {
			show: {
				resource: ['customer'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Document Type',
		name: 'documentType',
		type: 'options',
		required: true,
		options: [
			{
				name: 'CNPJ',
				value: 'CNPJ',
			},
			{
				name: 'CPF',
				value: 'CPF',
			},
		],
		default: 'CNPJ',
		displayOptions: {
			show: {
				resource: ['customer'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Document Number',
		name: 'documentNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: '00000000000000',
		description: 'Digits only, with no dots, slashes or dashes',
		displayOptions: {
			show: {
				resource: ['customer'],
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
		options: byDisplayName(writableFields('/documentType')),
		displayOptions: {
			show: {
				resource: ['customer'],
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
			'The fields to change. A field left out is not touched: the customer keeps whatever is stored in Nibo. A field added and left empty is written empty, which is how a value is erased on purpose.',
		options: byDisplayName([...writableFields('documentType'), ...identityFields]),
		displayOptions: {
			show: {
				resource: ['customer'],
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
