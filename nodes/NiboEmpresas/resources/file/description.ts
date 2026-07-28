import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * A document in Nibo's storage, on its own — before it belongs to anything.
 *
 * **The split is the API's, not a taste of ours.** `POST /files` stores a
 * document and hands back a `fileId` that belongs to nothing yet; attaching it
 * is a second call, on a second route, that needs a schedule. And the two are
 * genuinely independent: the same `fileId` can be attached to several schedules,
 * attaching does not consume it, and the document outlives the schedule it was
 * attached to. So what is about the file lives here, and what needs a schedule
 * lives in Schedule - File.
 *
 * **What has no operation here, and why:** there is no Get and no Get Many.
 * `GET /files` and `GET /files/{id}` are both 404, measured on 2026-07-28 —
 * there is no way to list the documents of an organization, and a file that was
 * uploaded and never attached cannot be found again by any route this API has.
 * Delete exists, but it is not here: see Schedule - File, and the reason there.
 */
const FILE = 'file';

/**
 * No family word, for the same reason as Category and Bank Transfer: a prefix
 * gathers a family of several, and this is one resource. It lands between Cost
 * Center and the Schedule family on the alphabetical menu.
 */
export const fileResources: INodePropertyOptions[] = [
	{
		name: 'File',
		value: FILE,
		description: 'A document stored in Nibo, before and after it belongs to a schedule',
	},
];

/** Alphabetical by name, which is what the n8n linter requires */
export const fileOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: [FILE],
			},
		},
		options: [
			{
				name: 'Download',
				value: 'download',
				action: 'Download a file',
				description: 'Fetch a stored document back, into the binary field of the item',
			},
			{
				name: 'Upload',
				value: 'upload',
				action: 'Upload a file',
				description:
					'Store a document in Nibo and get its ID back, without attaching it to anything yet',
			},
		],
		default: 'upload',
	},
];

/**
 * Said once, at the moment somebody decides to put a client's document there,
 * and repeated in the README.
 *
 * Measured on 2026-07-28 with a bare `curl`: the `url` this API publishes for
 * every attachment answers 302 to a signed Azure link and hands the document
 * over with no header, no cookie and no token at all. That is a fact about the
 * service, not a defect this node can fix, and hiding it would not make the link
 * any more private than it is.
 */
const PUBLIC_LINK_NOTICE =
	'Whoever has the ID of a file stored here can download the document with no token: the link Nibo publishes for it is public. Do not upload anything that may not be read by someone holding the link.';

export const fileFields: INodeProperties[] = [
	{
		displayName: PUBLIC_LINK_NOTICE,
		name: 'uploadNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: [FILE],
				operation: ['upload'],
			},
		},
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryProperty',
		type: 'string',
		required: true,
		default: 'data',
		description:
			'The binary field of the incoming item holding the document. The file never comes from disk — it is whatever the previous node put on the item, which is what a node in the n8n verification programme is allowed to read.',
		displayOptions: {
			show: {
				resource: [FILE],
				operation: ['upload'],
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
			'The ID Upload returned, or the fileId of an attachment as Schedule - File lists it. There is no route that lists the files of an organization, so an ID that was never written down cannot be found again.',
		displayOptions: {
			show: {
				resource: [FILE],
				operation: ['download'],
			},
		},
	},
	{
		displayName: 'Put Output File in Field',
		name: 'outputBinaryProperty',
		type: 'string',
		required: true,
		default: 'data',
		description: 'The binary field of the outgoing item the document is placed in',
		displayOptions: {
			show: {
				resource: [FILE],
				operation: ['download'],
			},
		},
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: '',
		placeholder: 'invoice-2026-07.pdf',
		description:
			'What the document is called: the name Nibo files it under when uploading, and the name the binary field gets when downloading. Left empty, the name the file already carries is used.',
		displayOptions: {
			show: {
				resource: [FILE],
				operation: ['download', 'upload'],
			},
		},
	},
];
