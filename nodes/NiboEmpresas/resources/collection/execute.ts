import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { onlyTheDay } from '../schedule/normalize';
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
			} else if (operation === 'create') {
				returnData.push({
					json: await issueCollection.call(this, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'cancel') {
				returnData.push({
					json: await cancelCollection.call(this, i),
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

/**
 * The charge that stands on a schedule right now, if there is one.
 *
 * Cancelled ones do not count, and that is deliberate. Measured: a second charge
 * on a schedule that already carries a live one is refused with HTTP 500 *"Não é
 * possível criar mais de uma cobrança por agendamento"*. Whether the API allows
 * one after the first was **cancelled** was never measured — so the node does
 * not guess in either direction: it stays quiet and lets the API answer.
 */
const CANCELLED = -1;

async function standingCharge(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
): Promise<IDataObject | undefined> {
	const { records } = await niboListRequest.call(this, itemIndex, COLLECTIONS, COLLECTION_ORDER_BY, {
		returnAll: true,
		limit: 0,
		filter: `scheduleId eq ${scheduleId}`,
		// A schedule carries at most one charge, so there is nothing to page and
		// nothing for the incomplete-scan check to compare against.
		failOnIncomplete: false,
	});

	return records.find((record) => (record.status as IDataObject | undefined)?.code !== CANCELLED);
}

/**
 * Issues a charge from a receivable.
 *
 * **What the node refuses first** is the one refusal the API already makes, said
 * earlier and in English, naming the charge that is in the way — because the
 * next decision is whether to cancel that one, and its ID is what that needs.
 *
 * **What the node does not promise** is that anything was sent. The two delivery
 * choices produce an identical record — both born *Ativação pendente*, both *Não
 * entregue*, measured immediately and four seconds later — so a re-read cannot
 * tell them apart, and neither can this handler.
 *
 * **Why it reads back anyway:** the `url`. A charge nobody can link to is a
 * charge nobody can send, and the creation answers a bare GUID and nothing else.
 * That reading is enrichment rather than confirmation, so when it comes back
 * empty the operation still succeeds — failing it would tell a workflow to try
 * again, and trying again issues a second charge.
 */
async function issueCollection(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const scheduleId = recordId.call(this, 'scheduleId', itemIndex);
	const existing = await standingCharge.call(this, itemIndex, scheduleId);

	if (existing !== undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`The schedule ${scheduleId} already carries the charge ${String(existing.id ?? '')}`,
			{
				itemIndex,
				description:
					'Nothing was sent. This API allows one charge per schedule and refuses the second with "Não é possível criar mais de uma cobrança por agendamento". Cancel the existing one with Collection - Cancel and issue again, or leave it as it is — its ID is in the message above, and Collection - Get reads it.',
			},
		);
	}

	const body: IDataObject = {
		// Three keys in PascalCase and one not, which is the API's own spelling
		// rather than a slip here: the creation of a charge is the one body of
		// this API written that way.
		ScheduleId: scheduleId,
		DueDate: onlyTheDay(String(this.getNodeParameter('dueDate', itemIndex, '') ?? '')),
		CollectionProfileId: String(
			this.getNodeParameter('collectionProfileId', itemIndex, '') ?? '',
		).trim(),
		deliveryType: Number(this.getNodeParameter('deliveryType', itemIndex, 1)),
	};

	const answer = await niboApiRequest.call(this, itemIndex, 'POST', COLLECTIONS, {}, body);
	const collectionId = createdId(answer);

	const issued = await niboListRequest.call(this, itemIndex, COLLECTIONS, COLLECTION_ORDER_BY, {
		returnAll: false,
		limit: 1,
		filter: `id eq ${collectionId}`,
		failOnIncomplete: false,
	});

	return issued.records[0] ?? { collectionId, scheduleId, issued: true };
}

/**
 * The ID out of a creation answer — a GUID that arrives as a JSON string, so it
 * comes back from the helper already unquoted. The `{data: …}` shape is the
 * rearguard, as everywhere else in this package.
 */
function createdId(answer: unknown): string {
	if (typeof answer === 'string') {
		return answer.trim();
	}

	const data = (answer as IDataObject)?.data;

	return typeof data === 'string' ? data.trim() : '';
}

/**
 * Cancels a charge, through the route that had to be hunted for.
 *
 * This project's catalogue listed `DELETE /public/collections/{id}` and had
 * never validated it. **It does not exist** — 404 *"Resource not found"*. The
 * real one turned up on 2026-07-28 among ten attempts: nine answered 404, which
 * talks about the route, and one answered 500 *"A cobrança não pode ser
 * cancelada"*, which talks about the charge. A business error only exists where
 * there is a route to produce it — the same reasoning that found the transfer
 * collection in 0.11.0.
 *
 * The read-back stays here, unlike on the creation, because here it confirms
 * something that really changes: the status goes to `-1`. Cancelling does **not**
 * remove the record.
 */
async function cancelCollection(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = recordId.call(this, 'collectionId', itemIndex);

	await niboApiRequest.call(
		this,
		itemIndex,
		'POST',
		`${COLLECTIONS}/${encodeURIComponent(id)}/cancel`,
		{},
		{},
	);

	const { records } = await niboListRequest.call(this, itemIndex, COLLECTIONS, COLLECTION_ORDER_BY, {
		returnAll: false,
		limit: 1,
		filter: `id eq ${id}`,
		failOnIncomplete: false,
	});

	const after = records[0];
	if (after === undefined) {
		// Measured: cancelling leaves the record in place. A charge that is gone is
		// something this project has not seen, and saying so beats inventing a
		// confirmation of a state nobody read.
		return { collectionId: id, cancelled: true };
	}

	const code = (after.status as IDataObject | undefined)?.code;
	if (code !== CANCELLED) {
		throw new NodeOperationError(
			this.getNode(),
			`Nibo accepted the cancellation, but the charge ${id} is still ${String((after.status as IDataObject | undefined)?.description ?? code)}`,
			{
				itemIndex,
				description:
					'The API answered the cancellation with HTTP 204 and the charge did not change, which is not something this project has measured. Read it with Collection - Get before trying again — a charge that was already paid, for one, is not something a cancellation takes back.',
			},
		);
	}

	return after;
}
