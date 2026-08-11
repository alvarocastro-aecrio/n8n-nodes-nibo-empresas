import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import type { INiboUpload } from '../../transport/request';
import { niboDownloadRequest, niboUploadRequest } from '../../transport/request';
import { attachStoredFile } from '../scheduleFile/execute';
import { failedItem } from '../shared/failure';
import { recordId, requestInterval } from '../shared/options';
import { requireSchedule } from '../shared/schedule';

/** The one route that stores a document. There is no `GET` beside it — both `GET /files` and `GET /files/{id}` are 404. */
const FILES = '/files';

/**
 * Where the node stops before the API does.
 *
 * The ceiling is the classic ASP.NET `maxRequestLength`: **10 485 760 bytes of
 * request**, not of file, so the multipart envelope is counted inside it.
 * Measured on 2026-07-28 — 10 MB − 1 KB went through, 10 MB came back as HTTP
 * 500 *"O Nibo se comportou de forma inesperada."*, and 30 MB as a 413 in plain
 * text. None of the three mentions size.
 *
 * A kilobyte of margin covers the envelope with room to spare, and the size is
 * known here: it is the length of a buffer already in hand. Sending a request
 * whose only possible answer is a sentence nobody can act on would be a call
 * made to find out something already known.
 */
const REFUSE_FROM_BYTES = 10_484_736;

/** For the message, since the digits are the whole point of it */
const LIMIT_IN_WORDS = REFUSE_FROM_BYTES.toLocaleString('en-US');

/**
 * The document itself: putting one in, and taking one out.
 *
 * Attaching is next door in Schedule - File, and that is the API's split rather
 * than ours — a `fileId` belongs to nothing until a second call on a second
 * route says it does.
 */
export async function executeFile(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'file') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation === 'upload') {
				returnData.push({
					json: await uploadFile.call(this, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'uploadAndAttach') {
				returnData.push({
					json: await uploadAndAttach.call(this, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'download') {
				returnData.push(await downloadFile.call(this, i));
			} else {
				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" is not supported`,
					{ itemIndex: i },
				);
			}
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: failedItem(error),
					pairedItem: { item: i },
				});
				continue;
			}
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
	}

	return returnData;
}

/**
 * Stores one document and hands back what the API said about it.
 *
 * One file per call, though the endpoint takes several: two parts in one request
 * upload two files and answer with two entries, measured on 2026-07-28. Nobody
 * asked for that, and the idiom of n8n is one binary field per item — whoever
 * has five documents has five items.
 */
async function uploadFile(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const file = await fileFromItem.call(this, itemIndex);
	const response = await niboUploadRequest.call(this, itemIndex, FILES, file);

	return storedFile.call(this, response, itemIndex);
}

/**
 * The pair of calls nobody wants to write by hand, and the reason this is one
 * operation: a document uploaded and left unattached is invisible — there is no
 * route that lists the files of an organization, so it cannot even be found
 * again to be tidied away.
 *
 * **The order matters twice.** The schedule is checked before the upload — not
 * merely read off the form, actually asked of the API — so a schedule that does
 * not exist never strands a document in storage. And if the attaching fails
 * after the upload succeeded, the failure says the file went up and names it:
 * decision 6 of the plan, and the lesson the 0.10.0 settlement paid for, which
 * is that the sentence a half-done operation ends with decides whether the
 * workflow runs it again. Here a second run would store the same document
 * twice.
 */
async function uploadAndAttach(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const scheduleId = recordId.call(this, 'scheduleId', itemIndex);
	await requireSchedule.call(this, itemIndex, scheduleId, 'Nothing was uploaded.');

	const stored = await uploadFile.call(this, itemIndex);
	const fileId = String(stored.fileId ?? '');

	try {
		return { ...stored, ...(await attachStoredFile.call(this, itemIndex, scheduleId, fileId)) };
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`The file went up as ${fileId}, but attaching it to the schedule ${scheduleId} did not work`,
			{
				itemIndex,
				description: `**Do not send it again**: the document is stored, and a second run would store a second copy of it. The schedule was checked before the upload and it does exist, so what failed is the attach itself or the reading that confirms it. Attach ${fileId} with Schedule - File · Attach, or delete it with Schedule - File · Delete — those are the only two ways back to it, because no route of this API lists the files of an organization. Nibo said: ${(error as Error).message}`,
			},
		);
	}
}

/**
 * The document as it leaves the item, refused here rather than at the far end
 * whenever the answer at the far end would be useless.
 */
