import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * The service invoices — **NFS-e** — of the organization.
 *
 * Measured on 2026-07-29, and it had to be measured against a **production**
 * organization: the test company answers `GET /nfse/serviceprofiles` with
 * `count: 0`, and a note needs a digital certificate and a service profile
 * approved by the city hall. A company created that morning has neither. The
 * exception, its limits and what it left behind are written in section 5 of
 * `PLAN-v0.14.0.md`.
 */
const SERVICE_INVOICE = 'serviceInvoice';

/**
 * **The name on screen cannot be the name of the document.** The n8n linter
 * puts every display name in title case, and title case turns `NFS-e` into
 * `NFS-E`, a spelling that exists nowhere. 0.9.0 hit the same wall with the
 * category tree and solved it the same way: the display name is the plain
 * English one, and the document is named in the description, where nothing
 * rewrites it. The value a workflow saves is `serviceInvoice`.
 */
export const serviceInvoiceResources: INodePropertyOptions[] = [
	{
		name: 'Service Invoice',
		value: SERVICE_INVOICE,
		description: 'A Brazilian service invoice — NFS-e — issued from a receivable',
	},
];

/** Alphabetical by name, which is what the n8n linter requires */
export const serviceInvoiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
			},
		},
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				action: 'Cancel a service invoice',
				description:
					'Cancel a note at the city hall, which leaves the record in place with its status set to Cancelled',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a service invoice',
				description:
					'Retrieve one note by ID, read through the list — this API has no get-by-ID route for a note',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many service invoices',
				description: 'Retrieve the service invoices of the organization',
			},
			{
				name: 'Get Many Service Profiles',
				value: 'listProfiles',
				action: 'Get many service profiles',
				description:
					'Retrieve the service profiles, which is what a note is issued through and the only way to know whether this organization issues one at all',
			},
			{
				name: 'Issue',
				value: 'issue',
				action: 'Issue a service invoice',
				description:
					'Issue a note from a receivable and, unless the wait is switched off, follow it until the city hall has answered',
			},
		],
		default: 'list',
	},
];

/**
 * The states a note carries, as **codes**, because that is what the API
 * compares: `status/code eq 3` answers 200 and `status/code eq '3'` is a 500
 * about incompatible types.
 *
 * Seven, and the last two arrived in the **acceptance** of this version rather
 * than in the measurements that preceded it — which is what a real run buys
 * over a test. The plan had written that `-2` and `-3` had never been seen and
 * refused to claim they did not exist; cancelling a note walked straight
 * through both of them.
 *
 * There are **two pipelines**, and they mirror each other: `1` → `2` → `3` on
 * the way in, and `-2` → `-3` → `-4` on the way out. Only `3`, `-1` and `-4`
 * are places a note stays.
 *
 * ⚠️ Even so, this list is **what was measured, not what exists**: there is no
 * route that enumerates this enum, and the fourteenth gotcha of this project —
 * a 404 proves the absence of that path, never of the capability — holds for
 * the value of an enum as it holds for a route.
 */
const STATUS_CODES: INodePropertyOptions[] = [
	{
		name: 'Authorized',
		value: '3',
		description:
			'Code 3 — the good terminal state. Only here does the note gain its number, its verification code, its PDF and its XML.',
	},
	{
		name: 'Cancellation in Progress',
		value: '-3',
		description: 'Code -3 — the city hall is cancelling it. Transient, and it reaches -4.',
	},
	{
		name: 'Cancelled',
		value: '-4',
		description: 'Code -4 — authorized and then cancelled at the city hall. The record stays.',
	},
	{
		name: 'Denied',
		value: '-1',
		description:
			'Code -1 — the city hall refused it, and the reason is its own text in lastMessage',
	},
	{
		name: 'Queued for Cancellation',
		value: '-2',
		description:
			'Code -2 — where a cancellation is born, and where a note sits the instant after Cancel is accepted. Transient.',
	},
	{
		name: 'Queued for Processing',
		value: '1',
		description: 'Code 1 — where a note is born. Transient.',
	},
	{
		name: 'Waiting for Authorization',
		value: '2',
		description: 'Code 2 — the city hall has it. Transient.',
	},
];

const PARTIAL_LIST_NOTE =
	'These are the codes measured on 2026-07-29 — five while the version was built and two more in its acceptance, by cancelling a note — and this API has no route that lists the whole set. For a state that is not here, write the condition in Filter (OData), under Options at the end of the node.';

