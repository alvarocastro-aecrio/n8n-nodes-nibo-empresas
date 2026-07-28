import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The charges Nibo issues from a receivable — boleto, and the Pix QR that comes
 * printed on it.
 *
 * **The whole family sits under `/public/`**, the only routes of this API with a
 * prefix of their own. Nothing about them is public in the sense of
 * unauthenticated: the token is still required. What *is* public is the link
 * each charge carries — see the notice below, and 1.12 of the plan.
 *
 * Measured on 2026-07-28, and it took two organizations. The test company
 * **cannot issue charges at all** — it has no collection profile, and a profile
 * ties a bank provider to the company — so the schema was mapped against its
 * empty collection, and the record, the status codes and the public link were
 * read from a production organization.
 */
const COLLECTION = 'collection';

/**
 * No family word: a prefix gathers a family of several, and this is one
 * resource. It lands between Category and the contacts on the alphabetical menu.
 */
export const collectionResources: INodePropertyOptions[] = [
	{
		name: 'Collection',
		value: COLLECTION,
		description: 'A charge — boleto and Pix — issued from a receivable',
	},
];

/** Alphabetical by name, which is what the n8n linter requires */
export const collectionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [COLLECTION],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many collections',
				description: 'Retrieve the charges of the organization',
			},
		],
		default: 'list',
	},
];

/**
 * The states a charge carries, as **codes**, because that is what the API
 * compares: `status/code eq 3` answers 200 and `status/code eq '3'` is a 500
 * about incompatible types.
 *
 * ⚠️ **This list is what was measured, not what exists.** Three states showed up
 * across the records read on 2026-07-28. The API's own enum may hold more, and
 * there is no route that enumerates it — `status/description` answers HTTP 500
 * on every comparison. A state that is not here is reachable through
 * Filter (OData), and the field says so.
 */
const STATUS_CODES: INodePropertyOptions[] = [
	{ name: 'Cancelled', value: '-1', description: 'Code -1 — the charge was cancelled' },
	{
		name: 'Pending Activation',
		value: '1',
		description: 'Code 1 — how every charge is born, whichever delivery was chosen',
	},
	{ name: 'Paid', value: '3', description: 'Code 3' },
];

/** The delivery side of the same record, measured the same way and just as partial */
const DELIVERY_CODES: INodePropertyOptions[] = [
	{ name: 'Not Delivered', value: '0', description: 'Code 0' },
	{ name: 'Viewed', value: '2', description: 'Code 2 — the payer opened it' },
];

const PARTIAL_LIST_NOTE =
	'These are the codes seen in the records measured on 2026-07-28, and this API has no route that lists the whole set. For a state that is not here, write the condition in Filter (OData), under Options at the end of the node.';

/**
 * The closed menu, alphabetical by label, every path measured against the API.
 *
 * Three labels are deliberately not the plain word:
 *
 * - **Issued By** is `createUser`, which holds the name of the person, as text.
 * - **Payer Name** and **Payer Document** are `debtor/name` and
 *   `debtor/document`. There is no `customer`, no `payer` and no `stakeholder`
 *   object on this record — the payer lives under `debtor`, which is the one
 *   name nobody tries first.
 * - **Last Status Change** is `lasStatusChangeDate`, and the misspelling is the
 *   API's own: it is missing the `t` of "last", and the correct spelling answers
 *   HTTP 500. The label is right and the wire is wrong, which is the only way
 *   round it.
 *
 * Left out on purpose: `url`, `pdf` and `collectionProfileId`. All three filter,
 * and filtering by any of them means nothing. `beneficiary/*` is left out for a
 * different reason — the beneficiary is the organization itself, so every record
 * carries the same one.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Created At', path: 'createDate', type: 'date' },
	{
		label: 'Delivery Status',
		path: 'deliveryStatus/code',
		type: 'code',
		choices: DELIVERY_CODES,
		choicesNote: PARTIAL_LIST_NOTE,
	},
	{ label: 'Description', path: 'description', type: 'text' },
	{ label: 'Due Date', path: 'dueDate', type: 'date' },
	{ label: 'ID', path: 'id', type: 'guid' },
	{ label: 'Issued By', path: 'createUser', type: 'text' },
	{ label: 'Last Status Change', path: 'lasStatusChangeDate', type: 'date' },
	{ label: 'Paid Value', path: 'paidValue', type: 'number' },
	{ label: 'Payer Document', path: 'debtor/document', type: 'text' },
	{ label: 'Payer ID', path: 'stakeholderId', type: 'guid' },
	{ label: 'Payer Name', path: 'debtor/name', type: 'text' },
	{ label: 'Schedule ID', path: 'scheduleId', type: 'guid' },
	{
		label: 'Status',
		path: 'status/code',
		type: 'code',
		choices: STATUS_CODES,
		choicesNote: PARTIAL_LIST_NOTE,
	},
	{ label: 'Value', path: 'value', type: 'number' },
];

export const collectionFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

/**
 * Said where the link is about to be handed over. Measured with a bare `fetch`:
 * the address answers **200 `text/html` with no token, no cookie and no header
 * of any kind**. Unlike the file service of 0.12.0, which redirects to signed
 * storage, this one serves the payment page directly.
 */
const LIST_NOTICE =
	'The url on each of these records is public: anyone holding it opens the payment page without a token. Treat it as the charge itself, not as a reference to it.';

export const collectionFields: INodeProperties[] = [
	{
		displayName: LIST_NOTICE,
		name: 'listNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['list'],
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
				resource: [COLLECTION],
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
				resource: [COLLECTION],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({
		resources: [COLLECTION],
		fields: FILTER_FIELDS,
		defaultField: 'dueDate',
	}),
];
