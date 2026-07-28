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
				name: 'Cancel',
				value: 'cancel',
				action: 'Cancel a collection',
				description:
					'Cancel a charge, which leaves the record in place with its status set to Cancelled',
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a collection',
				description:
					'Issue a charge from a receivable, choosing whether Nibo sends it to the payer or holds it for review',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a collection',
				description:
					'Retrieve one charge by ID, read through the list — this API has no get-by-ID route for a charge',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many collections',
				description: 'Retrieve the charges of the organization',
			},
			{
				name: 'Get Many Profiles',
				value: 'listProfiles',
				action: 'Get many collection profiles',
				description:
					'Retrieve the collection profiles, which is what a charge is issued through and the only way to know whether this organization can issue one',
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
 * ⚠️ **This list is what was measured, not what exists** — and the fourth entry
 * is the proof. Three states showed up while the version was being built, and a
 * fourth (`0`) turned up hours later during its acceptance, on a charge that had
 * been born `1` the day before. The API's own enum may hold more, there is no
 * route that enumerates it, and `status/description` answers HTTP 500 on every
 * comparison. A state that is not here is reachable through Filter (OData), and
 * the field says so.
 */
const STATUS_CODES: INodePropertyOptions[] = [
	{ name: 'Cancelled', value: '-1', description: 'Code -1 — the charge was cancelled' },
	{
		name: 'Paid',
		value: '3',
		description: 'Code 3',
	},
	{
		name: 'Pending Activation',
		value: '1',
		description: 'Code 1 — one of the two states a charge is born in',
	},
	{
		name: 'Queued for Generation',
		value: '0',
		description: 'Code 0 — the other one, seen while the boleto is still being produced',
	},
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

/**
 * The sentence that has to be read before the button, because one of the two
 * answers below leaves the building. Measured on 2026-07-28: `deliveryType: 0`
 * is the "régua de cobrança" — Nibo mails the boleto to the payer and starts the
 * automatic reminders.
 */
const CREATE_NOTICE =
	'Delivery decides whether this reaches the payer. Send It starts Nibo\'s reminder sequence and e-mails the boleto to them, which is an action you cannot take back; Hold for Review keeps it on the Nibo screen and sends nothing. The node cannot confirm which happened afterwards: both look identical when read back.';

/**
 * Three things nobody would guess, all three measured on 2026-07-28.
 */
const CANCEL_NOTICE =
	'Cancelling does not remove the charge: the record stays where it is with its status set to Cancelled, and the public link still answers afterwards. There is a second way it happens that nobody expects — deleting the schedule cancels the charge that hangs off it. And a charge can only be cancelled once: asking twice is refused by the API.';

export const collectionFields: INodeProperties[] = [
	{
		displayName: CREATE_NOTICE,
		name: 'createNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Schedule ID',
		name: 'scheduleId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '04a6a2a9-ef71-4733-9ac7-33737ac4d40c',
		description:
			'The receivable to charge for. The amount and the description of the charge come from it — they are not asked here. A schedule carries at most one charge: the node checks before issuing and names the one already there.',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Due Date',
		name: 'dueDate',
		type: 'dateTime',
		typeOptions: {
			// A charge falls due on a day. The API takes YYYY-MM-DD and there is no
			// hour in it, so a clock would offer a decision that does not exist — and
			// one with a wrong answer, since midnight in Brasilia is the day before
			// in UTC.
			dateOnly: true,
		},
		required: true,
		default: '',
		description: 'The day the charge falls due, usually the same as the schedule it comes from',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Collection Profile Name or ID',
		name: 'collectionProfileId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'loadCollectionProfiles',
			// The way back from the per-item mode, where the list refuses to load.
			loadOptionsDependsOn: ['authMode'],
		},
		required: true,
		default: '',
		description:
			'Which profile issues the charge — it is what ties the bank provider to it, and the API refuses a creation without one. An organization with no profile cannot issue charges at all. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Delivery',
		name: 'deliveryType',
		type: 'options',
		options: [
			{
				name: 'Hold for Review',
				value: 1,
				description: 'The charge waits on the Nibo screen and nothing is sent to anyone',
			},
			{
				name: 'Send It',
				value: 0,
				description:
					'Nibo e-mails the boleto to the payer and starts the automatic reminder sequence',
			},
		],
		default: 1,
		description:
			'Whether Nibo delivers the charge to the payer or keeps it for someone to release. It is write-only: the record reads the same either way, so nothing downstream can tell which was chosen.',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['create'],
			},
		},
	},
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
		displayName: CANCEL_NOTICE,
		name: 'cancelNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['cancel'],
			},
		},
	},
	{
		displayName: 'Collection ID',
		name: 'collectionId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'c1a5e0d4-77b0-4f1a-9b3e-2a6a1d0f9c11',
		description:
			'The charge, as Get Many returns it. There is no get-by-ID route on this API — the record is fetched through the list filtered by this ID.',
		displayOptions: {
			show: {
				resource: [COLLECTION],
				operation: ['cancel', 'get'],
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
