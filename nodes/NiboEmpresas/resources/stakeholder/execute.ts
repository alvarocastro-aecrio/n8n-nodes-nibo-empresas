import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboCreate, niboSafeUpdate } from '../../transport/save';
import { normalizeStakeholder, stakeholderWriteBody } from './normalize';

// One handler for the four stakeholder types — their API contract is
// identical. Only `customer` is routed to it in v0.1.0.
const STAKEHOLDER_ENDPOINTS: Record<string, string> = {
	customer: '/customers',
};

// A parameter name is a contract: renaming one breaks every workflow already
// built on it. So each stakeholder type gets its own ID field, named after
// itself, and the three still outside the UI enter with theirs.
const STAKEHOLDER_ID_PARAMETERS: Record<string, string> = {
	customer: 'customerId',
};

// `id` is the only stakeholder field measured to be unique and immutable
// across the four collections, and the API returns HTTP 500 when paging
// without a sort key — so it is always sent, never optional.
const STAKEHOLDER_ORDER_BY = 'id';

export async function executeStakeholder(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	const endpoint = STAKEHOLDER_ENDPOINTS[resource];
	if (endpoint === undefined) {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const interval = requestInterval.call(this, i);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation === 'list') {
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

				// `i` is handed to the transport, not just used to read parameters:
				// in the per-item token mode it is what makes this iteration read
				// the books of this item's own organization.
				const { records, warning } = await niboListRequest.call(
					this,
					i,
					endpoint,
					STAKEHOLDER_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: this.getNodeParameter('filter', i, '') as string,
						failOnIncomplete: this.getNodeParameter('failOnIncomplete', i, false) as boolean,
						interval,
					},
				);

				records.forEach((record, index) => {
					// A result that may be incomplete says so on its last item, so a
					// workflow reading only the data still sees it. Every field of the
					// API is passed on as it came, but for the document type — see
					// normalize.ts.
					const normalized = normalizeStakeholder(record);
					const json =
						warning !== undefined && index === records.length - 1
							? { ...normalized, _niboPaginationWarning: warning }
							: normalized;

					returnData.push({ json, pairedItem: { item: i } });
				});
			} else if (operation === 'get') {
				const id = recordId.call(this, resource, i);
				const record = await niboApiRequest.call(
					this,
					i,
					'GET',
					`${endpoint}/${encodeURIComponent(id)}`,
				);

				returnData.push({
					json: normalizeStakeholder(readRecord.call(this, record, id, i)),
					pairedItem: { item: i },
				});
			} else if (operation === 'create') {
				const created = await niboCreate.call(
					this,
					i,
					endpoint,
					writePayload({
						name: this.getNodeParameter('name', i) as string,
						documentNumber: this.getNodeParameter('documentNumber', i) as string,
						documentType: this.getNodeParameter('documentType', i) as string,
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					}),
				);

				returnData.push({ json: normalizeStakeholder(created), pairedItem: { item: i } });
			} else if (operation === 'update') {
				// Only what the user added travels: everything else keeps whatever is
				// stored in Nibo, which is what the safe cycle in the transport is for.
				const changes = writePayload(this.getNodeParameter('updateFields', i, {}) as IDataObject);

				const updated = await niboSafeUpdate.call(
					this,
					i,
					endpoint,
					recordId.call(this, resource, i),
					changes,
					{ normalize: normalizeStakeholder, writeBody: stakeholderWriteBody },
				);

				returnData.push({ json: normalizeStakeholder(updated), pairedItem: { item: i } });
			} else if (operation === 'delete') {
				const id = recordId.call(this, resource, i);
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
			// The transport already wraps HTTP failures in NodeApiError — rethrow
			// it whole so no status/response context is lost; anything else gets
			// the NodeOperationError treatment the scanner requires.
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
	}

	return returnData;
}

// Where each field of the editor lives in the API's payload. Flat for whoever
// fills the form, nested on the wire — and declared once, so Create and Update
// cannot drift apart.
const WRITE_FIELD_PATHS: Record<string, string[]> = {
	name: ['name'],
	documentNumber: ['document', 'number'],
	documentType: ['document', 'type'],
	companyName: ['companyInformation', 'companyName'],
	contactName: ['communication', 'contactName'],
	cellPhone: ['communication', 'cellPhone'],
	phone: ['communication', 'phone'],
	email: ['communication', 'email'],
	webSite: ['communication', 'webSite'],
	addressLine1: ['address', 'line1'],
	addressLine2: ['address', 'line2'],
	addressNumber: ['address', 'number'],
	addressDistrict: ['address', 'district'],
	addressCity: ['address', 'city'],
	addressState: ['address', 'state'],
	addressZipCode: ['address', 'zipCode'],
	addressCountry: ['address', 'country'],
};

/**
 * Turns what the editor collected into the payload the API keeps.
 *
 * A field that was not filled in is not in `fields` and does not reach the
 * payload — on an Update that is the whole promise of "the node does not touch
 * what you did not add". A field that is there but empty **does** reach it:
 * adding a field and leaving it blank is how a stored value is erased.
 */
function writePayload(fields: IDataObject): IDataObject {
	const payload: IDataObject = {};

	for (const [parameter, path] of Object.entries(WRITE_FIELD_PATHS)) {
		const value = fields[parameter];
		if (value === undefined) {
			continue;
		}

		const branch = path
			.slice(0, -1)
			.reduce<IDataObject>(
				(parent, key) => ((parent[key] as IDataObject) ??= {}) as IDataObject,
				payload,
			);
		branch[path[path.length - 1]] = value;
	}

	return payload;
}

/**
 * How long to wait between two calls, in milliseconds.
 *
 * A second by default, and on purpose: one item per organization means a
 * portfolio loop fires hundreds of calls in a row, so the defense has to be
 * what happens when nobody chose anything.
 *
 * Until 0.4.1 it was a field of its own. A node saved back then still carries
 * it there and its author still means it, so that value is read when the
 * option was not set.
 */
function requestInterval(this: IExecuteFunctions, itemIndex: number): number {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	return typeof options.requestInterval === 'number'
		? options.requestInterval
		: (this.getNodeParameter('requestInterval', itemIndex, 1000) as number);
}

/**
 * The ID this item works on, refused while it is still cheap to refuse.
 *
 * An empty ID would otherwise be sent as `/customers/` — the collection
 * endpoint — which on a DELETE is a request no one wants to find out the
 * answer to.
 */
function recordId(this: IExecuteFunctions, resource: string, itemIndex: number): string {
	const parameter = STAKEHOLDER_ID_PARAMETERS[resource];
	const id = String(this.getNodeParameter(parameter, itemIndex, '') ?? '').trim();

	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'This item carries no record ID', {
			itemIndex,
			description: `The ${parameter} field is empty. It is usually an expression reading the ID from the incoming item.`,
		});
	}

	return id;
}

function readRecord(
	this: IExecuteFunctions,
	value: unknown,
	id: string,
	itemIndex: number,
): IDataObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new NodeOperationError(this.getNode(), `Nibo returned no record for the ID "${id}"`, {
			itemIndex,
		});
	}

	return value as IDataObject;
}
