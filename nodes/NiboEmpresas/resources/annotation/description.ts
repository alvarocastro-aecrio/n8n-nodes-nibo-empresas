import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * A note written on a schedule — and the only capacity this project has met that
 * genuinely goes one way.
 *
 * Gotcha 14 of this project says a 404 proves the absence of a path and never
 * the absence of a capacity, and it was earned: the writing family of categories
 * was found alive behind four 404s. So this one was hunted the same way on
 * 2026-07-28, and this time the answer really is no. `POST` answers **200 with a
 * bare `annotationId`**, and that ID opens nothing: ten paths tried for reading,
 * editing and deleting, ten 404s, and the schedule record carries no annotation
 * among its 28 fields.
 *
 * What follows from that shapes the whole resource:
 *
 * - **Create is the only operation**, because it is the only one there is.
 * - **The schedule is checked before the write**, because afterwards nothing can
 *   be checked at all. This API accepts an annotation on a schedule ID that does
 *   not exist with 200 and an ID — a note written into nowhere, permanently.
 * - **It duplicates.** The same text twice answers two different IDs, and there
 *   is no reading to compare against and no delete to undo with.
 */
const ANNOTATION = 'annotation';

/**
 * The family word, as with Schedule - File: an annotation exists only on a
 * schedule — `GET /payments/{id}/annotations` is a 404, and there is no
 * annotation route on any other collection — so this belongs on the menu where
 * somebody would look for it, next to the schedules, rather than alphabetically
 * first and on its own.
 */
export const annotationResources: INodePropertyOptions[] = [
	{
		name: 'Schedule - Annotation',
		value: ANNOTATION,
		description: 'A note written on a schedule, which this API can write but never read back',
	},
];

export const annotationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [ANNOTATION],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create an annotation on a schedule',
				description:
					'Write a note on a schedule, after checking that the schedule exists — which is the only moment it can be checked',
			},
		],
		default: 'create',
	},
];

/**
 * The notice that has to carry two facts at once, because neither is guessable
 * and both change how the operation is used.
 */
const CREATE_NOTICE =
	'An annotation cannot be read back, edited or deleted: this API only writes them, and the ID it returns opens nothing. It also does not deduplicate — running the same item again writes the note a second time, and there is no way to remove either copy. Whether an item is processed twice is entirely up to the workflow around this node.';

export const annotationFields: INodeProperties[] = [
	{
		displayName: CREATE_NOTICE,
		name: 'createNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [ANNOTATION],
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
		placeholder: 'b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90',
		description:
			'The schedule the note is written on, credit or debit alike — one route serves both, and it is the credit one. The node reads the schedule before writing: this API accepts an annotation on a schedule that does not exist, answering 200 with an ID, and such a note can never be found again.',
		displayOptions: {
			show: {
				resource: [ANNOTATION],
			},
		},
	},
	{
		displayName: 'Text',
		name: 'body',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		required: true,
		default: '',
		description:
			'What the note says. Accents and URLs go through untouched. An empty text is refused here rather than by the API, which answers it with HTTP 500 "Informe uma anotação.".',
		displayOptions: {
			show: {
				resource: [ANNOTATION],
				operation: ['create'],
			},
		},
	},
];
