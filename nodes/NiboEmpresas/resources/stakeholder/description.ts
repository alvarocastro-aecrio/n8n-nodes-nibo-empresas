import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * Customer, Supplier, Employee and Partner are one family: the API gives the
 * four an identical contract, so they share one handler and this one
 * description. What differs is only what the editor shows — the word in each
 * text, the name of the ID field, and which documents make sense.
 */
interface IStakeholderType {
	/** The `resource` value, which is also the word used in the action texts */
	value: string;
	/** How the editor names one of them */
	label: string;
	/** How the action texts name many of them */
	plural: string;
	/** Its own ID parameter — a parameter name is a contract, so nobody shares one */
	idParameter: string;
	/** An employee is a person; the other three can be a company */
	isPerson?: boolean;
}

// Alphabetical by label: it is the order the editor shows and the order the
// n8n linter requires of an options list.
const TYPES: IStakeholderType[] = [
	{ value: 'customer', label: 'Customer', plural: 'customers', idParameter: 'customerId' },
	{
		value: 'employee',
		label: 'Employee',
		plural: 'employees',
		idParameter: 'employeeId',
		isPerson: true,
	},
	{ value: 'partner', label: 'Partner', plural: 'partners', idParameter: 'partnerId' },
	{ value: 'supplier', label: 'Supplier', plural: 'suppliers', idParameter: 'supplierId' },
];

const PEOPLE = TYPES.filter((type) => type.isPerson === true).map((type) => type.value);
const COMPANIES = TYPES.filter((type) => type.isPerson !== true).map((type) => type.value);
const EVERY_TYPE = TYPES.map((type) => type.value);

/** The Resource options, and the list the credential has to name — see the node description */
export const stakeholderResources: INodePropertyOptions[] = TYPES.map((type) => ({
	name: type.label,
	value: type.value,
}));

// Alphabetical by name, which is what the n8n linter requires and what the
// editor shows in this exact order.
export const stakeholderOperations: INodeProperties[] = TYPES.map((type) => ({
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
			action: `Create a ${type.value}`,
			description: `Add a ${type.value} to the organization`,
		},
		{
			name: 'Delete',
			value: 'delete',
			action: `Delete a ${type.value}`,
			description: `Remove a ${type.value} from the organization`,
		},
		{
			name: 'Get',
			value: 'get',
			action: `Get a ${type.value}`,
			description: `Retrieve one ${type.value} by ID`,
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
			action: `Update a ${type.value}`,
			description: `Change the fields given below, leaving every other field of the ${type.value} as it is`,
		},
	],
	default: 'list',
}));

/**
 * The menu shared by Create and Update. Create adds it under Additional
 * Fields, Update under Update Fields, and both are built from this one list so
 * they cannot drift apart. Alphabetical by display name, as the linter asks.
 *
 * The document type is not in the same place in the two forms — Create asks
 * for it up front, Update keeps it inside the menu — and one field depends on
 * it, so the path to it is a parameter of the list.
 */
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
				'One string holding every address, separated by commas. This API keeps the e-mails of a contact in a single field, not in a list.',
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

/**
 * Which documents the type can carry.
 *
 * An employee is a person, and the API would happily store a CNPJ there —
 * which is how a payroll ends up with a company in it. A partner, on the other
 * hand, really can be a holding company.
 */
function documentTypeOptions(isPerson: boolean): INodePropertyOptions[] {
	const cpf = { name: 'CPF', value: 'CPF' };

	return isPerson ? [cpf] : [{ name: 'CNPJ', value: 'CNPJ' }, cpf];
}

// Two literals rather than one field with a computed default: the n8n linter
// reads defaults straight from the source, and a value it cannot see is a
// value it reports as missing.
const DOCUMENT_TYPE_OF_A_PERSON: INodeProperties = {
	displayName: 'Document Type',
	name: 'documentType',
	type: 'options',
	options: documentTypeOptions(true),
	default: 'CPF',
};

const DOCUMENT_TYPE_OF_A_COMPANY: INodeProperties = {
	displayName: 'Document Type',
	name: 'documentType',
	type: 'options',
	options: documentTypeOptions(false),
	default: 'CNPJ',
};

/** The name and the document, which Update takes as ordinary optional fields */
function identityFields(isPerson: boolean): INodeProperties[] {
	return [
		{
			displayName: 'Document Number',
			name: 'documentNumber',
			type: 'string',
			default: '',
			description: 'Digits only, with no dots, slashes or dashes',
		},
		isPerson ? DOCUMENT_TYPE_OF_A_PERSON : DOCUMENT_TYPE_OF_A_COMPANY,
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
			description: 'The registered name of the contact',
		},
	];
}

