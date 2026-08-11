import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboCreate, niboSafeUpdate } from '../../transport/save';
import { failedItem } from '../shared/failure';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { automationPayload } from './automation';
import { scheduleFilterFieldTypes } from './description';
import { normalizeSchedule, onlyTheDay, scheduleComparable } from './normalize';
import { repeatPayload } from './repeat';

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
				const collected: IDataObject = {
					// Handed over exactly as the field holds it: the payload builder
					// is where either shape of it becomes an ID, on this operation
					// and on the update alike.
					stakeholderId: this.getNodeParameter('stakeholderId', i, ''),
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
					// The apportionment, read from the body for the same reason: it
					// is a field of the creation form rather than an entry of the
					// menu below. Both are read even when untouched — with no line
					// at all neither reaches the payload, which is what keeps a
					// schedule written by 0.8.2 byte for byte the same.
					apportionBy: this.getNodeParameter('apportionBy', i, 'percent') as string,
					costCenters: this.getNodeParameter('costCenters', i, {}) as IDataObject,
					...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
				};

				const body = writePayload.call(this, i, collected);

				// Os blocos da 0.15.0. Lidos sempre, e mudos quando o gatilho está em
				// "não" — um agendamento criado sem tocá-los sai igual ao da 0.14.2.
				const repeat = repeatPayload.call(
					this,
					i,
					{
						dueDate: collected.dueDate,
						// A descrição viaja junto porque a API descarta a da raiz
						// quando há parcelas: cada linha precisa carregar a sua.
						description: collected.description,
						repeat: this.getNodeParameter('repeat', i, 'no'),
						recurrenceInterval: this.getNodeParameter('recurrenceInterval', i, 1),
						recurrenceIntervalType: this.getNodeParameter('recurrenceIntervalType', i, 'month'),
						recurrenceEnds: this.getNodeParameter('recurrenceEnds', i, 'occurrences'),
						recurrenceOccurrences: this.getNodeParameter('recurrenceOccurrences', i, 0),
						recurrenceEndDate: this.getNodeParameter('recurrenceEndDate', i, ''),
						installmentsAre: this.getNodeParameter('installmentsAre', i, 'generated'),
						installmentCount: this.getNodeParameter('installmentCount', i, 0),
						installmentInterval: this.getNodeParameter('installmentInterval', i, 1),
						installmentIntervalType: this.getNodeParameter('installmentIntervalType', i, 'month'),
						installmentAmount: this.getNodeParameter('installmentAmount', i, 'split'),
						installments: this.getNodeParameter('installments', i, {}),
					},
					totalOfCategories(body.categories),
				);

				const automation =
					resource === 'creditSchedule'
						? automationPayload.call(this, i, {
								generateBoleto: this.getNodeParameter('generateBoleto', i, 'no'),
								boletoDaysBefore: this.getNodeParameter('boletoDaysBefore', i, 0),
								boletoCollectionProfileId: this.getNodeParameter('boletoCollectionProfileId', i, ''),
								boletoDeliveryType: this.getNodeParameter('boletoDeliveryType', i, 'default'),
								issueInvoice: this.getNodeParameter('issueInvoice', i, 'no'),
								invoiceDaysBefore: this.getNodeParameter('invoiceDaysBefore', i, 0),
								invoiceServiceProfileId: this.getNodeParameter('invoiceServiceProfileId', i, ''),
								invoiceServiceDescription: this.getNodeParameter('invoiceServiceDescription', i, ''),
								invoiceAdditionalRemarks: this.getNodeParameter('invoiceAdditionalRemarks', i, ''),
								invoiceCityWhereServiceWasProvided: this.getNodeParameter(
									'invoiceCityWhereServiceWasProvided',
									i,
									'',
								),
								invoiceStateWhereServiceWasProvided: this.getNodeParameter(
									'invoiceStateWhereServiceWasProvided',
									i,
									'',
								),
							})
						: {};

				// The POST answers a bare GUID on both kinds — there is no
				// `/FormatType=json` here — so the record comes from a read-back, and
				// that read-back cannot happen in the collection it was written to.
				const created = await niboCreate.call(
					this,
					i,
					endpoint,
					{ ...body, ...automation, ...repeat },
					{ readEndpoint: READ_BY_ID },
				);

				returnData.push({
					json: await withTheSiblings.call(this, i, normalizeSchedule(created)),
					pairedItem: { item: i },
				});
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
					json: failedItem(error),
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
const PLAIN_FIELDS = ['description', 'isFlagged', 'reference'];

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

	// The contact is the one field that arrives in two shapes, and it is turned
	// into an ID here so that a creation and an update read it the same way.
	// Absent from the menu on an update, it is absent from the payload, which is
	// what leaves the contact of the schedule as it is.
	if (fields.stakeholderId !== undefined) {
		payload.stakeholderId = contactId.call(this, fields.stakeholderId, itemIndex);
	}

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

	const shares = costCenterLines.call(this, itemIndex, fields.costCenters, fields.apportionBy);
	if (shares !== undefined) {
		payload.costCenters = shares.lines;
		payload.costCenterValueType = shares.valueType;
	}

	return payload;
}

