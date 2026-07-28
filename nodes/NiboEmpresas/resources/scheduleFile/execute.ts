import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboApiRequest } from '../../transport/request';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';

/**
 * The one route family, and it is spelled "credit" for debit schedules too.
 * `/schedules/debit/{id}/files` is a 404 whatever the ID — the same universality
 * as `GET /schedules/credit/{id}`, which is asymmetry 11 of this project's API
 * contract.
 */
function scheduleFiles(scheduleId: string): string {
	return `/schedules/credit/${encodeURIComponent(scheduleId)}/files`;
}

/**
 * The whole collection in one request.
 *
 * Every page of this API is capped at 500 silently, and a schedule carries
 * documents by the unit — so this is the ceiling rather than a page size, and
 * asking for it is how the reading says "all of it".
 */
const EVERYTHING = 500;

/**
 * How long the read-back keeps asking after an attach. Insurance rather than the
 * expected path: the listing was measured to show the attachment on the first
 * try, immediately. It exists because the alternative is telling somebody their
 * schedule does not exist when what happened was a moment of lag.
 */
const READ_BACK_WAITS = [500, 1000];

interface IFileListEnvelope {
	items?: IDataObject[];
	count?: number;
}

/**
 * The documents of a schedule: reading them, putting one there, and deleting one
 * for good.
 *
 * Two of the three operations exist because of the same measurement, made on
 * 2026-07-28: **this API validates the file and never validates the schedule.**
 * An attach to a schedule ID that does not exist answers 204 and writes nothing,
 * and the listing of a schedule that does not exist answers 200 with an empty
 * collection — so "there are no files here" and "there is no such schedule" are
 * the same sentence. The node cannot ask the difference, so it attaches and then
 * goes to look.
 */
export async function executeScheduleFile(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'scheduleFile') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			const scheduleId = recordId.call(this, 'scheduleId', i);

			if (operation === 'listFiles') {
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
				const { records, warning } = await listFiles.call(this, i, scheduleId, {
					returnAll,
					limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
					failOnIncomplete: failOnIncomplete.call(this, i, options),
				});

				records.forEach((record, index) => {
					// A result that may be incomplete says so on its last item, so a
					// workflow reading only the data still sees it.
					const json =
						warning !== undefined && index === records.length - 1
							? { ...record, _niboPaginationWarning: warning }
							: record;

					returnData.push({ json, pairedItem: { item: i } });
				});
			} else if (operation === 'attach') {
				returnData.push({
					json: await attachFile.call(this, i, scheduleId),
					pairedItem: { item: i },
				});
			} else if (operation === 'delete') {
				const fileId = recordId.call(this, 'fileId', i);

				await niboApiRequest.call(
					this,
					i,
					'DELETE',
					`${scheduleFiles(scheduleId)}/${encodeURIComponent(fileId)}`,
				);

				// The API answers 204 with no body, so the confirmation is built here.
				// What it confirms is deliberately narrow: the document is gone from
				// everywhere, and the notice on the screen is where that is said.
				returnData.push({
					json: { scheduleId, fileId, deleted: true },
					pairedItem: { item: i },
				});
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
					json: { error: (error as Error).message },
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

interface IListOptions {
	returnAll: boolean;
	limit: number;
	failOnIncomplete: boolean;
}

/**
 * The attachments of one schedule, read in a single call.
 *
 * **Not paged, and that is decision 4 of the plan rather than a shortcut.**
 * `$orderby` on this collection answers 200 and was never shown to actually
 * order anything, and a paging key that does not order reads one record twice
 * and loses another with no error at all — measured on
 * `/schedules/categories/groups` in 0.9.0 and remembered ever since. A schedule
 * carries documents by the unit, so the choice costs nothing: ask for the lot,
 * apply the limit here, and let the `count` of the envelope say whether anything
 * was left behind.
 */
async function listFiles(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
	options: IListOptions,
): Promise<{ records: IDataObject[]; warning?: string }> {
	const response = (await niboApiRequest.call(this, itemIndex, 'GET', scheduleFiles(scheduleId), {
		$top: EVERYTHING,
	})) as IFileListEnvelope;

	const records = response.items ?? [];
	const count = response.count;

	const warning =
		count !== undefined && records.length < count
			? `Nibo reported ${count} files on this schedule but only ${records.length} arrived, so this result is incomplete.`
			: undefined;

	if (warning !== undefined) {
		if (options.failOnIncomplete) {
			throw new NodeOperationError(this.getNode(), warning, { itemIndex });
		}
		this.logger.warn(warning);
	}

	return {
		records: options.returnAll ? records : records.slice(0, Math.max(options.limit, 0)),
		warning,
	};
}

/**
 * Puts a stored document on a schedule, and then goes and checks.
 *
 * The check is the operation. `POST …/files/attach` answers **204 for a schedule
 * that does not exist**, without a word — this API validates the `fileId` (an
 * unknown one is a 500 *"Arquivo não encontrado"*) and never validates the
 * schedule. It is the same family as the `200` that writes nothing, and the same
 * answer as the `POST /payments` without an account that 0.10.0 learned to
 * refuse before sending. Here it cannot be refused beforehand: nothing tells a
 * real schedule ID from an invented one until the schedule is read.
 *
 * Attaching twice is not a problem to defend against — the listing stays at one
 * entry, so the API is idempotent here of its own accord. That is worth knowing
 * next to the annotation, which duplicates on every single call.
 */
async function attachFile(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
): Promise<IDataObject> {
	return await attachStoredFile.call(
		this,
		itemIndex,
		scheduleId,
		recordId.call(this, 'fileId', itemIndex),
	);
}

/**
 * The attach and its read-back, with the file already named.
 *
 * Exported because File · Upload and Attach is the same second half: one
 * operation, two calls, and the same 204 that means nothing on its own. A
 * confirmation kept in two copies is a confirmation that will one day disagree
 * with itself about what counts as attached.
 */
export async function attachStoredFile(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
	fileId: string,
): Promise<IDataObject> {
	await niboApiRequest.call(
		this,
		itemIndex,
		'POST',
		`${scheduleFiles(scheduleId)}/attach`,
		{},
		// An array, which is the body this route takes, and the reason the
		// transport hands the helper a JS value rather than a string it built.
		[fileId] as unknown as IDataObject,
	);

	for (let attempt = 0; attempt <= READ_BACK_WAITS.length; attempt++) {
		if (attempt > 0) {
			await sleep(READ_BACK_WAITS[attempt - 1]);
		}

		const { records } = await listFiles.call(this, itemIndex, scheduleId, {
			returnAll: true,
			limit: 0,
			// The collection is about to change by design, and a schedule that does
			// not exist answers `count: 0` — comparing here would turn the very case
			// this read-back exists to catch into a different failure.
			failOnIncomplete: false,
		});

		const attached = records.find((record) => record.fileId === fileId);
		if (attached !== undefined) {
			return { scheduleId, ...attached, attached: true };
		}
	}

	throw new NodeOperationError(
		this.getNode(),
		`Nibo accepted the attach, but the file ${fileId} is not on the schedule ${scheduleId}`,
		{
			itemIndex,
			description:
				'Almost certainly the schedule does not exist. This API answers the attach with HTTP 204 whether the schedule is real or not — it checks the file and never checks the schedule — and the listing of a schedule that does not exist answers 200 with nothing in it, so the two cannot be told apart except by looking, which is what just happened. Check the Schedule ID. The file itself is untouched and still stored.',
		},
	);
}
