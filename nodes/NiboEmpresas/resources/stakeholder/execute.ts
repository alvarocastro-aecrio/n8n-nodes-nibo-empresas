import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';

// One handler for the four stakeholder types — their API contract is
// identical. Only `customer` is routed to it in v0.1.0.
const STAKEHOLDER_ENDPOINTS: Record<string, string> = {
	customer: '/customers',
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
			if (operation === 'list') {
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

				const { records, warning } = await niboListRequest.call(
					this,
					endpoint,
					STAKEHOLDER_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: this.getNodeParameter('filter', i, '') as string,
						failOnIncomplete: this.getNodeParameter('failOnIncomplete', i, false) as boolean,
					},
				);

				records.forEach((record, index) => {
					// A result that may be incomplete says so on its last item, so a
					// workflow reading only the data still sees it. Every field of the
					// API is left untouched.
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
