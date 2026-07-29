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
				name: 'Get Many',
				value: 'list',
				action: 'Get many service invoices',
				description: 'Retrieve the service invoices of the organization',
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
 * Three of these five only exist because the probe of 2026-07-29 watched a note
 * go through them at 400 ms intervals — no note of the organization was sitting
 * in `1`, `2` or `3`. The two negative ones came free, from notes that were
 * already there.
 *
 * ⚠️ **`-2` and `-3` never appeared, and this list does not claim they do not
 * exist.** The fourteenth gotcha of this project — a 404 proves the absence of
 * that path, never of the capability — holds for the value of an enum as it
 * holds for a route. There is no route that enumerates this one.
 */
const STATUS_CODES: INodePropertyOptions[] = [
	{
		name: 'Authorized',
		value: '3',
		description:
			'Code 3 — the good terminal state. Only here does the note gain its number, its verification code, its PDF and its XML.',
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
	'These are the codes seen on 2026-07-29, three of them by watching one note go through them, and this API has no route that lists the whole set. For a state that is not here, write the condition in Filter (OData), under Options at the end of the node.';

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