/**
 * The closed menu, alphabetical by label, every path measured one by one
 * against the real collection on 2026-07-29.
 *
 * Two of the types are the opposite of what the name suggests, and both were
 * measured rather than assumed:
 *
 * - **Invoice Number is text.** `number eq 35` answers 500 — *"Found operand
 *   types 'Edm.String' and 'Edm.Int32'"* — and `number eq '35'` answers 200.
 * - **RPS Number is a number**, and its **series is text again**. So the three
 *   numeric-looking fields of one note are quoted, bare and quoted, in that
 *   order.
 *
 * The taker appears twice because the record carries it twice: `stakeholder` is
 * the contact in Nibo, and `customer` is the taker as printed on the note, with
 * document, e-mail and address. Both filter.
 *
 * Left out on purpose, and both are a 500: `status/description`, because an
 * enum does not compare in this API — the same wall as `document/type` on a
 * contact and `costCenterValueType` on a schedule — and `isDeleted`, which is
 * simply not in this view, as it is not in the category, the cost centre or the
 * settled entry.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Accrual Date', path: 'accrualRpsDate', type: 'date' },
	{ label: 'Authorized At', path: 'authorizeDate', type: 'date' },
	{ label: 'Cancelled At', path: 'cancelDate', type: 'date' },
	{ label: 'City Where Service Was Provided', path: 'cityWhereServiceWasProvided', type: 'text' },
	{ label: 'Contact ID', path: 'stakeholder/id', type: 'guid' },
	{ label: 'Contact Name', path: 'stakeholder/name', type: 'text' },
	{ label: 'Created At', path: 'createDate', type: 'date' },
	{ label: 'Customer Name', path: 'customer/name', type: 'text' },
	{ label: 'ID', path: 'id', type: 'guid' },
	{ label: 'Invoice Number', path: 'number', type: 'text' },
	{ label: 'Last Status Change', path: 'lastStatusChange', type: 'date' },
	{ label: 'Provider', path: 'provider', type: 'text' },
	{ label: 'RPS Number', path: 'rpsNumber', type: 'number' },
	{ label: 'RPS Series', path: 'rpsSeries', type: 'text' },
	{ label: 'Schedule ID', path: 'schedule/id', type: 'guid' },
	{ label: 'Service Description', path: 'service/description', type: 'text' },
	{ label: 'Service Profile ID', path: 'serviceProfile/id', type: 'guid' },
	{
		label: 'Status',
		path: 'status/code',
		type: 'code',
		choices: STATUS_CODES,
		choicesNote: PARTIAL_LIST_NOTE,
	},
	{ label: 'Updated At', path: 'updateDate', type: 'date' },
	{ label: 'Value', path: 'value', type: 'number' },
];

export const serviceInvoiceFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

/**
 * Said where the links are about to be handed over, and measured rather than
 * deduced: with the probe's note already **cancelled**, both addresses were
 * fetched with no authentication header at all — the PDF answered 200
 * `application/pdf` and the XML 200 `text/xml`.
 *
 * Cancelling takes the fiscal validity away; it does not take the document off
 * the air.
 */
const LIST_NOTICE =
	'The pdfFileUrl and xmlFileUrl on these records are public: they open without a token, and they keep answering after the note is cancelled. Treat a link as the document itself, not as a reference to it.';

/**
 * Said above the list of profiles, because a profile is not a setting to be
 * tried: it decides the tax and the text printed on the note.
 */
const PROFILES_NOTICE =
	'A service profile decides which service the note declares, how much tax it charges and the remarks printed on it — where bank details and a Pix key usually go. An empty answer here is not an error: it means this organization does not issue NFS-e, which needs a valid digital certificate and a profile approved by the city hall.';

/**
 * The sentence read before the button that cannot be un-pressed.
 *
 * Three things it has to say, and each of them was measured rather than
 * reasoned: the amount is not on this screen because it comes from the
 * schedule; what comes back is a city hall's answer and not this node's; and
 * cancelling later does not remove the note nor take its documents off the air.
 */
/**
 * What cancelling really does, and the middle sentence is the one that was
 * measured rather than reasoned: with the probe's note already in `-4`, its PDF
 * and its XML were fetched with no authentication header at all and both
 * answered 200.
 */
const CANCEL_NOTICE =
	'Cancelling is done at the city hall and it does not remove anything: the note stays in the company\'s history for good, marked Cancelled — it is a fiscal document. Its PDF and XML keep answering afterwards, and they are public, so whoever received a link before still downloads the note after it is cancelled, with nothing in the document saying so.';