/**
 * What `costCenterValueType` means, which is not readable from the two numbers.
 *
 * Measured on the test company on 2026-07-26, one probe each way: **1 with
 * `percent` on the lines** and **0 with `value`** both answer 200, and the
 * crossed pair answers 500. The screen says "Percentage" and "Value"; these two
 * numbers never reach it.
 */
const VALUE_TYPE_OF: Record<string, number> = {
	percent: 1,
	value: 0,
};

/** One apportionment line, and which key its share was written under */
interface IApportionment {
	lines: IDataObject[];
	valueType: number;
}

/**
 * The apportionment across cost centres, or `undefined` when there is none to
 * send.
 *
 * Three cases collapse into that `undefined`, and they are the same case: the
 * collection was never opened, it was opened and left empty, or this is an
 * update that did not mention it. In all three the schedule keeps whatever it
 * has — which for every schedule written before 0.9.0 is nothing at all, and is
 * why this version changes no existing workflow.
 *
 * The two keys travel together or not at all. A line carries **either**
 * `percent` **or** `value`, never both: the form collects one number and
 * Apportion By decides once, above the lines, which key it becomes. That is
 * what makes the crossed pair — the one refusal of this family that talks about
 * the wrong thing — unreachable from the screen.
 */
function costCenterLines(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: unknown,
	apportionBy: unknown,
): IApportionment | undefined {
	const rows = (collected as IDataObject)?.costCenter;
	if (!Array.isArray(rows) || rows.length === 0) {
		return undefined;
	}

	// On a creation this is always on the screen, so it is always here. On an
	// update it is an entry of a menu, and lines added without it would be
	// written under whichever key this node happened to default to — which on a
	// schedule apportioned by value would quietly turn amounts into percentages.
	// So it is asked for rather than assumed.
	const chosen = String(apportionBy ?? '').trim();
	const valueType = VALUE_TYPE_OF[chosen];
	if (valueType === undefined) {
		throw new NodeOperationError(this.getNode(), 'This apportionment does not say how to read it', {
			itemIndex,
			description:
				'Add Apportion By alongside Cost Centers and say whether the shares are percentages or amounts. The two travel together: the same number means 60% under one and 60 reais under the other, and the API reports the mismatch as a problem with the sum rather than with the pair.',
		});
	}

	const key = chosen === 'percent' ? 'percent' : 'value';

	return {
		valueType,
		lines: rows.map((row) => {
			const { costCenterId, share } = (row ?? {}) as IDataObject;
			const id = String(costCenterId ?? '').trim();

			if (id === '') {
				throw new NodeOperationError(this.getNode(), 'A line names no cost center', {
					itemIndex,
					description:
						'Every line under Cost Centers needs the ID of a cost center, as Nibo returns it in the costCenterId field. Pick one from the list, or read the right ID for this organization with the Cost Center resource.',
				});
			}

			return { costCenterId: id, [key]: share };
		}),
	};
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
 * The contact this schedule is for, out of either shape the field can hold.
 *
 * Since 0.8.0 it is the editor's search component, which stores
 * `{__rl, mode, value}`. A node saved before that stores the plain ID, and
 * `getNodeParameters` was measured to keep such a string rather than discard it
 * — so both are read here, and a workflow built last week goes on running
 * without ever being opened.
 *
 * Refused while it is still cheap to refuse: an empty contact would otherwise
 * reach the API as a missing stakeholder, answered for in its own way and at
 * its own moment. On an update that refusal is the same one the category lines
 * give — a field added and left empty is an unfinished row, and a schedule with
 * no contact is not a schedule this API keeps.
 */
function contactId(this: IExecuteFunctions, chosen: unknown, itemIndex: number): string {
	const raw =
		typeof chosen === 'object' && chosen !== null ? (chosen as IDataObject).value : chosen;
	const id = String(raw ?? '').trim();

	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'This schedule names no contact', {
			itemIndex,
			description:
				'Pick a contact in the Stakeholder field, or switch it to "By ID" and put the ID there — usually an expression reading it from the incoming item. On an update, leaving the field out of Update Fields altogether keeps the contact the schedule already has.',
		});
	}

	return id;
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

/**
 * The refusal that names a kind of category without naming the field it came in.
 *
 * Measured on the cobaia on 2026-07-26, on both sides: a discount category —
 * "Descontos Recebidos" on a receivable, "Descontos Concedidos" on a payable —
 * answers *"Categoria de juros, multa ou desconto invalida"*. Those belong to
 * Nibo, which writes them itself when a receipt carries interest or a discount,
 * and a schedule is not filed under one.
 *
 * Since 0.8.1 the list does not offer them, so this is for an ID that came from
 * an expression or a paste — and for the sibling families that the API accepts
 * and Nibo's own screen then cannot draw.
 */
const NIBO_OWN_CATEGORY = /categoria de juros, multa ou desconto/i;

