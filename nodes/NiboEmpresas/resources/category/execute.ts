import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { categoryFilterFieldTypes } from './description';

const CATEGORIES = '/categories';

/**
 * Where the rest of the family lives.
 *
 * Not under `/categories`, which is the whole finding of 0.9.0: the four routes
 * this project had recorded as 404 were 404 at that address and nowhere else.
 * Get-by-id, groups and tree all answer 200 here.
 */
const SCHEDULE_CATEGORIES = '/schedules/categories';
const CATEGORY_GROUPS = `${SCHEDULE_CATEGORIES}/groups`;
const CATEGORY_TREE = `${SCHEDULE_CATEGORIES}/tree`;

/**
 * The paging key. `id` is unique and immutable here, and the API answers 500 to
 * any `$skip` without an `$orderby`, so it is always sent.
 *
 * A chart of accounts is a few dozen lines, so this will almost never page —
 * but "almost never" is not "never", and the page cap is silent.
 */
const CATEGORY_ORDER_BY = 'id';

/**
 * The paging key of the groups, and it is not `id` — measured on 2026-07-26,
 * because the obvious answer is wrong in the way that is hardest to notice.
 *
 * `$orderby=id` answers **200 and does not sort**: the groups come back in the
 * same arbitrary order as with no key at all. A paging key that does not order
 * is a scan that can read one record twice and miss another, with nothing in
 * any answer to say so. `referenceCode` sorts, is unique across the groups, and
 * puts them in the order a chart of accounts is read in — Receitas, Custos,
 * Despesas, Investimento, Financiamento — which is the same key the category
 * list has sorted by since 0.7.3.
 *
 * `$skip` without any `$orderby` is a 500 here too, as everywhere else.
 */
const GROUP_ORDER_BY = 'referenceCode';

/**
 * The shape this API insists on for an ID, and the one place it insists on it
 * without quotes.
 *
 * `id eq '<guid>'` answers HTTP 500 — *Found operand types 'Edm.Guid' and
 * 'Edm.String'* — which is the opposite of what every text comparison in this
 * API requires. So the value is checked here: a filter built out of anything
 * else reaches the server as a 500 that says nothing about the field it came
 * from.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * No normalizer: what the API answers here needs no repairing. Every other
 * resource of this node has an asymmetry to settle — `Cnpj` against `CNPJ`, a
 * zeroed contact at the root — and this one has none, so the records travel
 * exactly as they came.
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

			if (operation === 'list' || operation === 'groups') {
				const groups = operation === 'groups';
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

				const { records, warning } = await niboListRequest.call(
					this,
					i,
					groups ? CATEGORY_GROUPS : CATEGORIES,
					groups ? GROUP_ORDER_BY : CATEGORY_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						// The assisted filter was measured against `/categories` and
						// against nothing else, so it is not offered on the groups and
						// does not travel there either.
						filter: groups
							? undefined
							: listFilter.call(this, i, options, categoryFilterFieldTypes),
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
					json: await oneCategory.call(this, i, recordId.call(this, 'categoryId', i), interval),
					pairedItem: { item: i },
				});
			} else if (operation === 'create') {
				returnData.push({
					json: await createCategory.call(this, i, interval),
					pairedItem: { item: i },
				});
			} else if (operation === 'tree') {
				// The whole hierarchy in one answer, and a **bare array** — no
				// `{items, count}`, like `/employees` and `/partners`. It takes no
				// page and no filter, so it never goes near the pager.
				const qs: IDataObject = {};
				if (this.getNodeParameter('includeDeleted', i, false) as boolean) {
					qs.IncludeDeletedCategory = true;
				}
				if (this.getNodeParameter('nfseValueOnly', i, false) as boolean) {
					qs.CanComposeNFSeValueOnly = true;
				}

				const answer = await niboApiRequest.call(this, i, 'GET', CATEGORY_TREE, qs);
				if (!Array.isArray(answer)) {
					throw new NodeOperationError(this.getNode(), 'Nibo did not answer with a category tree', {
						itemIndex: i,
						description:
							'This route answers a bare array, one element per group of the chart of accounts, and something else arrived. Nothing was read.',
					});
				}

				answer.forEach((node) => {
					returnData.push({ json: node as IDataObject, pairedItem: { item: i } });
				});
			} else {
				// `PUT` and `DELETE /schedules/categories/{id}` are 404, exactly as
				// they are under `/categories` — measured on 2026-07-26. An operation
				// the API has no route for fails here rather than being offered on
				// the screen and discovered at run time.
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
 * Creates a category and hands back the record, not the ID.
 *
 * `POST /categories` is a 404 and always was. `POST /schedules/categories`
 * answers **200** and creates it — the route this project never asked, and the
 * whole reason 0.9.0 is a minor version. Measured on the test company on
 * 2026-07-26, along with the two absences that make this operation what it is:
 * there is no `PUT` and no `DELETE` for a category, in any path, so this write
 * has no way back and the screen says so before the button.
 *
 * The API answers a bare GUID with no envelope around it, so the record is read
 * back — through the same door Get uses, so that Create and Get and Get Many
 * all answer the same shape. Employee and Partner have done exactly this since
 * 0.4.4.
 */
