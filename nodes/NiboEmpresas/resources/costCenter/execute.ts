import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboCreate, niboSafeUpdate } from '../../transport/save';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { costCenterFilterFieldTypes } from './description';

const COST_CENTERS = '/costcenters';

/**
 * The paging key, and it is not `id`.
 *
 * `$orderby=id` answers HTTP 500 here — the property does not exist on this
 * view — and `$orderby=costCenterId` answers 200. Measured on the test company
 * on 2026-07-26. It is the third collection of this node with its own key, after
 * the stakeholders' `id` and the schedules' `scheduleId`, which is why the
 * transport has taken it as a parameter since 0.2.0.
 *
 * `$skip` without an `$orderby` is a 500 here too, as everywhere in this API, so
 * it is always sent.
 */
const COST_CENTER_ORDER_BY = 'costCenterId';

/**
 * The cost centres, in the mould of the contacts — five operations, and the
 * safe update cycle for the one that writes over a stored record.
 *
 * No normalizer: what the API answers here needs no repairing. There is no
 * mirrored field, no zeroed ID at the root and no casing to settle. The records
 * travel exactly as they came.
 */
export async function executeCostCenter(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'costCenter') {
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
					COST_CENTERS,
					COST_CENTER_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, costCenterFilterFieldTypes),
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
				const id = recordId.call(this, 'costCenterId', i);
				const record = await niboApiRequest.call(
					this,
					i,
					'GET',
					`${COST_CENTERS}/${encodeURIComponent(id)}`,
				);

				returnData.push({
					json: readRecord.call(this, record, id, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'create') {
				// The POST answers a bare GUID — there is no `/FormatType=json` here —
				// so the record comes from a read-back, which this collection answers
				// at the same address it was written to.
				const created = await niboCreate.call(
					this,
					i,
					COST_CENTERS,
					writePayload({
						description: this.getNodeParameter('description', i) as string,
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					}),
				);

				returnData.push({ json: created, pairedItem: { item: i } });
			} else if (operation === 'update') {
				// Only what the user added travels: everything else keeps whatever is
				// stored in Nibo, which is what the safe cycle in the transport is for.
				// The `PUT` answers 204 with no body at all, so the confirmation is the
				// read-back — there is nothing in the answer to read.
				const updated = await niboSafeUpdate.call(
					this,
					i,
					COST_CENTERS,
					recordId.call(this, 'costCenterId', i),
					writePayload(this.getNodeParameter('updateFields', i, {}) as IDataObject),
				);

				returnData.push({ json: updated, pairedItem: { item: i } });
			} else if (operation === 'delete') {
				const id = recordId.call(this, 'costCenterId', i);
				await niboApiRequest.call(this, i, 'DELETE', `${COST_CENTERS}/${encodeURIComponent(id)}`);

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
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
	}

	return returnData;
}

/** The fields that travel to the API exactly as the editor collected them */
const WRITE_FIELDS = ['description', 'externalCode'];

/**
 * Turns what the editor collected into the payload the API keeps.
 *
 * Flat, all of it — this record has no branches. A field that was not filled in
 * is not here and does not reach the payload, which on an Update is the whole
 * promise of "the node does not touch what you did not add". A field that is
 * there but empty **does** reach it: adding a field and leaving it blank is how
 * a stored value is erased.
 */
function writePayload(fields: IDataObject): IDataObject {
	const payload: IDataObject = {};

	for (const field of WRITE_FIELDS) {
		if (fields[field] !== undefined) {
			payload[field] = fields[field];
		}
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