/**
 * The two refusals of the apportionment, and what neither of them says.
 *
 * Measured on the test company on 2026-07-26. Percentages that do not add up to
 * 100 answer *"A soma do percentual total dos Centros de Custo deve ser de
 * 100%"*, and amounts that do not add up to the schedule answer *"A soma dos
 * valores totais dos Centros de Custo deve ser igual ao valor do agendamento."*
 *
 * Both are accurate, and both leave out the mistake that most often produces
 * them: the pair is the wrong way round. Sending `costCenterValueType` 0 — value
 * — with `percent` on the lines answers the **second** of these, complaining
 * about a sum of amounts to somebody who typed percentages. The node keeps the
 * API's own words and adds that underneath.
 */
const APPORTIONMENT_SUM = /soma d[oe]s? (percentual|valores).*centros de custo/i;

function aboutTheCategory(error: NodeApiError, operation: string): NodeApiError {
	if (operation !== 'create' && operation !== 'update') {
		return error;
	}

	const said = [error.message, error.description].filter(Boolean).join(' ');

	if (SIGNED_BY_THE_CATEGORY.test(said)) {
		error.description = `${error.description ?? ''}\n\nThis usually means the category does not match the kind of schedule: a revenue category cannot carry a payment, nor an expense category a receipt. It is the category's type that decides the sign of the line, which is why the API reports it as a problem with the amount. Pick the category from the list on the field, or read the right ID for this organization with the Category resource.`.trim();
		return error;
	}

	if (NIBO_OWN_CATEGORY.test(said)) {
		error.description = `${error.description ?? ''}\n\nThis category is one of Nibo's own automatic categories — interest, fines and discounts, which Nibo writes itself when a receipt or a payment carries one. A schedule cannot be filed under it. Pick a category from the list on the field, which offers the organization's own chart of accounts, or read the right ID with the Category resource.`.trim();
		return error;
	}

	if (ONE_CATEGORY_ONLY.test(said)) {
		error.description = `${error.description ?? ''}\n\nSplitting an amount across categories has to be enabled for the organization in Nibo, and it is not by default. Nothing in the API says whether it is, so the field offers as many lines as you like and this is where the answer arrives. Turn the split on in Nibo, leave a single line under Categories, or make one schedule per category.`.trim();
		return error;
	}

	if (APPORTIONMENT_SUM.test(said)) {
		error.description = `${error.description ?? ''}\n\nThe shares of the cost center lines have to add up: to 100 when Apportion By is Percentage, and to the amount of the schedule when it is Value. Check the shares — and check Apportion By itself, because the API answers this same sentence when the two disagree, complaining about a sum of amounts to somebody who typed percentages.`.trim();
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

/** O valor de um agendamento é a soma das suas linhas: esta API não guarda total */
function totalOfCategories(lines: unknown): number {
	return Array.isArray(lines)
		? lines.reduce((sum, line) => sum + Math.abs(Number((line as IDataObject)?.value ?? 0)), 0)
		: 0;
}

/**
 * O que a criação devolve, mais o que só existe depois dela.
 *
 * **As parcelas irmãs são lidas; as ocorrências de uma recorrência não.** Medido em
 * 2026-08-01: `/installments/{id}` e `/installments/{id}/schedules` existem e
 * `/recurrences` é 404 em toda forma. Então uma é lista e a outra é frase.
 *
 * O `installmentId` vive **aninhado** — `installment: {installmentId, parcelNumber}`,
 * medido em 2026-08-02 — e o enriquecimento preserva o `parcelNumber` que o registro
 * já trazia.
 *
 * A leitura é **enriquecimento, não confirmação** — se falhar, a criação continua
 * tendo dado certo e o item sai sem a lista. Reprovar aqui mandaria o fluxo tentar
 * de novo, e tentar de novo abre outro parcelamento.
 */
async function withTheSiblings(
	this: IExecuteFunctions,
	itemIndex: number,
	record: IDataObject,
): Promise<IDataObject> {
	if (record.hasRecurrence === true) {
		return {
			...record,
			_niboRecurrenceNotListed:
				'This creation answered with the first schedule alone — measured on 2026-08-02 — and this API has no route that lists the occurrences of a recurrence: /recurrences answers 404 in every form. Nibo writes the further occurrences itself, up to 36 months ahead. Read them with Schedule - Get Many, filtering by description or by due date.',
		};
	}

	const nested = record.installment as IDataObject | undefined;
	const group = String(nested?.installmentId ?? '').trim();
	if (group === '') {
		return record;
	}

	try {
		const summary = (await niboApiRequest.call(
			this,
			itemIndex,
			'GET',
			`/installments/${encodeURIComponent(group)}`,
		)) as IDataObject;

		const answer = await niboApiRequest.call(
			this,
			itemIndex,
			'GET',
			`/installments/${encodeURIComponent(group)}/schedules`,
		);
		const schedules = Array.isArray(answer) ? answer : ((answer as IDataObject)?.items ?? []);

		return { ...record, installment: { ...nested, ...summary, schedules } };
	} catch {
		// A criação deu certo. Uma leitura que falhou não pode transformá-la em erro.
		return record;
	}
}
