import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboCreate, niboSafeUpdate } from '../../transport/save';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { scheduleFilterFieldTypes } from './description';
import { normalizeSchedule, onlyTheDay, scheduleComparable } from './normalize';

interface IScheduleCollection {
	/** Where this kind is listed, created, updated and deleted */
	endpoint: string;
	/**
	 * The parameter carrying the ID. A parameter name is a contract, so each
	 * kind has its own rather than the two sharing one.
	 */
	idParameter: string;
	/** What the API answers in `type` for a record of this kind */
	type: string;
	/** How an error message names one of them */
	noun: string;
}

/**
 * One handler for the two kinds of schedule — the API gives them the same
 * contract, exactly as it does the four stakeholders. They cost this table and
 * one guard, and no logic at all.
 */
const SCHEDULES: Record<string, IScheduleCollection> = {
	creditSchedule: {
		endpoint: '/schedules/credit',
		idParameter: 'creditScheduleId',
		type: 'credit',
		noun: 'credit schedule',
	},
	debitSchedule: {
		endpoint: '/schedules/debit',
		idParameter: 'debitScheduleId',
		type: 'debit',
		noun: 'debit schedule',
	},
};

/**
 * Where a schedule is read by ID — both kinds, always this one.
 *
 * `GET /schedules/credit/{id}` takes an ID of either kind and answers what that
 * ID actually is, `type` included. `GET /schedules/debit/{id}` and
 * `GET /schedules/{id}` are 404, always: not "not found for this id", but the
 * route itself. So the collection a schedule is written to is not the
 * collection it is read from, which is why the guard below exists at all.
 */
const READ_BY_ID = '/schedules/credit';

/**
 * The paging key, and the first thing about this family that is not the
 * stakeholders'.
 *
 * There the key is `id`; here `id` answers HTTP 500 — *Could not find a
 * property named 'id' on type '…ScheduleFullViewDto'* — and the key is
 * `scheduleId`. The transport has taken it as a parameter since 0.2.0 and this
 * is the first collection to walk through that door. `$skip` without an
 * `$orderby` is a 500 here too, so it is always sent.
 */
const SCHEDULE_ORDER_BY = 'scheduleId';

export async function executeSchedule(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	const collection = SCHEDULES[resource];
	if (collection === undefined) {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}
	const endpoint = collection.endpoint;

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
					endpoint,
					SCHEDULE_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, scheduleFilterFieldTypes),
						failOnIncomplete: failOnIncomplete.call(this, i, options),
						interval,
					},
				);

				records.forEach((record, index) => {
					const normalized = normalizeSchedule(record);
					const json =
						warning !== undefined && index === records.length - 1
							? { ...normalized, _niboPaginationWarning: warning }
							: normalized;

					returnData.push({ json, pairedItem: { item: i } });
				});
			} else if (operation === 'get') {
				const id = recordId.call(this, collection.idParameter, i);
				const record = await niboApiRequest.call(
					this,
					i,
					'GET',
					`${READ_BY_ID}/${encodeURIComponent(id)}`,
				);

				returnData.push({
					json: normalizeSchedule(ofThisKind.call(this, record, collection, id, i)),
					pairedItem: { item: i },
				});
			} else if (operation === 'create') {
				// The POST answers a bare GUID on both kinds — there is no
				// `/FormatType=json` here — so the record comes from a read-back, and
				// that read-back cannot happen in the collection it was written to.
				const created = await niboCreate.call(
					this,
					i,
					endpoint,
					writePayload.call(this, i, {
						stakeholderId: this.getNodeParameter('stakeholderId', i) as string,
						dueDate: this.getNodeParameter('dueDate', i) as string,
						scheduleDate: this.getNodeParameter('scheduleDate', i) as string,
						accrualDate: this.getNodeParameter('accrualDate', i, '') as string,
						categories: this.getNodeParameter('categories', i, {}) as IDataObject,
						// On the screen since 0.7.1 rather than inside the menu below,
						// so they are read from the body — a fallback each, because a
						// node saved under 0.7.0 still carries them in the menu, and
						// the spread underneath is what lets that one win.
						description: this.getNodeParameter('description', i, '') as string,
						isFlagged: this.getNodeParameter('isFlagged', i, false) as boolean,
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					}),
					{ readEndpoint: READ_BY_ID },
				);

				returnData.push({ json: normalizeSchedule(created), pairedItem: { item: i } });
			} else if (operation === 'update') {
				// Only what the user added travels: everything else keeps whatever is
				// stored in Nibo, which is what the safe cycle in the transport is for.
				const changes = writePayload.call(
					this,
					i,
					this.getNodeParameter('updateFields', i, {}) as IDataObject,
				);

				const updated = await niboSafeUpdate.call(
					this,
					i,
					endpoint,
					recordId.call(this, collection.idParameter, i),
					changes,
					// No `writeBody`: the record the universal endpoint answers is a
					// valid write body whole, measured on both kinds. The stakeholders
					// need one because a read mirrors two of their fields at the root;
					// nothing here does.
					{ readEndpoint: READ_BY_ID, normalize: scheduleComparable },
				);

				returnData.push({ json: normalizeSchedule(updated), pairedItem: { item: i } });
			} else if (operation === 'delete') {
				const id = recordId.call(this, collection.idParameter, i);
				await niboApiRequest.call(this, i, 'DELETE', `${endpoint}/${encodeURIComponent(id)}`);

				// The API answers 204 with no body at all, so the confirmation the
				// workflow reads has to be built here — there is nothing to pass on.
				returnData.push({ json: { id, deleted: true }, pairedItem: { item: i } });
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
				? aboutTheCategory(error, operation)
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
	}

	return returnData;
}