/** The editor lists a menu in the order it is declared, and alphabetical is the convention */
function byDisplayName(fields: INodeProperties[]): INodeProperties[] {
	return [...fields].sort((one, other) => one.displayName.localeCompare(other.displayName));
}

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-25 —
 * in all four collections. Two absences are the point of it:
 *
 * - **The document type is not here.** `document/type eq 'Cpf'` is a 500: the
 *   enum does not compare. Whoever needs it filters by `document/number`.
 * - **No free-typed field name.** That would only trade one way of getting a
 *   500 for another, which is what this version exists to stop.
 *
 * Alphabetical by label: the order the editor shows and the one the n8n linter
 * requires of an options list.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'City', path: 'address/city', type: 'text' },
	{ label: 'Document Number', path: 'document/number', type: 'text' },
	{ label: 'Email', path: 'email', type: 'text' },
	{ label: 'Is Archived', path: 'isArchived', type: 'boolean' },
	{ label: 'Is Company', path: 'isCompany', type: 'boolean' },
	{ label: 'Name', path: 'name', type: 'text' },
	{ label: 'Phone', path: 'phone', type: 'text' },
	{ label: 'State', path: 'address/state', type: 'text' },
	{ label: 'Trading Name', path: 'companyInformation/companyName', type: 'text' },
	{ label: 'Updated At', path: 'updateDate', type: 'date' },
];

/**
 * What kind of value each path holds, for the handler that turns the rows of
 * the editor into conditions. The menu is UI and lives here; the builder knows
 * nothing about Nibo and is told the type.
 */
export const stakeholderFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

export const stakeholderFields: INodeProperties[] = [
	// One ID field per type, each named after itself
	...TYPES.map(
		(type): INodeProperties => ({
			displayName: `${type.label} ID`,
			name: type.idParameter,
			type: 'string',
			required: true,
			default: '',
			description: `The ID of the ${type.value} to work on, as Nibo returns it in the ID field`,
			displayOptions: {
				show: {
					resource: [type.value],
					operation: ['delete', 'get', 'update'],
				},
			},
		}),
	),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'The registered name of the contact',
		displayOptions: {
			show: {
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	// Two declarations of the same parameter: the type decides which documents
	// are on offer, and an employee gets only the one a person has.
	{
		displayName: 'Document Type',
		name: 'documentType',
		type: 'options',
		required: true,
		options: documentTypeOptions(false),
		default: 'CNPJ',
		displayOptions: {
			show: {
				resource: COMPANIES,
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Document Type',
		name: 'documentType',
		type: 'options',
		required: true,
		options: documentTypeOptions(true),
		default: 'CPF',
		displayOptions: {
			show: {
				resource: PEOPLE,
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
				resource: EVERY_TYPE,
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
				resource: EVERY_TYPE,
				operation: ['create'],
			},
		},
	},
	// Same again: the menu carries the document type, so it splits the same way
	...[COMPANIES, PEOPLE].map(
		(resources): INodeProperties => ({
			displayName: 'Update Fields',
			name: 'updateFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			description:
				'The fields to change. A field left out is not touched: the contact keeps whatever is stored in Nibo. A field added and left empty is written empty, which is how a value is erased on purpose.',
			options: byDisplayName([
				...writableFields('documentType'),
				...identityFields(resources === PEOPLE),
			]),
			displayOptions: {
				show: {
					resource: resources,
					operation: ['update'],
				},
			},
		}),
	),
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
	// There is no mode switch here any more, and that is the point: writing an
	// expression by hand under Options **is** the switch. A second one in the
	// body would be a second way of saying the same thing, and two switches can
	// disagree — which is exactly how a filter ends up being one thing on the
	// screen and another on the wire.
	//
	// The rows themselves are drawn by the shared module: what a resource owns
	// is its menu, and nothing else about the filter.
	...filterProperties({ resources: EVERY_TYPE, fields: FILTER_FIELDS, defaultField: 'name' }),
	// The raw expression is no longer here: since 0.5.1 it is an Option at the
	// end of the node, opt-in, like the interval (0.4.2) and the strict scan
	// (0.4.3) before it. The body of the node asks only what the operation
	// needs, and writing OData by hand is the exception, not the way in.
	//
	// The parameter keeps its name, so a node saved with it still carries the
	// expression it was filtering by — see `listFilter` in execute.ts, which
	// reads the option first and that stored value second.
];
