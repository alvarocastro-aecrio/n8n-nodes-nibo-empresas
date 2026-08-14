import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboReadBack } from '../../transport/save';
import { onlyTheDay } from '../schedule/normalize';
import { failedItem } from '../shared/failure';
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
 * Every settled entry, minus the transfers this collection also carries.
 *
 * A transfer between two accounts of the organization answers on this same
 * collection, flagged `isTransfer: true` — reported by Alvaro on 2026-08-14
 * against a live `/payments` scan, where entries like that carried no
 * `scheduleId`, no `stakeholder` and no `category`: nothing this resource's own
 * description promises a payment or a receipt has. It is the origin or
 * destination leg a Bank Transfer writes, and it cannot even be removed from
 * here — Delete on this resource takes a `scheduleId`, which a transfer has
 * none of, and its own ID belongs to the Bank Transfer resource instead. So it
 * never belonged in this list, and every read here excludes it before anything
 * the caller asked for is applied.
 *
 * ANDed onto whatever filter the caller already built, parenthesized so an
 * "or" between the caller's own conditions is not pulled apart by it — the
 * same grouping the raw `Filter (OData)` escape hatch already assumes this API
 * accepts.
 */
function excludingTransfers(filter: string): string {
	return filter === '' ? 'isTransfer eq false' : `isTransfer eq false and (${filter})`;
}

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
						filter: excludingTransfers(
							listFilter.call(this, i, options, transactionFilterFieldTypes),
						),
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
			} else if (operation === 'create') {
				returnData.push({
					json: await createEntry.call(this, i, collection),
					pairedItem: { item: i },
				});
			} else if (operation === 'delete') {
				const scheduleId = recordId.call(this, 'scheduleId', i);
				const entryId = recordId.call(this, 'entryId', i);

				// The route carries the kind, and that segment is the whole difference
				// between 204 and 404. The catalogue of this project documented it
				// without — `DELETE /schedules/{scheduleId}/payments/{entryId}` — and
				// that form answers 404, as do `DELETE /payments/{entryId}` and
				// `DELETE /schedules/{scheduleId}/payments`. Measured on 2026-07-27.
				await niboApiRequest.call(
					this,
					i,
					'DELETE',
					`/schedules/${collection.kind}/${encodeURIComponent(scheduleId)}/${collection.endpoint.slice(1)}/${encodeURIComponent(entryId)}`,
				);

				// The API answers 204 with no body at all, so the confirmation is
				// built here — and it carries the second thing that happened, which no
				// field of an empty answer could: the schedule this entry settled is
				// open again. A workflow that deleted an entry usually cares about
				// that more than about the entry.
				returnData.push({
					json: { entryId, scheduleId, deleted: true, scheduleReopened: true },
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
					json: failedItem(error),
					pairedItem: { item: i },
				});
				continue;
			}
			throw error instanceof NodeApiError
				? aboutTheAccount(error)
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
			filter: excludingTransfers(`entryId eq ${id}`),
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
		// The list is slow, so the schedule is asked instead — see scheduleBehind.
		// Here `isPaid` cannot be the test the creation uses: a part of the amount
		// is a real settlement and leaves the schedule open. What moved is what is
		// compared, against the reading already made for the kind check.
		const before = amountPaid(schedule);
		const { schedule: after, settled } = await confirmedSchedule.call(
			this,
			itemIndex,
			scheduleId,
			(candidate) => amountPaid(candidate) > before,
		);

		if (settled && after !== undefined) {
			// A confirmed write is never reported as a failure.
			return {
				...after,
				entryId,
				scheduleId,
				_niboReadBackPending: `The settlement went through — Nibo shows ${amountPaid(after)} paid on this ${collection.schedule}, against ${before} before it — but the settled-entry collection had not caught up in time to hand back the entry itself. **Do not send it again**: settling twice records the money twice. The entry is "${entryId}"; read it with the ${collection.noun} resource, filtering by that ID, if the full record is needed.`,
			};
		}

		if (after !== undefined) {
			throw new NodeOperationError(
				this.getNode(),
				`This settlement did not settle anything: nothing moved on the ${collection.schedule}`,
				{
					itemIndex,
					description: `Nibo answered the settlement with the ID "${entryId}", but reading the schedule "${scheduleId}" back shows the same ${before} paid as before it was sent. The API answers this route 200 whether or not it applies anything. Check the schedule in Nibo before sending it again.`,
				},
			);
		}

		// The wording is the whole point of this branch. The write went through —
		// the API answered with the ID of what it created. What failed is only the
		// reading back, on a collection measured to take a few seconds to catch up.
		throw new NodeOperationError(
			this.getNode(),
			`The ${collection.schedule} was settled, but the entry could not be read back`,
			{
				itemIndex,
				description: `Nibo answered the settlement with the ID "${entryId}", so it did go through — this collection is eventually consistent and had not caught up after several tries, and the schedule itself could not be read either. **Do not send it again**: settling twice records the money twice. Read the entry with the ${collection.noun} resource, filtering by that ID.`,
			},
		);
	}

	return record;
}