/** The fields the API keeps as a plain day and answers as a full timestamp */
const DATE_FIELDS = ['accrualDate', 'dueDate', 'scheduleDate'];

/**
 * The fields that travel to the API exactly as the editor collected them.
 *
 * `isFlagged` is on this list with its full spelling because the same API calls
 * it `isFlag` on a payment, and the wrong one is accepted and quietly ignored.
 * Nobody types either.
 */
const PLAIN_FIELDS = ['stakeholderId', 'description', 'isFlagged', 'reference'];

/**
 * Turns what the editor collected into the payload the API keeps.
 *
 * Flat, all of it: unlike a stakeholder, a schedule has no branches — the
 * contact, the dates and the free text all sit at the root, and the only nested
 * thing is the list of category lines.
 *
 * A field that was not filled in is not here and does not reach the payload. On
 * an Update that is the whole promise of "the node does not touch what you did
 * not add"; on a Create it is what lets the accrual date be genuinely absent,
 * which is the case the field on the screen is warning about.
 */
function writePayload(
	this: IExecuteFunctions,
	itemIndex: number,
	fields: IDataObject,
): IDataObject {
	const payload: IDataObject = {};

	for (const field of PLAIN_FIELDS) {
		if (fields[field] !== undefined) {
			payload[field] = fields[field];
		}
	}

	for (const field of DATE_FIELDS) {
		const value = fields[field];
		// An empty date is not a date. Left blank on a Create, the accrual date
		// has to be absent from the body — that is what makes the API copy the
		// due date, which is what the field says it will do.
		if (typeof value === 'string' && value.trim() !== '') {
			payload[field] = onlyTheDay(value);
		} else if (value !== undefined && typeof value !== 'string') {
			payload[field] = value;
		}
	}

	const lines = categoryLines.call(this, itemIndex, fields.categories);
	if (lines !== undefined) {
		payload.categories = lines;
	}

	return payload;
}

/**
 * The category lines, as the API states an amount.
 *
 * `undefined` when the collection was not touched at all, which on an Update is
 * "leave the lines alone". An empty list is a different thing and is refused:
 * the API has no total of its own, so a schedule with no lines is a schedule
 * with no amount, and finding that out from a 500 is finding it out late.
 *
 * The amount is passed on exactly as it was typed, positive on both kinds. It is
 * the API that signs it — measured on the cobaia on 2026-07-26, where a debit
 * line of 300 came back as -300 and the amount at the root of the body was
 * ignored entirely.
 */
function categoryLines(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: unknown,
): IDataObject[] | undefined {
	if (collected === undefined) {
		return undefined;
	}

	const rows = (collected as IDataObject)?.category;
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new NodeOperationError(this.getNode(), 'This schedule has no category line', {
			itemIndex,
			description:
				'Add at least one line under Categories, with the ID of a financial category and an amount. The amount of a schedule is the sum of its lines: this API keeps no total of its own, so a schedule with no lines has no amount.',
		});
	}

	return rows.map((row) => {
		const { categoryId, value } = (row ?? {}) as IDataObject;
		const id = String(categoryId ?? '').trim();

		if (id === '') {
			throw new NodeOperationError(this.getNode(), 'A category line names no category', {
				itemIndex,
				description:
					'Every line under Categories needs the ID of a financial category, as Nibo returns it in the ID field. It is usually an expression reading it from the incoming item.',
			});
		}

		// A line of its own detail, sent only when there is one. The rest of the
		// payload follows the same rule, and on an update — where the whole array
		// is replaced — leaving it out is what erases a detail that was there.
		const detail = String((row as IDataObject).description ?? '').trim();

		return detail === '' ? { categoryId: id, value } : { categoryId: id, value, description: detail };
	});
}

