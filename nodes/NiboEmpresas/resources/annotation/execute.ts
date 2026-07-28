import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboApiRequest } from '../../transport/request';
import { recordId, requestInterval } from '../shared/options';

/**
 * One route for both kinds of schedule, spelled "credit" — the same universality
 * as the get-by-id and as the attachments. `/schedules/debit/{id}/annotations`
 * is a 404 whatever the ID.
 */
function schedulePath(scheduleId: string): string {
	return `/schedules/credit/${encodeURIComponent(scheduleId)}`;
}

/**
 * The two answers on the check that are about the caller rather than about the
 * schedule. A rejected token and a rate limit have to keep their own sentence:
 * reading either as "there is no such schedule" would send somebody looking for
 * a record that is exactly where they left it.
 */
const NOT_ABOUT_THE_SCHEDULE = ['401', '429'];

/**
 * Writing a note on a schedule.
 *
 * **The check before the write is the operation.** Everywhere else in this node
 * a doubtful write is confirmed afterwards — the transfer is read back, the
 * attachment is read back. Here there is no afterwards: the `annotationId` this
 * API answers with opens no door (ten paths tried on 2026-07-28, ten 404s), the
 * schedule record carries no annotation on it, and an annotation written onto a
 * schedule ID that does not exist is accepted with 200 and is then unreachable
 * for good. One extra call per item is what that costs, and it buys the only
 * moment at which anything can be checked at all.
 */
export async function executeAnnotation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'annotation') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation === 'create') {
				returnData.push({
					json: await createAnnotation.call(this, i),
					pairedItem: { item: i },
				});
			} else {
				// Create is the only operation because it is the only one this API
				// has: reading, editing and deleting an annotation are all 404.
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

async function createAnnotation(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const scheduleId = recordId.call(this, 'scheduleId', itemIndex);
	const body = String(this.getNodeParameter('body', itemIndex, '') ?? '').trim();

	if (body === '') {
		throw new NodeOperationError(this.getNode(), 'This annotation has no text', {
			itemIndex,
			description:
				'Nothing was sent. An empty annotation is refused by the API too — HTTP 500 "Informe uma anotação." — so this is the same answer without the round trip. An annotation is only ever text: there is no field on it to leave blank on purpose.',
		});
	}

	await requireSchedule.call(this, itemIndex, scheduleId);

	const answer = await niboApiRequest.call(
		this,
		itemIndex,
		'POST',
		`${schedulePath(scheduleId)}/annotations`,
		{},
		{ body },
	);

	return { scheduleId, annotationId: annotationIdOf(answer), body };
}

/**
 * The check, and the one place in this node where a failed read is turned into a
 * refusal to write.
 *
 * A schedule that is not there answers **HTTP 500** rather than 404 — measured
 * on 2026-07-28, after deleting a probe schedule and reading it again — so the
 * status alone cannot be trusted to mean "missing". What can be trusted is the
 * other direction: a 401 and a 429 are about the caller, never about the
 * schedule, and they keep their own sentence.
 */
async function requireSchedule(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
): Promise<void> {
	try {
		await niboApiRequest.call(this, itemIndex, 'GET', schedulePath(scheduleId));
	} catch (error) {
		const httpCode = (error as NodeApiError).httpCode ?? '';

		if (NOT_ABOUT_THE_SCHEDULE.includes(httpCode)) {
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex });
		}

		throw new NodeOperationError(
			this.getNode(),
			`Nibo has no schedule with the ID ${scheduleId}`,
			{
				itemIndex,
				description: `**Nothing was written.** The node reads the schedule before writing because an annotation cannot be checked afterwards: this API accepts one on a schedule that does not exist, answers 200 with an ID, and that note can never be read, edited or deleted by anybody. A schedule that is gone answers this read with HTTP 500 rather than 404, which is why the sentence below is a server one. Nibo said: ${(error as Error).message}`,
			},
		);
	}
}

/**
 * A bare GUID, as `POST /schedules/categories` and `POST /accounts` answer — no
 * envelope, and not even quotes of its own once the JSON is parsed. The
 * `{data: …}` shape is the rearguard: it is how some other collections of this
 * API answer, and nothing should fail over which of the two arrived.
 */
function annotationIdOf(answer: unknown): string {
	if (typeof answer === 'string') {
		return answer.trim();
	}

	const data = (answer as IDataObject)?.data;

	return typeof data === 'string' ? data.trim() : '';
}
