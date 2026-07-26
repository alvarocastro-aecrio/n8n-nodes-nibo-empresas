import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, requestInterval } from '../shared/options';
import { categoryFilterFieldTypes } from './description';

const CATEGORIES = '/categories';

/**
 * The paging key. `id` is unique and immutable here, and the API answers 500 to
 * any `$skip` without an `$orderby`, so it is always sent.
 *
 * A chart of accounts is a few dozen lines, so this will almost never page —
 * but "almost never" is not "never", and the page cap is silent.
 */
const CATEGORY_ORDER_BY = 'id';

/**
 * One operation, and no normalizer: what the API answers here needs no
 * repairing. Every other resource of this node has an asymmetry to settle —
 * `Cnpj` against `CNPJ`, a zeroed contact at the root — and this one has none,
 * so the records travel exactly as they came.
 */
export async function executeCategory(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'category') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation !== 'list') {
				// `GET /categories/{id}` is a 404 and creating one was never measured.
				// An operation the API has no route for fails here rather than being
				// offered on the screen and discovered at run time.
				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" is not supported`,
					{ itemIndex: i },
				);
			}

			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

			const { records, warning } = await niboListRequest.call(
				this,
				i,
				CATEGORIES,
				CATEGORY_ORDER_BY,
				{
					returnAll,
					limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
					filter: listFilter.call(this, i, options, categoryFilterFieldTypes),
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
