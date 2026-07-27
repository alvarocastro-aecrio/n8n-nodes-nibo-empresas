import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { transactionFilterFieldTypes } from './description';

interface ITransactionCollection {
	/** Where this kind is listed */
	endpoint: string;
	/** How an error message names one of them */
	noun: string;
}

/**
 * One handler for the two kinds of settled entry — the API gives them the same
 * contract, exactly as it does the two schedules and the four stakeholders.
 * They cost this table and no logic at all.
 */
const TRANSACTIONS: Record<string, ITransactionCollection> = {
	payment: { endpoint: '/payments', noun: 'payment' },
	receipt: { endpoint: '/receipts', noun: 'receipt' },
};

/**
 * The paging key, and the fourth one this node has had to learn.
 *
 * The stakeholders page by `id`, the schedules by `scheduleId`, the cost
 * centres by `costCenterId` — and here `id` answers HTTP 500 (*Could not find a
 * property named 'id'*) and the key is **`entryId`**. Measured on 2026-07-27.
 * `$skip` without an `$orderby` is a 500 here too, so it is always sent.
 */
const TRANSACTION_ORDER_BY = 'entryId';

/**
 * The shape this API's ID columns compare against, and they compare **bare**:
 * `entryId eq '<guid>'` answers 500 — *Found operand types 'Edm.Guid' and
 * 'Edm.String'* — while the same expression unquoted answers 200. Checked here
 * so that a pasted value fails with a sentence about the value rather than with
 * a server error about operand types.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * No normalizer: what the API answers here needs no repairing.
 *
 * One asymmetry is deliberately **not** repaired, and it is worth naming: a
 * payment lists its `value` **positive** where the schedule of the same entry
 * lists it negative. The sign belongs to the endpoint, exactly as it does
 * between Get and Get Many of a schedule, and a node that flipped it would add
 * up differently from the API it wraps.
 */
export async function executeTransaction(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	const collection = TRANSACTIONS[resource];
	if (collection === undefined) {
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
					collection.endpoint,
					TRANSACTION_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, transactionFilterFieldTypes),
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
			} else if (operation === 'get') {
				returnData.push({
					json: await oneEntry.call(
						this,
						i,
						collection,
						recordId.call(this, 'entryId', i),
						interval,
					),
					pairedItem: { item: i },
				});
			} else {
				// Update is the one worth explaining: `PUT /payments/{entryId}` is a
				// 404, measured on 2026-07-27 with the exact body of the production
				// workflow that was supposed to prove it worked. An operation the API
				// has no route for fails here rather than being offered on the screen
				// and discovered at run time.
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

/**
 * One settled entry, read through the list filtered by its ID.
 *
 * There is no get-by-id here at all: `GET /payments/{entryId}` answers 404,
 * measured on 2026-07-27. So this is not a choice between two doors as it was
 * for the categories — it is the only door, and the same one.
 *
 * An empty answer is a 200 with an empty envelope. For the API that is not an
 * error, and for an operation that asked for one record by ID it is exactly
 * what "not found" means.
 */
async function oneEntry(
	this: IExecuteFunctions,
	itemIndex: number,
	collection: ITransactionCollection,
	id: string,
	interval: number,
): Promise<IDataObject> {
	if (!GUID.test(id)) {
		throw new NodeOperationError(this.getNode(), `The entry ID "${id}" is not a GUID`, {
			itemIndex,
			description: `A ${collection.noun} is read by the GUID Nibo returns in its entryId field, such as 2efffcd0-8730-4348-86da-6d9a95be6149. This comparison is made against a GUID column, so anything else answers HTTP 500 with a message about operand types rather than "not found" — which is why the value is refused here instead of sent.`,
		});
	}

	const { records } = await niboListRequest.call(
		this,
		itemIndex,
		collection.endpoint,
		TRANSACTION_ORDER_BY,
		{
			returnAll: false,
			limit: 1,
			// Bare — see the note on GUID above.
			filter: `entryId eq ${id}`,
			// One record cannot be an incomplete scan of a collection.
			failOnIncomplete: false,
			interval,
		},
	);

	if (records.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Nibo returned no ${collection.noun} for the ID "${id}"`,
			{
				itemIndex,
				description: `The ID is a well-formed GUID and no ${collection.noun} of this organization carries it. Two things make that ordinary rather than alarming: an entry ID belongs to one organization, and this collection is eventually consistent — an entry settled a moment ago can take a few seconds to appear here.`,
			},
		);
	}

	return records[0];
}