/** How much of a schedule has been paid, out of whatever the API answered */
function amountPaid(schedule: unknown): number {
	const paid = (schedule as IDataObject | undefined)?.paidValue;
	return typeof paid === 'number' ? paid : Number(paid ?? 0) || 0;
}

/**
 * How many times the schedule is asked before its answer is taken as final, and
 * the breathing before each ask.
 *
 * **One `false` is never the answer**, and that is the whole reason this loop
 * exists rather than a single read. A schedule can be readable a moment before
 * its paid flag catches up — the same eventual consistency that made the entry
 * unreadable in the first place. Calling that an open schedule would tell an
 * operator the money did not move when it did, and the sentence sends them to
 * settle it again: the money recorded twice, which is the exact harm the old
 * failure existed to prevent.
 *
 * A second between asks, never less. This API answers 429 above roughly fourteen
 * calls a second and tightens that during business hours, and nothing downstream
 * of a write that already needs explaining is waiting on the millisecond.
 */
const CONFIRM_TRIES = 3;
const CONFIRM_WAIT = 1000;

/**
 * The schedule behind a write, asked until it confirms or until the asks run out.
 *
 * `settled` is what confirmation means here, and it is not the same question on
 * the two ends of this family: a creation asks whether the schedule is paid, and
 * a settlement asks whether **more** of it is paid than before — because a part
 * of the amount is a real settlement and leaves the schedule open.
 *
 * The last schedule read comes back either way, so the caller can tell "answered
 * and not settled" from "never answered". They are different failures.
 */
async function confirmedSchedule(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
	settled: (schedule: IDataObject) => boolean,
): Promise<{ schedule?: IDataObject; settled: boolean }> {
	let last: IDataObject | undefined;

	for (let attempt = 0; attempt < CONFIRM_TRIES; attempt++) {
		await sleep(CONFIRM_WAIT);

		const schedule = await scheduleBehind.call(this, itemIndex, scheduleId);
		if (schedule === undefined) {
			continue;
		}

		last = schedule;
		if (settled(schedule)) {
			return { schedule, settled: true };
		}
	}

	return { schedule: last, settled: false };
}

/**
 * The cheap proof that a write landed, for when the collection has not caught up.
 *
 * Measured on 2026-08-11, against a write made a moment before: the list of
 * settled entries took **1,1 to 2,6 seconds** to show it — and in production it
 * has taken more than **seven** — while `GET /schedules/credit/{id}` answered in
 * **38 to 67 ms**, every time, on thirteen readings. Two routes onto the same
 * fact, one of them forty times faster and without the lag.
 *
 * And its answer separates the two things that can have happened, which is what
 * the old failure could not do: `isPaid` is `true` on a schedule the settlement
 * closed, and `false` on one that was created and left open — the shape a
 * `POST` without an account produces while answering 200.
 *
 * `undefined` when the route did not answer. That is not a failure of its own:
 * the caller keeps the sentence it already had, which is the safe one.
 */