const ISSUE_NOTICE =
	'Issuing sends an RPS to the city hall, and there is no undo: the note can only be cancelled afterwards, which leaves the record in place and keeps its PDF and XML answering. The amount and the taker are not asked for here because both come from the schedule. If the city hall denies the note, that is not a failure of this node — the item comes out with the denial and the city hall\'s own text in lastMessage.';

export const serviceInvoiceFields: INodeProperties[] = [
	{
		displayName: LIST_NOTICE,
		name: 'listNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['list'],
			},
		},
	},
	{
		displayName: PROFILES_NOTICE,
		name: 'profilesNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['listProfiles'],
			},
		},
	},
	{
		displayName: ISSUE_NOTICE,
		name: 'issueNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['issue'],
			},
		},
	},
	{
		displayName: 'Schedule ID',
		name: 'scheduleId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'a01f0058-d321-4805-bd73-810e88b98557',
		description:
			'The receivable the note is issued from. Both the amount and the taker come from it and are not asked for here — the API wants the taker as a separate key, and this node reads it off the schedule so the two can never disagree. The schedule is read before anything is sent, so a wrong ID stops here rather than at a city hall. One schedule was measured carrying three notes, so this API has no one-note-per-schedule rule and the node puts no guard of its own there.',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['issue'],
			},
		},
	},
	{
		displayName: 'Service Profile Name or ID',
		name: 'serviceProfileId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'loadServiceProfiles',
			// The way back from the per-item mode, where the list refuses to load.
			loadOptionsDependsOn: ['authMode'],
		},
		required: true,
		default: '',
		description:
			'Which profile the note is declared under. It decides the service, the tax and the remarks printed on the note, and the API refuses an issuing without one. ⚠️ A wrong profile is not something fixed afterwards: undoing it is a cancellation at the city hall. The list shows the service code and the ISS rate next to each name, which is what tells two similar profiles apart. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['issue'],
			},
		},
	},
	{
		displayName: 'Accrual Date',
		name: 'accrualDate',
		type: 'dateTime',
		typeOptions: {
			// A competence is a day. The API takes YYYY-MM-DD and there is no hour
			// in it, so a clock would offer a decision that does not exist — and one
			// with a wrong answer, since midnight in Brasília is the day before in
			// UTC.
			dateOnly: true,
		},
		required: true,
		default: '',
		description:
			'The competence of the RPS — the month the service is declared in. Asked for rather than guessed: on the schedules of this API an omitted accrual date is copied from the due date, which throws the competence into the wrong month.',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['issue'],
			},
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['issue'],
			},
		},
		options: [
			{
				displayName: 'City Where Service Was Provided',
				name: 'cityWhereServiceWasProvided',
				type: 'string',
				default: '',
				placeholder: 'Rio de Janeiro',
				description:
					'Where the service was provided, when it was not where the company is. Left out, the key is not sent at all and Nibo decides — which is what a company issuing from its own address wants.',
			},
			{
				displayName: 'Service Description',
				name: 'additionalServiceDescription',
				type: 'string',
				default: '',
				description:
					'The text that fills the description template of the profile — the {{Descricao}} it carries. Left out, the key is not sent and the profile is left to resolve it on its own.',
			},
			{
				displayName: 'State Where Service Was Provided',
				name: 'stateWhereServiceWasProvided',
				type: 'string',
				default: '',
				placeholder: 'RJ',
				description: 'The state of the city above, as the two-letter abbreviation',
			},
		],
	},
	{
		displayName: CANCEL_NOTICE,
		name: 'cancelNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
				operation: ['cancel'],
			},
		},
	},
	{
		displayName: 'Service Invoice ID',
		name: 'serviceInvoiceId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'be35e904-0669-40d3-bad1-cc7277d56781',
		description:
			'The note, as Get Many returns it. There is no get-by-ID route on this API — the record is fetched through the list filtered by this ID.',
		displayOptions: {
			show: {
				resource: [SERVICE_INVOICE],
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
				resource: [SERVICE_INVOICE],
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
				resource: [SERVICE_INVOICE],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({
		resources: [SERVICE_INVOICE],
		fields: FILTER_FIELDS,
		// The competence of the note, which is what accounting reads a list of
		// notes by — and a row added and left untouched is still a whole condition.
		defaultField: 'accrualRpsDate',
	}),
];
