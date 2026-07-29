import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { onlyTheDay } from '../schedule/normalize';
import { serviceInvoiceFilterFieldTypes } from './description';

/**
 * The notes. No `/public/` prefix, no plural of its own — `/nfse` reads as the
 * abbreviation does in Portuguese, singular and plural at once.
 */
const INVOICES = '/nfse';

/**
 * The service profiles, **undocumented by Nibo** and the only route that hands
 * over a `ServiceProfileId` — which the issuing body demands. It is also the
 * only way to find out whether an organization issues notes at all.
 */
const PROFILES = '/nfse/serviceprofiles';

/**
 * The paging key.
 *
 * Both `id` and `lastStatusChange` answer 200, and this project's catalogue
 * asked for the second one. They are equivalent for paging and `id` is what
 * every other collection of this node already uses, so `id` is what stays: one
 * key fewer to remember.
 *
 * `accrualDate` and `issueDate` are both **500** as an `$orderby`, and so is
 * `$skip` with no `$orderby` at all — as on every collection of this API. The
 * transport always sends the key, so that mine is never stepped on.
 */
const INVOICE_ORDER_BY = 'id';

/**
 * The service invoices of the organization.
 *
 * The record is 41 fields — 42 across the states, because a terminal state does
 * not carry the other one's — and they are handed back exactly as they came.
 * This node has never renamed a field of this API, and a note is read far more
 * often than it is issued.
 */
