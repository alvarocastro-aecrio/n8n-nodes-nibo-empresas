import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IFilterField } from '../shared/filter';
import { filterFieldTypes, filterProperties } from '../shared/filter';

/**
 * Money moved between two accounts of the same organization.
 *
 * **A resource of its own, because the API made it one.** A transfer is not an
 * account and it is not an entry: it is a record with **three top-level fields**
 * — `id`, `originEntry`, `destinyEntry` — and two whole entries nested inside
 * it. No filter of `/accounts` works here and no filter of here works there, so
 * putting the two on one screen would be a menu whose fields depend on an
 * operation. It is the same reason that split Transaction - Payment from
 * Schedule - Debit in 0.10.0.
 *
 * **And half of it is in no documentation at all.** This project's catalogue
 * knew `POST /accounts/transfer` and nothing else. `GET /accounts/transfer` —
 * the collection — and `DELETE /accounts/transfer/{id}` were found on
 * 2026-07-27, and found by an error: a delete against an entry ID answered
 * HTTP 500 *"Transferência não encontrada"* where a 404 was expected. A 404 says
 * the route does not exist; that sentence says it does and the ID is wrong,
 * which is what sent the search looking for the collection.
 *
 * One creation makes **two entries**: a payment on the origin account and a
 * receipt on the destination, both flagged `isTransfer`. Deleting the transfer
 * takes both away and the balances return to what they were.
 */
const BANK_TRANSFER = 'bankTransfer';

/**
 * No family word, and that is the rule rather than an exception: `Bank Account`
 * and `Category` carry none either. A prefix gathers a family of several, and
 * this is one resource.
 *
 * It lands immediately after `Bank Account` on the alphabetical menu, which is
 * where somebody looking for it will look — and that ordering carries more
 * weight than it looks: a community node has **no search in its Actions tab**,
 * and no field of the node can turn one on.
 */
export const bankTransferResources: INodePropertyOptions[] = [
	{
		name: 'Bank Transfer',
		value: BANK_TRANSFER,
		description: 'Money moved from one account of the organization to another',
	},
];

/**
 * Alphabetical by name, which is what the n8n linter requires.
 *
 * **There is no Get**, and it is measurement rather than caution: nothing reads
 * one transfer on its own. It is read through Get Many filtered by `id`, exactly
 * as a settled entry is. **And no Update**: the API has no route that edits a
 * transfer — undoing and making another one is the operation it has.
 */
export const bankTransferOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a bank transfer',
				description:
					'Move money from one account of the organization to another, which records a payment on one and a receipt on the other',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a bank transfer',
				description:
					'Undo the transfer, which removes the two entries it created and returns both balances to what they were',
			},
			{
				name: 'Get Many',
				value: 'list',
				action: 'Get many bank transfers',
				description: 'Retrieve the transfers of the organization',
			},
		],
		default: 'list',
	},
];

/**
 * The menu is closed, and every path in it answered HTTP 200 on 2026-07-27.
 *
 * **Every one of them but the ID goes through a nested path**, because the
 * record has only three fields of its own. The top-level names somebody would
 * try first — `date`, `value`, `createDate`, `transferId`, `originEntryId` — are
 * all a 500. The OData builder has written a path with a `/` since 0.5.0, so
 * this costs nothing new; what is new is the depth, three levels rather than the
 * two of `document/number`.
 *
 * Two labels are deliberately not the plain word:
 *
 * - **Description** is `originEntry/identifier`. There is no `description` field
 *   on this record anywhere — the text of a transfer arrives in `identifier`.
 * - **Origin Value** names the side, because the two disagree on the sign: the
 *   origin entry of a transfer of 123,45 carries **−123,45** and the destination
 *   carries +123,45. A condition on 123,45 would find the wrong half.
 *
 * Alphabetical by label, as the editor shows and the linter requires.
 */
const FILTER_FIELDS: IFilterField[] = [
	{ label: 'Date', path: 'originEntry/date', type: 'date' },
	{ label: 'Description', path: 'originEntry/identifier', type: 'text' },
	{ label: 'Destination Account ID', path: 'destinyEntry/account/id', type: 'guid' },
	{ label: 'ID', path: 'id', type: 'guid' },
	{ label: 'Origin Account ID', path: 'originEntry/account/id', type: 'guid' },
	{ label: 'Origin Value', path: 'originEntry/value', type: 'number' },
];

export const bankTransferFilterFieldTypes = filterFieldTypes(FILTER_FIELDS);

export const bankTransferFields: INodeProperties[] = [
	/**
	 * The screen that has to warn before the button, because three of this
	 * route's refusals name the wrong cause.
	 */
	{
		displayName:
			'A missing or unknown account is answered by this API with "Não é possivel transferir valores de contas virtuais" — a sentence about a setting that has nothing to do with it. The node checks both accounts, the amount and the two sides before sending anything.',
		name: 'createNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Origin Account Name or ID',
		name: 'originAccountId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'loadBankAccounts',
			// The way back from the per-item mode, where the list refuses to load.
			loadOptionsDependsOn: ['authMode'],
		},
		required: true,
		default: '',
		description:
			'The account the money leaves. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Destination Account Name or ID',
		name: 'destinyAccountId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'loadBankAccounts',
			loadOptionsDependsOn: ['authMode'],
		},
		required: true,
		default: '',
		description:
			'The account the money reaches. It cannot be the same as the origin — this API refuses that with "Você não pode transferir valores entre as mesmas contas correntes", and the node refuses it first. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Date',
		name: 'date',
		type: 'dateTime',
		typeOptions: {
			// A transfer happens on a day. The API takes YYYY-MM-DD and there is no
			// hour in it, so a clock offers a decision that does not exist — and one
			// with a wrong answer, since the editor hands over the moment with its
			// offset and midnight in Brasília is the day before in UTC.
			dateOnly: true,
		},
		required: true,
		default: '',
		description:
			'The day the money moved. Unlike a settlement, this one may fall before the opening-balance date of either account: the API was measured to accept it, so the node does not refuse it.',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'number',
		required: true,
		default: 0,
		description:
			'How much moved, as a positive number. Zero, a negative amount and no amount at all are the same refusal in this API — "O valor informado deve ser positivo" — and the node makes it before sending.',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
		description:
			'What the transfer is about. Left empty it is not sent at all, and Nibo writes its own — "Transferência de {origin} para {destination}". Either way the text comes back in the identifier field of the two entries: this API has no description field on a transfer.',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Transfer ID',
		name: 'transferId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2efffcd0-8730-4348-86da-6d9a95be6149',
		description:
			'The ID of the transfer to undo, as Get Many returns it. It is the ID of the transfer itself, not of either entry it created: an entry ID here answers HTTP 500 "Transferência não encontrada", which is how this route was found in the first place.',
		displayOptions: {
			show: {
				resource: [BANK_TRANSFER],
				operation: ['delete'],
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
				resource: [BANK_TRANSFER],
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
				resource: [BANK_TRANSFER],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	...filterProperties({
		resources: [BANK_TRANSFER],
		fields: FILTER_FIELDS,
		defaultField: 'originEntry/date',
	}),
];
