import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * The documents of one schedule: listing them, putting one there, and taking
 * one away for good.
 *
 * **A resource of its own because the join is one.** A `fileId` and a schedule
 * are two independent things — the same file can hang off several schedules, and
 * it outlives every one of them: a schedule deleted takes its own record away and
 * its attachments answer 200 afterwards, from a storage keyed by something else
 * entirely. What is about the document alone is next door, in File.
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
					'Put a document that is already stored in Nibo onto a schedule, and read the schedule back to confirm it is there',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a file from a schedule',
				description:
					'Delete the document itself, which removes it from every schedule it was attached to',
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
 * as well), the file goes from every schedule it was on, and the stored object
 * stays where it is, so a link given out before still serves the document.
 */
const DELETE_NOTICE =
	'This deletes the document, not the link between it and this schedule: it disappears from every schedule it was attached to, and it cannot be attached again. The stored file itself is not removed — a download link handed out before this still serves the document afterwards.';

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
			'The document, as File · Upload returned it or as Get Many lists it here. Nibo checks this ID and, on Attach, does not check the schedule at all — which is why the node reads the schedule back afterwards instead of trusting the answer.',
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