export async function executeServiceInvoice(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'serviceInvoice') {
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
					INVOICES,
					INVOICE_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, serviceInvoiceFilterFieldTypes),
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
					json: await oneInvoice.call(this, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'issue') {
				returnData.push({
					json: await issueInvoice.call(this, i, options, interval),
					pairedItem: { item: i },
				});
			} else if (operation === 'listProfiles') {
				for (const profile of await serviceProfiles.call(this, i)) {
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
 * One note, read through the list filtered by its ID.
 *
 * **There is no get-by-id.** `GET /nfse/{id}` answers 404 *"Resource not
 * found"* — the same 404 an invented route answers, measured on 2026-07-29 — so
 * this is not a preference, it is the only door. The GUID travels **bare**:
 * `id eq guid'…'` and `id eq '…'` are both 500, one about an unrecognized
 * literal and the other about incompatible operand types.
 */
async function oneInvoice(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const id = recordId.call(this, 'serviceInvoiceId', itemIndex);

	const { records } = await niboListRequest.call(this, itemIndex, INVOICES, INVOICE_ORDER_BY, {
		returnAll: false,
		limit: 1,
		filter: `id eq ${id}`,
		// One record asked for by ID is not a scan, and there is no count to
		// compare against: the check that guards a scan would only add a way to
		// fail here.
		failOnIncomplete: false,
	});

	const found = records[0];
	if (found === undefined) {
		// For the API an empty envelope is not an error — a filter matched
		// nothing. For an operation that asked for one record by ID, it is
		// exactly what "not found" means.
		throw new NodeOperationError(this.getNode(), `Nibo has no service invoice with the ID ${id}`, {
			itemIndex,
			description:
				'Either the ID is not the ID of a note, or it belongs to another organization — in this API the token is the organization. Note that a cancelled note is still readable: it stays in the collection with its status set to Cancelled, so this is not what a cancellation looks like.',
		});
	}

	return found;
}

/**
 * The states a note can be sitting in while it is still on its way.
 *
 * Measured on 2026-07-29, watching one note at 400 ms intervals: `1` at 0.4 s,
 * `2` at 0.8 s and `3` at 22.8 s. Everything else stops the wait — including a
 * code this project has never seen, because a wait that hangs on an unknown
 * value is a wait that never ends.
 */
const QUEUED = 1;
const PROCESSING = 2;
const AUTHORIZED = 3;

/** How long the wait runs for by default, in seconds — the decision of 2026-07-29 */
const DEFAULT_TIMEOUT = 300;

/**
 * The shortest gap between two readings of the same note.
 *
 * The interval of the node is what paces this, as it paces everything else, but
 * a poll loop is the one place where "0, back to back" is genuinely dangerous:
 * this API answers HTTP 429 above roughly 14 calls a second, in plain text, and
 * fabricates a false result out of it (measured in 0.11.2). So zero here means
 * a second, not no gap at all.
 */
const MINIMUM_POLL = 1000;

/**
 * Whether this note has reached a state the wait has nothing left to wait for.
 *
 * Three ways in, and the third is the one that matters most:
 *
 * - **`code < 0`** — denied or cancelled. Terminal, and **not a failure of this
 *   node**: the call worked and the city hall said no.
 * - **`code > 0` with a `number`** — authorized, with everything that arrives
 *   with the authorization: the number, the verification code, the PDF and the
 *   XML.
 * - **anything else that is not `1` or `2`** — a code nobody has seen. `-2` and
 *   `-3` never showed up in any measurement and this project does not claim
 *   they do not exist, so an unknown code is terminal and travels out as it
 *   came.
 */
function isTerminal(record: IDataObject): boolean {
	const code = Number((record.status as IDataObject | undefined)?.code);

	if (!Number.isFinite(code)) {
		// No status at all is nothing to wait for either.
		return true;
	}
	if (code < 0) {
		return true;
	}
	if (code === QUEUED || code === PROCESSING) {
		return false;
	}

	// Authorized without its number yet is the one case worth another reading:
	// the number is what the whole wait is for.
	return code !== AUTHORIZED || String(record.number ?? '') !== '';
}

/**
 * Issues a note from a receivable, and then — unless somebody switched it off —
 * follows it until the city hall has answered.
 *
 * 🔴 **What this never does is report a failure.** An issuing that went through
 * and is reported as failed makes a workflow issue again, and the second RPS has
 * already left. Timeout hands the record back saying the note was issued and is
 * not authorized yet; a denial hands the record back with the city hall's own
 * text. Both are data, and a workflow that has to act on either reads
 * `status.code`.
 */
async function issueInvoice(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
	interval: number,
): Promise<IDataObject> {
	const extras = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

	// PascalCase, which is the exception in this API rather than the rule — the
	// same spelling `POST /schedules/credit` and `POST /public/collections` take,
	// and nothing else does.
	const body: IDataObject = {
		ScheduleId: recordId.call(this, 'scheduleId', itemIndex),
		ServiceProfileId: requiredValue.call(
			this,
			itemIndex,
			'serviceProfileId',
			'This item names no service profile',
			'A note is issued through a service profile, and the API refuses a body without one. Pick it from the list, or put an expression here reading the ID — Service Invoice - Get Many Service Profiles is where the IDs come from.',
		),
		StakeholderId: requiredValue.call(
			this,
			itemIndex,
			'stakeholderId',
			'This item names no taker',
			'The taker of the service is obligatory in the body of an issuing. Choose the contact in the picker, or switch it to By ID and put an expression there.',
		),
		AccrualRpsDate: onlyTheDay(String(this.getNodeParameter('accrualDate', itemIndex, '') ?? '')),
	};

	// The three the API also takes, sent only when somebody filled them in. An
	// empty string here is a value, not a silence — and what Nibo does when the
	// key is absent is its own business, which is exactly what leaving it out
	// asks for.
	const optional: Array<[string, string]> = [
		['additionalServiceDescription', 'AdditionalServiceDescription'],
		['stateWhereServiceWasProvided', 'StateWhereServiceWasProvided'],
		['cityWhereServiceWasProvided', 'CityWhereServiceWasProvided'],
	];
	for (const [name, key] of optional) {
		const value = String(extras[name] ?? '').trim();
		if (value !== '') {
			body[key] = value;
		}
	}

	const answer = await niboApiRequest.call(this, itemIndex, 'POST', INVOICES, {}, body);
	const id = createdId(answer);

	let record = await readInvoice.call(this, itemIndex, id);

	if (options.waitForAuthorization === false) {
		return record ?? { serviceInvoiceId: id, issued: true };
	}

	const timeout =
		typeof options.authorizationTimeout === 'number'
			? options.authorizationTimeout
			: DEFAULT_TIMEOUT;
	const deadline = Date.now() + Math.max(timeout, 0) * 1000;
	const poll = Math.max(interval, MINIMUM_POLL);

	while (record === undefined || !isTerminal(record)) {
		if (Date.now() >= deadline) {
			return {
				...(record ?? { serviceInvoiceId: id }),
				_niboAuthorizationPending: `The service invoice was issued and is not authorized yet: it had not reached a final state after ${timeout} seconds. Nothing failed and nothing has to be issued again — the note is at the city hall with its RPS. Read it with Service Invoice - Get, or raise Authorization Timeout under Options.`,
			};
		}

		await sleep(poll);
		record = await readInvoice.call(this, itemIndex, id);
	}

	return record;
}

/** One note by ID, or nothing at all — the reading the wait repeats */
async function readInvoice(
	this: IExecuteFunctions,
	itemIndex: number,
	id: string,
): Promise<IDataObject | undefined> {
	const { records } = await niboListRequest.call(this, itemIndex, INVOICES, INVOICE_ORDER_BY, {
		returnAll: false,
		limit: 1,
		filter: `id eq ${id}`,
		failOnIncomplete: false,
	});

	return records[0];
}

/**
 * A field the API will not do without, refused here while it is still free to
 * refuse — an issuing that is rejected downstream has already cost a call, and
 * this one is the call that cannot be taken back.
 *
 * The taker arrives either as a `resourceLocator` — `{mode, value}` — or as the
 * plain string a node saved by hand carries, and both are read, exactly as the
 * schedules read theirs.
 */
function requiredValue(
	this: IExecuteFunctions,
	itemIndex: number,
	parameter: string,
	message: string,
	description: string,
): string {
	const raw = this.getNodeParameter(parameter, itemIndex, '') as unknown;
	const value =
		raw !== null && typeof raw === 'object'
			? String((raw as IDataObject).value ?? '').trim()
			: String(raw ?? '').trim();

	if (value === '') {
		throw new NodeOperationError(this.getNode(), message, { itemIndex, description });
	}

	return value;
}

/**
 * The ID out of an issuing answer — a GUID that arrives as a JSON string, so it
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
 * The service profiles of the organization.
 *
 * Read whole, with no paging: a company has one or two of these, and the
 * question they answer is binary. An empty answer is a **200** — measured, not
 * assumed — and it means the organization does not issue notes at all, which is
 * worth a sentence rather than an empty box.
 */
async function serviceProfiles(
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
			'This organization does not issue NFS-e, so it has no service profile',
			{
				itemIndex,
				description:
					'The route answered 200 with an empty list, which is how this API says it: not a 403 and not a 404. A note needs a valid digital certificate and a service profile approved by the city hall, and neither is something this API can create — both are set up in Nibo. Until there is one, Service Invoice - Issue has nothing to issue with.',
			},
		);
	}

	return profiles;
}