async function createCategory(
	this: IExecuteFunctions,
	itemIndex: number,
	interval: number,
): Promise<IDataObject> {
	const group = String(this.getNodeParameter('categoryGroupId', itemIndex, '') ?? '').trim();
	if (group === '') {
		throw new NodeOperationError(this.getNode(), 'This category names no group', {
			itemIndex,
			description:
				'Pick a group in the Category Group field, or put the ID of one there — usually an expression reading it from the incoming item. Read the IDs of an organization with the operation Get Many Groups.',
		});
	}

	const name = String(this.getNodeParameter('name', itemIndex, '') ?? '').trim();
	if (name === '') {
		throw new NodeOperationError(this.getNode(), 'This category has no name', {
			itemIndex,
			description: 'The Name field is what the category will be called in Nibo, and it is required.',
		});
	}

	const body: IDataObject = {
		categoryGroupId: group,
		name,
		type: this.getNodeParameter('type', itemIndex) as string,
	};

	// Sent only when one was chosen. A `subGroupId` the organization does not
	// have answers 500 — *"Subgroupo não encontrado."* — and an empty one would
	// be exactly that.
	const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const subGroup = String(additional.subGroupId ?? '').trim();
	if (subGroup !== '') {
		body.subGroupId = subGroup;
	}

	const answer = await niboApiRequest.call(
		this,
		itemIndex,
		'POST',
		SCHEDULE_CATEGORIES,
		{},
		body,
	);

	const id = createdId(answer);
	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'Nibo did not say what it created', {
			itemIndex,
			description:
				'The category may or may not have been created: the API answered the creation with a body this node could not read as an ID. Look at the chart of accounts in Nibo before sending it again — there is no way to delete a category through this API, so a second attempt can only ever add a second one.',
		});
	}

	return await oneCategory.call(this, itemIndex, id, interval);
}

/**
 * The ID out of a creation answer.
 *
 * A bare GUID here, measured on 2026-07-26 — no envelope, not even quotes of
 * its own once the JSON is parsed. The `{data: …}` shape is the rearguard: it
 * is how some other collections of this API answer, and no operation should
 * fail over which of the two arrived.
 */
function createdId(answer: unknown): string {
	if (typeof answer === 'string') {
		return answer.trim();
	}

	const data = (answer as IDataObject)?.data;

	return typeof data === 'string' ? data.trim() : '';
}

/**
 * One category, read through the list filtered by its ID.
 *
 * There is a get-by-id — `GET /schedules/categories/{id}`, 200 since forever
 * and only found on 2026-07-26 — and this deliberately does not call it. What
 * it answers is not the record `GET /categories` answers: `subgroupId` and
 * `subgroupName` are simply absent from it, and `group.shortName` comes back
 * carrying the category's own `shortName`. A Get built on that door would hand
 * back a category with no subgroup while Get Many showed the same category with
 * one — a difference the node would be inventing, on the record a workflow is
 * most likely to compare.
 *
 * So the third door: `GET /categories?$filter=id eq <guid>`, which answers the
 * complete record. Measured on the test company on 2026-07-26, along with the
 * reason the GUID travels bare.
 *
 * An empty answer is a 200 with an empty envelope. For the API that is not an
 * error — a filter matched nothing — but for an operation that asked for one
 * record by ID it is exactly what "not found" means, and it is said here.
 */
async function oneCategory(
	this: IExecuteFunctions,
	itemIndex: number,
	id: string,
	interval: number,
): Promise<IDataObject> {
	if (!GUID.test(id)) {
		throw new NodeOperationError(this.getNode(), `The category ID "${id}" is not a GUID`, {
			itemIndex,
			description:
				'A category is read by the GUID Nibo returns in its ID field, such as 2efffcd0-8730-4348-86da-6d9a95be6149. This comparison is made against a GUID column, so anything else answers HTTP 500 with a message about operand types rather than "not found" — which is why the value is refused here instead of sent.',
		});
	}

	const { records } = await niboListRequest.call(this, itemIndex, CATEGORIES, CATEGORY_ORDER_BY, {
		returnAll: false,
		limit: 1,
		// Bare, and this is the one comparison in this API where quoting is the
		// mistake: `id eq '<guid>'` answers 500, *Found operand types 'Edm.Guid'
		// and 'Edm.String'*. Built here rather than through the filter builder for
		// that very reason — every literal it writes is quoted.
		filter: `id eq ${id}`,
		// One record cannot be an incomplete scan of a collection.
		failOnIncomplete: false,
		interval,
	});

	if (records.length === 0) {
		throw new NodeOperationError(this.getNode(), `Nibo returned no category for the ID "${id}"`, {
			itemIndex,
			description:
				'The ID is a well-formed GUID and no category of this organization carries it. A category ID belongs to one organization, so an ID that works for one credential is not found with another — every Nibo organization starts from the same chart of accounts, with different IDs behind the same names.',
		});
	}

	return records[0];
}
