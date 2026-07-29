import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, requestInterval } from '../shared/options';
import { serviceInvoiceFilterFieldTypes } from './description';

/**
 * The notes. No `/public/` prefix, no plural of its own — `/nfse` reads as the
 * abbreviation does in Portuguese, singular and plural at once.
 */
const INVOICES = '/nfse';

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
