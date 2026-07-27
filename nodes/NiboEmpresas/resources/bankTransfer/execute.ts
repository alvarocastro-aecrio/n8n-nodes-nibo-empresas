import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { bankTransferFilterFieldTypes } from './description';

/**
 * The collection, the creation and the delete all live on this one path — and
 * two of the three are in no documentation anywhere. See the resource
 * description for how they were found.
 */
const TRANSFERS = '/accounts/transfer';

/**
 * The paging key, and the fifth this node has had to learn: the stakeholders
 * page by `id`, the schedules by `scheduleId`, the cost centres by
 * `costCenterId`, the settled entries by `entryId`, and here it is `id` again.
 *
 * Not by luck: a transfer has **three** top-level fields, and `id` is the only
 * one of them that could ever be a sort key. `date`, `value`, `createDate`,
 * `transferId` and `originEntryId` all answer HTTP 500 — they live one or two
 * levels down. Measured on 2026-07-27.
 *
 * And `$skip` without an `$orderby` is a 500 on this collection too, exactly as
 * on the balance view. The transport always sends the key, so neither mine is
 * ever stepped on.
 */
const TRANSFER_ORDER_BY = 'id';

/**
 * The transfers: reading them, and undoing one.
 *
 * No normalizer, and one asymmetry deliberately left alone: the origin entry of
 * a transfer carries the amount **negative** and the destination carries it
 * positive — while `/payments`, listing that very same origin entry, carries it
 * positive. The same entry, two routes, two signs. This node forwards what the
 * API answered; a fourth convention invented here would be one more thing that
 * disagrees with Nibo's own screen.
 */
export async function executeBankTransfer(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'bankTransfer') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation === 'list') {
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

				const { records, warning } = await niboListRequest.call(
					this,
					i,
					TRANSFERS,
					TRANSFER_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, bankTransferFilterFieldTypes),
						failOnIncomplete: failOnIncomplete.call(this, i, options),
						interval,
					},
				);

				records.forEach((record, index) => {
					// A result that may be incomplete says so on its last item, so a
					// workflow reading only the data still sees it.
					const json =
						warning !== undefined && index === records.length - 1
							? { ...record, _niboPaginationWarning: warning }
							: record;

					returnData.push({ json, pairedItem: { item: i } });
				});
			} else if (operation === 'delete') {
				const id = recordId.call(this, 'transferId', i);

				await niboApiRequest.call(
					this,
					i,
					'DELETE',
					`${TRANSFERS}/${encodeURIComponent(id)}`,
				);

				// The API answers 204 with no body, so the confirmation is built here —
				// and unlike the delete of a settled entry, there is no second thing to
				// name. That one reopened the schedule it had settled; this one really
				// removes the record of this screen, and the two entries underneath it
				// go with it.
				returnData.push({ json: { id, deleted: true }, pairedItem: { item: i } });
			} else {
				// There is no Get and no Update: nothing reads one transfer on its own,
				// and no route edits one. Undoing it and making another is the operation
				// this API has.
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
