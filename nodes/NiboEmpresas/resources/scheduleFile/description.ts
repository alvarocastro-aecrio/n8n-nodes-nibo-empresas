import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * The documents of one schedule: listing them, putting one there, and taking
 * one away for good.
 *
 * **A resource of its own because the join is one.** A `fileId` and a schedule
 * are two separate records, and the document outlives the schedule: deleting a
 * schedule takes its own record away and its attachments still answer 200
 * afterwards, from a storage keyed by something else entirely. What is about the
 * document alone is next door, in File.
 *
 * **And the join is a pointer, not a list.** A file carries **one**
 * `referenceId`, and the attachments of a schedule are every file whose
 * `referenceId` is that schedule. So attaching a file that is already on another
 * schedule *moves* it, and — the reason this matters far more — attaching to a
 * schedule that does not exist writes that GUID onto the file, after which
 * reading the same GUID back hands the file over as if all were well. Measured
 * in the acceptance of 0.12.0, after the plan had built the defense on that very
 * read-back. What defends it now is a `GET` of the schedule before anything is
 * written, which answers HTTP 500 *"Agendamento não encontrado"* when there is
 * no such thing.
 *
 * **There is one route and it is called "credit".** A debit schedule attaches,
 * lists and deletes through `/schedules/credit/...` exactly the same, and
 * `/schedules/debit/{id}/files` is a 404. The same universality as
 * `GET /schedules/credit/{id}` — asymmetry 11 of this project's API contract.
 *
 * Measured on 2026-07-28, on the test organization.
 */
const SCHEDULE_FILE = 'scheduleFile';

/**
 * The family word, for the reason 0.8.2 wrote it: with 40 actions and no search
 * in the Actions tab of a community node, the order and the name are the whole
 * of what organizes the list. This belongs with Schedule - Credit and
 * Schedule - Debit, and the sort puts it right after them.
 */
export const scheduleFileResources: INodePropertyOptions[] = [
	{
		name: 'Schedule - File',
		value: SCHEDULE_FILE,
		description: 'The documents attached to one schedule',
	},
];

/** Alphabetical by name, which is what the n8n linter requires */
export const scheduleFileOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
			},
		},
		options: [
			{
				name: 'Attach',
				value: 'attach',
				action: 'Attach a file to a schedule',
				description:
					'Put a document that is already stored in Nibo onto a schedule, checking first that the schedule exists and confirming afterwards that the file is on it',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a file from a schedule',
				description:
					'Delete the document itself, which is more than taking it off this schedule: it can never be attached anywhere again',
			},
			{
				name: 'Get Many',
				value: 'listFiles',
				action: 'Get many files of a schedule',
				description: 'Retrieve the documents attached to one schedule',
			},
		],
		default: 'listFiles',
	},
];

/**
 * Said where the `url` is about to be handed over. Measured on 2026-07-28 with a
 * bare `curl`: that address answers 302 to a signed Azure link and serves the
 * document with no header, no cookie and no token. It is a fact about the
 * service rather than something this node can fix, and a list that handed the
 * link over without saying so would be the worse of the two options.
 */
const LIST_NOTICE =
	'The url on each of these records is public: anyone holding it downloads the document without a token. Treat it as the document itself, not as a reference to it.';

/**
 * The notice that had to say what the route does instead of what its path
 * suggests. `DELETE /schedules/credit/{scheduleId}/files/{fileId}` is in no
 * documentation — not Nibo's, not this project's catalogue — and it is **not a
 * detach**: the schedule in the path is ignored (a GUID of zeros deletes just
 * as well), what goes is the document itself — reattaching the same `fileId`
 * afterwards is a 500 *"Arquivo não encontrado"* — and the stored object stays
 * where it is, so a link given out before still serves the document.
 */
const DELETE_NOTICE =
	'This deletes the document, not the link between it and this schedule: the file cannot be attached again anywhere, and Nibo answers any attempt with "Arquivo não encontrado". The stored file itself is not removed either — a download link handed out before this still serves the document afterwards.';

/**
 * The measurement that costs a document rather than an error message, and the
 * reason it is a notice instead of a line in the field description: a workflow
 * filing the same invoice against a second schedule empties the first one, and
 * nothing anywhere says so.
 */
const ATTACH_NOTICE =
	'A document belongs to one schedule at a time. Attaching a file that is already on another schedule moves it: it disappears from the first one. To have the same document on two schedules, upload it twice.';

export const scheduleFileFields: INodeProperties[] = [
	{
		displayName: LIST_NOTICE,
		name: 'listNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
				operation: ['listFiles'],
			},
		},
	},
	{
		displayName: ATTACH_NOTICE,
		name: 'attachNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
				operation: ['attach'],
			},
		},
	},
	{
		displayName: DELETE_NOTICE,
		name: 'deleteNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
				operation: ['delete'],
			},
		},
	},
	{
		displayName: 'Schedule ID',
		name: 'scheduleId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90',
		description:
			'The schedule the documents belong to. A credit or a debit schedule alike: this API has a single route for both, and it is the credit one — asking the debit path answers 404 whatever the ID is.',
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
			},
		},
	},
	{
		displayName: 'File ID',
		name: 'fileId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1',
		description:
			'The document, as File · Upload returned it or as Get Many lists it here. Nibo checks this ID and never checks the schedule it is being attached to, which is why the node asks for the schedule first.',
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
				operation: ['attach', 'delete'],
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
				resource: [SCHEDULE_FILE],
				operation: ['listFiles'],
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
		hint: 'A schedule carries a handful of documents, so this collection is read in a single call and the limit is applied to what came back',
		displayOptions: {
			show: {
				resource: [SCHEDULE_FILE],
				operation: ['listFiles'],
				returnAll: [false],
			},
		},
	},
];
