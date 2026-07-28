import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboApiRequest } from '../../transport/request';
import { recordId, requestInterval } from '../shared/options';
import { requireSchedule, schedulePath } from '../shared/schedule';

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

	await requireSchedule.call(this, itemIndex, scheduleId, 'Nothing was written.');

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
