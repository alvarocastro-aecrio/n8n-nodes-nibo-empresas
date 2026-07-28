import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, requestInterval } from '../shared/options';
import { collectionFilterFieldTypes } from './description';

/**
 * The only routes of this API carrying a prefix of their own. Nothing about them
 * is unauthenticated — the token is still required — and the word is simply part
 * of the path.
 */
const COLLECTIONS = '/public/collections';

/**
 * The paging key, and the sixth this node has had to learn. `collectionId` is
 * what anybody would try first, by analogy with `scheduleId`, `costCenterId` and
 * `entryId`, and it answers HTTP 500 *"Could not find a property named
 * 'collectionId'"*. It is `id`.
 *
 * `$skip` without an `$orderby` is a 500 on this collection too. The transport
 * always sends the key, so that mine is never stepped on.
 */
const COLLECTION_ORDER_BY = 'id';

/**
 * The charges of the organization.
 *
 * The record is eighteen fields and five of them could not have been guessed —
 * `debtor`, `beneficiary`, `createUser`, `deliveryStatus` and
 * `accountantIntegrationStatus`. They are handed back exactly as they came: this
 * node has never renamed a field of this API, and a charge is read far more
 * often than it is issued.
 */
export async function executeCollection(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'collection') {
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
					COLLECTIONS,
					COLLECTION_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, collectionFilterFieldTypes),
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