async function scheduleBehind(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
): Promise<IDataObject | undefined> {
	try {
		const answer = await niboApiRequest.call(
			this,
			itemIndex,
			'GET',
			`${READ_SCHEDULE_BY_ID}/${encodeURIComponent(scheduleId)}`,
		);

		return typeof answer === 'object' && answer !== null && !Array.isArray(answer)
			? (answer as IDataObject)
			: undefined;
	} catch {
		return undefined;
	}
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

/**
 * Records an amount already moved, creating the schedule and settling it in one
 * call — `POST /payments` and `POST /receipts`.
 *
 * **The refusal at the top of this function is the reason the version has a
 * defense at all.** Measured on 2026-07-27: without `accountId` this route
 * answers **200** and a GUID, and what it created is an **unsettled debit
 * schedule** — `/payments` stays empty. An operation called *Create Payment*
 * that sometimes creates no payment is worse than no operation, so the node
 * refuses before sending rather than reporting a success the API only appeared
 * to give.
 *
 * And the read-back goes by **`scheduleId`**, not `entryId`: this route answers
 * the ID of the schedule it created, while the settlement route answers the ID
 * of the entry. Two keys on the two ends of one family, and reading back by the
 * wrong one finds nothing.
 */
async function createEntry(
	this: IExecuteFunctions,
	itemIndex: number,
	collection: ITransactionCollection,
): Promise<IDataObject> {
	const accountId = String(this.getNodeParameter('accountId', itemIndex, '') ?? '').trim();
	if (accountId === '') {
		throw new NodeOperationError(this.getNode(), 'This entry names no bank account', {
			itemIndex,
			description: `Nothing was sent, and that is the point: without an account this API answers success and creates an **unsettled schedule** instead of a ${collection.noun} — leaving a workflow to believe the money was recorded as moved. Pick an account in the Bank Account field, or read the IDs of an organization with the Bank Account resource. To create a schedule that is not settled, use the Schedule resource, which is what that is for.`,
		});
	}

	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const accrualDate = onlyTheDay(String(this.getNodeParameter('accrualDate', itemIndex, '') ?? ''));

	const body: IDataObject = {
		accountId,
		stakeholderId: contactId.call(this, this.getNodeParameter('stakeholderId', itemIndex, ''), itemIndex),
		date: onlyTheDay(String(this.getNodeParameter('date', itemIndex) ?? '')),
		description: this.getNodeParameter('description', itemIndex, '') as string,
		// `isFlag` on the wire, `isFlagged` everywhere a person reads. The short
		// spelling exists only in this write body, and the read side of this very
		// collection answers the long one.
		isFlag: this.getNodeParameter('isFlagged', itemIndex, false) as boolean,
		categories: categoryLines.call(this, itemIndex),
	};

	// Sent only when it was filled in. Left out, the API copies `date` — which is
	// exactly what the field on the screen warns about, so an empty one has to be
	// genuinely absent for that to be true.
	if (accrualDate !== '') {
		body.accrualDate = accrualDate;
	}
	if (typeof additional.reference === 'string') {
		body.reference = additional.reference;
	}

	const answer = await niboApiRequest.call(
		this,
		itemIndex,
		'POST',
		collection.endpoint,
		{},
		body,
	);

	const scheduleId =
		typeof answer === 'string' ? answer.trim() : String((answer as IDataObject)?.data ?? '').trim();
	if (scheduleId === '') {
		throw new NodeOperationError(this.getNode(), 'Nibo did not say what it created', {
			itemIndex,
			description: `The ${collection.noun} may or may not have been created: the API answered with a body this node could not read as an ID. Check the collection in Nibo before sending it again.`,
		});
	}

	const record = await niboReadBack.call(
		this,
		itemIndex,
		collection.endpoint,
		TRANSACTION_ORDER_BY,
		// By the schedule, because that is the ID this route answers.
		`scheduleId eq ${scheduleId}`,
	);

	if (record === undefined) {
		// The list is slow, so the schedule is asked instead — see scheduleBehind.
		const { schedule, settled } = await confirmedSchedule.call(
			this,
			itemIndex,
			scheduleId,
			(candidate) => candidate.isPaid === true,
		);

		if (settled && schedule !== undefined) {
			// A confirmed write is never reported as a failure. It used to be, and
			// the cost was measured on 2026-08-10: a batch of 66 stopped on the
			// third, having recorded three, with the other 63 never sent.
			return {
				...schedule,
				scheduleId,
				_niboReadBackPending: `The ${collection.noun} exists and Nibo confirms it is settled, but the settled-entry collection had not caught up in time to hand back the entry itself. **Do not send it again**: it would record the money twice. What is here came from the schedule "${scheduleId}"; read the entry with this resource, filtering by that Schedule ID, if the full record is needed.`,
			};
		}

		if (schedule !== undefined) {
			// Answered, and not settled — the failure the old wording could not tell
			// apart from the lag above, and the one that actually matters: this route
			// answers 200 either way.
			throw new NodeOperationError(
				this.getNode(),
				`This ${collection.noun} came out as an open schedule, and the money was not recorded as moved`,
				{
					itemIndex,
					description: `Nibo created the schedule "${scheduleId}" and left it unsettled — it says isPaid false. So there is a receivable or payable in Nibo now, and no ${collection.noun}. **Do not simply send it again**: that would leave two open schedules. Settle this one with the Settle operation, or delete it with the Schedule resource and send it again.`,
				},
			);
		}

		throw new NodeOperationError(
			this.getNode(),
			`The ${collection.noun} was created, but it could not be read back`,
			{
				itemIndex,
				description: `Nibo answered with the schedule ID "${scheduleId}", so it did go through — this collection is eventually consistent and had not caught up after several tries, and the schedule itself could not be read either. **Do not send it again**: it would record the money twice. Read it with this resource, filtering by that Schedule ID.`,
			},
		);
	}

	return record;
}

/**
 * The category lines, as this API states an amount here too.
 *
 * The same shape a schedule takes, and refused for the same reason when empty:
 * the entry has no total of its own, so no lines means no amount, and finding
 * that out from a 500 is finding it out late.
 */
function categoryLines(this: IExecuteFunctions, itemIndex: number): IDataObject[] {
	const rows = (this.getNodeParameter('categories', itemIndex, {}) as IDataObject)?.category;

	if (!Array.isArray(rows) || rows.length === 0) {
		throw new NodeOperationError(this.getNode(), 'This entry has no category line', {
			itemIndex,
			description:
				'Add at least one line under Categories, with a financial category and an amount. The amount of the entry is the sum of its lines: this API keeps no total of its own.',
		});
	}

	return rows.map((row) => {
		const { categoryId, value } = (row ?? {}) as IDataObject;
		const id = String(categoryId ?? '').trim();

		if (id === '') {
			throw new NodeOperationError(this.getNode(), 'A category line names no category', {
				itemIndex,
				description:
					'Every line under Categories needs the ID of a financial category. Pick one from the list, or read the right ID for this organization with the Category resource.',
			});
		}

		const detail = String((row as IDataObject).description ?? '').trim();

		return detail === '' ? { categoryId: id, value } : { categoryId: id, value, description: detail };
	});
}

/**
 * The contact, out of either shape the field can hold — the search component
 * stores `{__rl, mode, value}` and an expression stores a plain string.
 */
function contactId(this: IExecuteFunctions, chosen: unknown, itemIndex: number): string {
	const raw = typeof chosen === 'object' && chosen !== null ? (chosen as IDataObject).value : chosen;
	const id = String(raw ?? '').trim();

	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'This entry names no contact', {
			itemIndex,
			description:
				'Pick a contact in the Stakeholder field, or switch it to "By ID" and put the ID there — usually an expression reading it from the incoming item.',
		});
	}

	return id;
}

/**
 * The refusal that names a date rule nobody would think to look for.
 *
 * Measured on 2026-07-27: an entry dated before the chosen account's
 * opening-balance date answers *"A data da baixa é inferior a data do saldo
 * inicial da conta."* The sentence is accurate and leaves out the one thing that
 * solves it — that the date to compare with is a property of the **account**,
 * not of the entry, and can be read off it.
 */
const BEFORE_THE_OPENING_BALANCE = /data da baixa .*saldo inicial/i;

function aboutTheAccount(error: NodeApiError): NodeApiError {
	const said = [error.message, error.description].filter(Boolean).join(' ');

	if (BEFORE_THE_OPENING_BALANCE.test(said)) {
		error.description =
			`${error.description ?? ''}\n\nThe date compared against belongs to the **bank account**, not to this entry: every account carries an opening balance and the day it was struck, and nothing can be filed before it. Read the account with the Bank Account resource and look at dateOfOpenBalance, then either move this date forward or choose another account.`.trim();
	}

	return error;
}
