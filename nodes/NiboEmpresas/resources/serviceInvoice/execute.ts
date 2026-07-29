import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
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
