import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboCreate, niboSafeUpdate } from '../../transport/save';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { stakeholderFilterFieldTypes } from './description';
import { normalizeStakeholder, stakeholderWriteBody } from './normalize';

interface IStakeholderCollection {
	endpoint: string;
	/**
	 * The parameter carrying the ID. A parameter name is a contract, so each
	 * type has its own rather than everyone sharing one that would be renamed.
	 */
	idParameter: string;
	/**
	 * Whether `POST /{collection}/FormatType=json` exists here. Measured on the
	 * cobaia on 2026-07-25: it does for customers and suppliers, and answers
	 * **404** for employees and partners. The transport falls back to the plain
	 * POST plus a read-back, so Create answers the same shape either way.
	 */
	createAnswersWithTheRecord: boolean;
}

/**
 * One handler for the four stakeholder types — the API gives them an identical
 * contract, and since 0.4.4 all four are in the UI. They cost this table and
 * no logic at all, which is what the parameterized handler was for since
 * 0.1.0. Where they genuinely differ, they differ here.
 */
const STAKEHOLDERS: Record<string, IStakeholderCollection> = {
	customer: {
		endpoint: '/customers',
		idParameter: 'customerId',
		createAnswersWithTheRecord: true,
	},
	employee: {
		endpoint: '/employees',
		idParameter: 'employeeId',
		createAnswersWithTheRecord: false,
	},
	partner: {
		endpoint: '/partners',
		idParameter: 'partnerId',
		createAnswersWithTheRecord: false,
	},
	supplier: {
		endpoint: '/suppliers',
		idParameter: 'supplierId',
		createAnswersWithTheRecord: true,
	},
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

	const collection = STAKEHOLDERS[resource];
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
						filter: listFilter.call(this, i, options, stakeholderFilterFieldTypes),
						failOnIncomplete: failOnIncomplete.call(this, i, options),
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
				const id = recordId.call(this, collection.idParameter, i);
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
						...documentGiven.call(this, i),
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					}),
					{ answersWithTheRecord: collection.createAnswersWithTheRecord },
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
					recordId.call(this, collection.idParameter, i),
					changes,
					{ normalize: normalizeStakeholder, writeBody: stakeholderWriteBody },
				);

				returnData.push({ json: normalizeStakeholder(updated), pairedItem: { item: i } });
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
 * The document of a contact being created — when there is one.
 *
 * The API stores a contact that has nothing but a name, so neither field is
 * required on the form. An empty number, though, is not the same as no
 * document: `document.number: ''` next to a type is still a document, and it
 * is the API's to validate. So a blank number takes the type with it, and the
 * whole branch stays out of the payload.
 *
 * Only Create passes through here. An Update reads the two from Update Fields,
 * where an empty value is how a stored document is erased on purpose.
 */
function documentGiven(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const number = this.getNodeParameter('documentNumber', itemIndex, '') as string;
	if (typeof number !== 'string' || number.trim() === '') {
		return {};
	}

	return {
		documentNumber: number,
		documentType: this.getNodeParameter('documentType', itemIndex, '') as string,
	};
}

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
