import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboReadBack } from '../../transport/save';
import { onlyTheDay } from '../schedule/normalize';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { transactionFilterFieldTypes } from './description';

interface ITransactionCollection {
	/** Where this kind is listed */
	endpoint: string;
	/** How an error message names one of them */
	noun: string;
	/** The segment the settlement route carries */
	kind: string;
	/** What the API answers in `type` for the schedule this settles */
	scheduleType: string;
	/** How an error message names the schedule this settles */
	schedule: string;
}

/**
 * One handler for the two kinds of settled entry — the API gives them the same
 * contract, exactly as it does the two schedules and the four stakeholders.
 * They cost this table and no logic at all.
 */
const TRANSACTIONS: Record<string, ITransactionCollection> = {
	payment: {
		endpoint: '/payments',
		noun: 'payment',
		kind: 'debit',
		scheduleType: 'debit',
		schedule: 'debit schedule',
	},
	receipt: {
		endpoint: '/receipts',
		noun: 'receipt',
		kind: 'credit',
		scheduleType: 'credit',
		schedule: 'credit schedule',
	},
};

/**
 * Where a schedule is read by ID — both kinds, always this one.
 *
 * `GET /schedules/credit/{id}` takes an ID of either kind and answers what that
 * ID actually is, `type` included; `/schedules/debit/{id}` is a 404 as a route.
 * The settlement uses it to find out what it is about to settle.
 */
const READ_SCHEDULE_BY_ID = '/schedules/credit';

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
			} else if (operation === 'settle') {
				returnData.push({
					json: await settle.call(this, i, collection),
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

/**
 * Settles a schedule that already exists — the operation this version was built
 * for, and the hole 0.9.x left: the node could create a schedule and had no way
 * to mark it paid.
 *
 * Three calls, and each one earns its place.
 *
 * **First a read.** `POST /schedules/credit/{id}/receipts` on a **debit**
 * schedule answers 200 — measured on 2026-07-27 — and files the money on the
 * wrong side of the cash book without a word. The API has no guard, so the node
 * reads the schedule through the get-by-id both kinds share and refuses the
 * mismatch. It is the same trap 0.6.0 found on the Get of a schedule, except
 * there the cost was reading the wrong record and here it is **writing** one.
 *
 * **Then the settlement**, whose body is three fields and whose answer is a bare
 * `entryId` — not the `scheduleId` the one-shot creation answers. Two keys on
 * the two ends of one family.
 *
 * **Then a read-back that tolerates the lag**, because this collection takes a
 * few seconds to show what was just written. If it never appears, the sentence
 * has to be exactly right: the settlement **happened**. Telling a workflow it
 * failed is what makes it settle the same schedule twice.
 */
async function settle(
	this: IExecuteFunctions,
	itemIndex: number,
	collection: ITransactionCollection,
): Promise<IDataObject> {
	const scheduleId = recordId.call(this, 'scheduleId', itemIndex);

	// Refused before anything is sent. Without it the API answers HTTP 500
	// "Conta bancária não encontrada." — a sentence about a thing the form never
	// mentioned, if the field was simply left blank.
	const accountId = String(this.getNodeParameter('accountId', itemIndex, '') ?? '').trim();
	if (accountId === '') {
		throw new NodeOperationError(this.getNode(), 'This settlement names no bank account', {
			itemIndex,
			description:
				'Every settlement has to say which account the money moved through: the API refuses one without it. Pick an account in the Bank Account field, or put an ID there — usually an expression reading it from the incoming item. Read the IDs of an organization with the Bank Account resource. An organization with no account at all cannot settle anything until one exists in Nibo.',
		});
	}

	const schedule = await niboApiRequest.call(
		this,
		itemIndex,
		'GET',
		`${READ_SCHEDULE_BY_ID}/${encodeURIComponent(scheduleId)}`,
	);
	ofThisKind.call(this, schedule, collection, scheduleId, itemIndex);

	const answer = await niboApiRequest.call(
		this,
		itemIndex,
		'POST',
		`/schedules/${collection.kind}/${encodeURIComponent(scheduleId)}/${collection.endpoint.slice(1)}`,
		{},
		{
			accountId,
			// The day that was chosen is the day that travels — cut rather than
			// converted, because the editor hands over the moment with its offset.
			date: onlyTheDay(String(this.getNodeParameter('date', itemIndex) ?? '')),
			value: this.getNodeParameter('value', itemIndex) as number,
		},
	);

	const entryId = typeof answer === 'string' ? answer.trim() : String((answer as IDataObject)?.data ?? '').trim();
	if (entryId === '') {
		throw new NodeOperationError(this.getNode(), 'Nibo did not say what it settled', {
			itemIndex,
			description: `The ${collection.schedule} may or may not have been settled: the API answered with a body this node could not read as an ID. Check the schedule in Nibo before sending it again — settling it twice would record the money twice.`,
		});
	}

	const record = await niboReadBack.call(
		this,
		itemIndex,
		collection.endpoint,
		TRANSACTION_ORDER_BY,
		`entryId eq ${entryId}`,
	);

	if (record === undefined) {
		// The wording is the whole point of this branch. The write went through —
		// the API answered with the ID of what it created. What failed is only the
		// reading back, on a collection measured to take a few seconds to catch up.
		throw new NodeOperationError(
			this.getNode(),
			`The ${collection.schedule} was settled, but the entry could not be read back`,
			{
				itemIndex,
				description: `Nibo answered the settlement with the ID "${entryId}", so it did go through — this collection is eventually consistent and had not caught up after several tries. **Do not send it again**: settling twice records the money twice. Read the entry with the ${collection.noun} resource, filtering by that ID.`,
			},
		);
	}

	return record;
}

/**
 * Refuses a schedule of the other kind, which this API happily accepts.
 *
 * A record that does not say what it is cannot be refused for being the wrong
 * thing: guessing would break settlements that work.
 */
function ofThisKind(
	this: IExecuteFunctions,
	value: unknown,
	collection: ITransactionCollection,
	id: string,
	itemIndex: number,
): void {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new NodeOperationError(this.getNode(), `Nibo returned no schedule for the ID "${id}"`, {
			itemIndex,
			description: 'Nothing was settled: without the schedule there is nothing to settle.',
		});
	}

	const type = String((value as IDataObject).type ?? '')
		.trim()
		.toLowerCase();

	if (type !== '' && type !== collection.scheduleType) {
		throw new NodeOperationError(
			this.getNode(),
			`The ID "${id}" is a ${type} schedule, and this resource settles a ${collection.schedule}`,
			{
				itemIndex,
				description: `Nothing was written. This API accepts a settlement through either route and does not check: sending it would have recorded the money on the wrong side of the cash book, with a 200 and no warning. Switch the resource, or check where the ID came from.`,
			},
		);
	}
}