async function fileFromItem(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INiboUpload> {
	const property = String(
		this.getNodeParameter('binaryProperty', itemIndex, 'data') ?? '',
	).trim();
	const item = this.getInputData()[itemIndex];
	const binary = item.binary?.[property];

	if (binary === undefined) {
		const present = Object.keys(item.binary ?? {});

		throw new NodeOperationError(
			this.getNode(),
			`This item carries no binary field named "${property}"`,
			{
				itemIndex,
				description:
					present.length === 0
						? 'The item has no binary data on it at all. Upload sends what an earlier node put on the item — an HTTP Request with the response set to File, a Read Binary File, a webhook with an upload in it — and never anything from disk.'
						: `The binary fields this item does carry are: ${present.join(', ')}. The name is usually decided by whatever produced the file two nodes ago.`,
			},
		);
	}

	const data = await this.helpers.getBinaryDataBuffer(itemIndex, property);

	if (data.length >= REFUSE_FROM_BYTES) {
		throw new NodeOperationError(
			this.getNode(),
			`This file is ${data.length.toLocaleString('en-US')} bytes, and Nibo refuses anything from ${LIMIT_IN_WORDS} bytes upwards`,
			{
				itemIndex,
				description:
					'Nothing was sent. The API caps the whole request at 10,485,760 bytes — the multipart envelope counts inside it — and its own answer at that size is HTTP 500 "O Nibo se comportou de forma inesperada.", which names neither the size nor the file nor a limit. Send a smaller document, or split it.',
			},
		);
	}

	const typedName = String(this.getNodeParameter('fileName', itemIndex, '') ?? '').trim();

	return {
		// Nibo ignores the field name — a part called `anexo` uploads exactly the
		// same, measured on 2026-07-28. It is `file` because that is what every
		// workflow written by hand until now sends.
		name: 'file',
		fileName: typedName || binary.fileName || fallbackName(binary.fileExtension),
		mimeType: binary.mimeType || 'application/octet-stream',
		data,
	};
}

function fallbackName(extension: string | undefined): string {
	return extension ? `file.${extension}` : 'file';
}

/**
 * The fourth response shape this package has had to learn, after the bare GUID
 * of `POST /accounts`, the `{items, count}` envelope and the plain record: an
 * **array**, one entry per file the request carried.
 */
function storedFile(
	this: IExecuteFunctions,
	response: unknown,
	itemIndex: number,
): IDataObject {
	const stored = Array.isArray(response) ? (response[0] as IDataObject | undefined) : undefined;

	if (stored === undefined) {
		throw new NodeOperationError(this.getNode(), 'Nibo accepted the upload but named no file', {
			itemIndex,
			description:
				'The API answers this route with an array holding one entry per file sent, and this time the array was empty. Without a fileId the document cannot be attached, downloaded or deleted — and there is no route that lists the files of an organization to find it again. Check the Nibo screen before sending it a second time.',
		});
	}

	return stored;
}

/**
 * Fetches a stored document back into the item.
 *
 * The json of the incoming item travels with it untouched, so a download sits in
 * the middle of a chain rather than ending it: whatever named the file — a
 * schedule, a row of a list — is still there next to the bytes.
 */
async function downloadFile(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const fileId = recordId.call(this, 'fileId', itemIndex);
	const property =
		String(this.getNodeParameter('outputBinaryProperty', itemIndex, 'data') ?? '').trim() ||
		'data';
	const typedName = String(this.getNodeParameter('fileName', itemIndex, '') ?? '').trim();

	const file = await fetchFile.call(this, fileId, itemIndex);
	const binary = await this.helpers.prepareBinaryData(
		file.data,
		typedName || file.fileName,
		file.mimeType,
	);

	return {
		json: { ...this.getInputData()[itemIndex].json },
		binary: { [property]: binary },
		pairedItem: { item: itemIndex },
	};
}

/**
 * The call, with the one failure that has a better sentence than the generic
 * one. `GET /files/{id}` on the API is a 404, so nothing can be asked about a
 * file before asking for it — an ID that was mistyped is found out here or not
 * at all.
 */
async function fetchFile(this: IExecuteFunctions, fileId: string, itemIndex: number) {
	try {
		return await niboDownloadRequest.call(this, fileId);
	} catch (error) {
		if ((error as NodeApiError).httpCode !== '404') {
			// Rethrown as an expression rather than as a bare `throw error`, which
			// the official scanner reads as losing the node context.
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex });
		}

		throw new NodeOperationError(
			this.getNode(),
			`Nibo's file service has no document with the ID ${fileId}`,
			{
				itemIndex,
				description:
					'Either the ID is not a file ID, or the file was deleted — Schedule - File · Delete removes the record of a document from every schedule at once. Note that the deletion does not remove the stored object: a link handed out before it keeps working, which is the other half of the same measurement.',
			},
		);
	}
}