/**
 * The one refusal of this API that points at the wrong field, given the sentence
 * that solves it.
 *
 * Measured on the cobaia on 2026-07-26. A cost category on a receivable answers
 * *"Valor do agendamento deve ser positivo"* — to someone who typed a positive
 * number, in a form with no negative in it — and a revenue category on a payable
 * answers the mirror. The category's type is what signs the line, so the total
 * goes the wrong way and the validation complains about the total. Nothing in
 * the answer mentions the category.
 *
 * The list on the field makes this unreachable for whoever picks from it. This
 * is for whoever does not: an expression, or an ID pasted by hand.
 *
 * Only on a write, and only on that sentence. A node that answered "it is
 * probably the category" to every failure would be worse than one that said
 * nothing, and the API's own words are the evidence — they are kept, and the
 * hint is added underneath.
 */
const SIGNED_BY_THE_CATEGORY = /valor do agendamento.*(positivo|negativo)/i;

/**
 * The other refusal that is about the category lines, and the one the field
 * itself promises away.
 *
 * Measured on the cobaia on 2026-07-26, both ways: with the split off, a
 * creation with two lines answers *"Utilize apenas uma categoria"*; with it
 * turned on in Nibo, the same two lines are accepted and the schedule's amount
 * comes back as their sum. It is a setting of the organization and nothing in
 * the API says whether it is on — so the node cannot offer one line here and
 * several there. It offers several, and explains this refusal when it comes.
 */
const ONE_CATEGORY_ONLY = /apenas uma categoria/i;

function aboutTheCategory(error: NodeApiError, operation: string): NodeApiError {
	if (operation !== 'create' && operation !== 'update') {
		return error;
	}

	const said = [error.message, error.description].filter(Boolean).join(' ');

	if (SIGNED_BY_THE_CATEGORY.test(said)) {
		error.description = `${error.description ?? ''}\n\nThis usually means the category does not match the kind of schedule: a revenue category cannot carry a payment, nor an expense category a receipt. It is the category's type that decides the sign of the line, which is why the API reports it as a problem with the amount. Pick the category from the list on the field, or read the right ID for this organization with the Category resource.`.trim();
		return error;
	}

	if (ONE_CATEGORY_ONLY.test(said)) {
		error.description = `${error.description ?? ''}\n\nSplitting an amount across categories has to be enabled for the organization in Nibo, and it is not by default. Nothing in the API says whether it is, so the field offers as many lines as you like and this is where the answer arrives. Turn the split on in Nibo, leave a single line under Categories, or make one schedule per category.`.trim();
		return error;
	}

	return error;
}

/**
 * The record, once it is settled that it is the kind that was asked for.
 *
 * The endpoint that reads by ID is universal, so a debit ID pasted into the
 * credit resource answers 200 with a debit record — cheerfully, and with
 * nothing in the answer to suggest anything went wrong. A workflow that asked
 * for a receivable and got a payable back would not notice, and that is exactly
 * the swap this refuses to make. The error names what the ID really is, because
 * that is the sentence that ends the search.
 *
 * A record that does not say what it is cannot be refused for being the wrong
 * thing: guessing would break reads that work.
 */
function ofThisKind(
	this: IExecuteFunctions,
	value: unknown,
	collection: IScheduleCollection,
	id: string,
	itemIndex: number,
): IDataObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new NodeOperationError(this.getNode(), `Nibo returned no record for the ID "${id}"`, {
			itemIndex,
		});
	}

	const record = value as IDataObject;
	const type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';

	if (type !== '' && type !== collection.type) {
		const found = Object.values(SCHEDULES).find((other) => other.type === type);

		throw new NodeOperationError(
			this.getNode(),
			`The ID "${id}" belongs to a ${found?.noun ?? `schedule of type "${record.type}"`}`,
			{
				itemIndex,
				description: `This is the ${collection.noun} resource, and Nibo answered that ID with a record of the other kind. The API reads both kinds through one endpoint, so the wrong resource would otherwise hand back the wrong record without a word. Switch the resource, or check where the ID came from.`,
			},
		);
	}

	return record;
}
