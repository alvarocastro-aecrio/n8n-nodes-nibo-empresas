import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { collectionFilterFieldTypes } from './description';

/**
 * The only routes of this API carrying a prefix of their own. Nothing about them
 * is unauthenticated — the token is still required — and the word is simply part
 * of the path.
 */
const COLLECTIONS = '/public/collections';

/**
 * The profiles, and the only route that answers whether an organization can
 * issue a charge at all. A profile ties a **bank provider** to the company, it
 * is obligatory in the body of a creation, and it comes from nowhere else.
 */
const PROFILES = '/public/collections-profiles';

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
			} else if (operation === 'get') {
				returnData.push({
					json: await oneCollection.call(this, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'listProfiles') {
				for (const profile of await collectionProfiles.call(this, i)) {
					returnData.push({ json: profile, pairedItem: { item: i } });
				}
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

/**
 * One charge, read through the list filtered by its ID.
 *
 * **There is no get-by-id.** `GET /public/collections/{id}` and
 * `GET /collections/{id}` are both 404 — measured on 2026-07-28 — so this is not
 * a preference, it is the only door. Category has read a single record this way
 * since 0.9.0, for a different reason and by the same means.
 */
async function oneCollection(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = recordId.call(this, 'collectionId', itemIndex);

	const { records } = await niboListRequest.call(this, itemIndex, COLLECTIONS, COLLECTION_ORDER_BY, {
		returnAll: false,
		limit: 1,
		// Bare, which is how this API compares an ID column — quoting it answers a
		// 500 about operand types.
		filter: `id eq ${id}`,
		// One record asked for by ID is not a scan, and there is no count to
		// compare against: the check that guards a scan would only add a way to
		// fail here.
		failOnIncomplete: false,
	});

	const found = records[0];
	if (found === undefined) {
		// For the API an empty envelope is not an error — a filter matched nothing.
		// For an operation that asked for one record by ID, it is exactly what
		// "not found" means.
		throw new NodeOperationError(this.getNode(), `Nibo has no collection with the ID ${id}`, {
			itemIndex,
			description:
				'Either the ID is not a collection ID, or it belongs to another organization — in this API the token is the organization. Note that a cancelled charge is still readable: it stays in the collection with its status set to Cancelled, so this is not what a cancellation looks like.',
		});
	}

	return found;
}

/**
 * The collection profiles of the organization.
 *
 * Read whole, with no paging: an organization has one or two of these, and the
 * question they answer is binary. An empty answer is a 200, and it means
 * something specific enough to be worth a sentence — it is how this project
 * found out that its test organization cannot issue charges at all.
 */
async function collectionProfiles(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const response = (await niboApiRequest.call(this, itemIndex, 'GET', PROFILES)) as {
		items?: IDataObject[];
	};
	const profiles = response?.items ?? [];

	if (profiles.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'This organization has no collection profile, so it cannot issue charges',
			{
				itemIndex,
				description:
					'A collection profile ties a bank provider to the organization, and it is what a charge is issued through — the API refuses a creation without one. It is not something this API can create: it is set up in Nibo, with the provider contracted. Until there is one, Collection - Create has nothing to issue with.',
			},
		);
	}

	return profiles;
}
