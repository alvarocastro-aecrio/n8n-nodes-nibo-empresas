import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, requestInterval } from '../shared/options';
import { bankAccountFilterFieldTypes } from './description';

const ACCOUNTS = '/accounts';

/**
 * The paging key — and this collection is the one that does it the ordinary
 * way, which is exactly why it needs saying.
 *
 * Its neighbours in this version do not: `/costcenters` pages by
 * `costCenterId`, `/payments` and `/receipts` by `entryId`, and `id` answers
 * HTTP 500 on all three. Here it is the mirror image — `$orderby=id` answers
 * 200 and `$orderby=accountId` is the 500. Measured on 2026-07-27. Four
 * collections, three different keys: this is why the transport takes the key as
 * a parameter instead of assuming one.
 */
const ACCOUNT_ORDER_BY = 'id';

/**
 * The bank accounts, read only.
 *
 * No normalizer: what the API answers needs no repairing. The record is wide —
 * two dozen fields about automation, reconciliation and Open Finance — and every
 * one of them travels as it came, because none of them is this node's business.
 */
export async function executeBankAccount(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'bankAccount') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation !== 'list') {
				// There is no Get to offer: `GET /accounts/{id}` is a 404. Creating,
				// editing and transferring belong to the Account slice still ahead on
				// the roadmap, and a menu entry with nothing behind it is the bug
				// 0.3.1 was about.
				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" is not supported`,
					{ itemIndex: i },
				);
			}

			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

			const { records, warning } = await niboListRequest.call(
				this,
				i,
				ACCOUNTS,
				ACCOUNT_ORDER_BY,
				{
					returnAll,
					limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
					filter: listFilter.call(this, i, options, bankAccountFilterFieldTypes),
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
