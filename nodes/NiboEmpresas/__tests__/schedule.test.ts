import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { executeSchedule } from '../resources/schedule/execute';
import { normalizeSchedule } from '../resources/schedule/normalize';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/paginate');
jest.mock('../transport/request');

jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

/** The options object the handler handed to the transport */
function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][3] as unknown as IDataObject;
}

/** (itemIndex, method, endpoint, qs, body) — the transport's own signature */
function apiCall(index: number) {
	const [itemIndex, method, endpoint] = apiRequest.mock.calls[index];
	return { itemIndex, method, endpoint };
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	apiRequest.mockReset();
	apiRequest.mockResolvedValue({});
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The paging key is the first thing about this family that is not the
 * stakeholders': there it is `id`, here `id` is an HTTP 500 —
 * *Could not find a property named 'id'* — and the key is `scheduleId`.
 *
 * The transport has taken the key as a parameter since 0.2.0. This is the first
 * collection to walk through that door.
 */
describe('executeSchedule — Get Many', () => {
	it.each([
		['creditSchedule', '/schedules/credit'],
		['debitSchedule', '/schedules/debit'],
	])('reads %s from its own collection, ordered by scheduleId', async (resource, endpoint) => {
		await executeSchedule.call(context({ returnAll: true }), resource, 'list');

		expect(listRequest.mock.calls[0][1]).toBe(endpoint);
		expect(listRequest.mock.calls[0][2]).toBe('scheduleId');
	});

	it('forwards Return All, the limit and the strict scan the same way', async () => {
		await executeSchedule.call(
			context({ returnAll: false, limit: 5 }),
			'creditSchedule',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 5,
			failOnIncomplete: true,
		});
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeSchedule.call(context({ returnAll: true }, 3), 'creditSchedule', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('waits a second between items, as everywhere else in this node', async () => {
		await executeSchedule.call(context({ returnAll: true }, 2), 'creditSchedule', 'list');

		expect(sleep).toHaveBeenCalledWith(1000);
	});

	it('flags the last item when the result may be incomplete', async () => {
		listRequest.mockResolvedValue({
			records: [{ scheduleId: 'a' }, { scheduleId: 'b' }],
			count: 3,
			warning: 'this result is incomplete',
		});

		const items = await executeSchedule.call(
			context({ returnAll: true, options: { failOnIncomplete: false } }),
			'creditSchedule',
			'list',
		);

		expect(items[0].json).not.toHaveProperty('_niboPaginationWarning');
		expect(items[1].json._niboPaginationWarning).toContain('incomplete');
	});

	it('still refuses a resource it does not know', async () => {
		await expect(executeSchedule.call(context({}), 'payment', 'list')).rejects.toThrow(/payment/);
	});
});

/**
 * The filter, which cost this family nothing: the menu is its own, everything
 * else is the module the resources share since 0.6.0.
 */
describe('executeSchedule — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[], rest: IDataObject = {}) {
		return context({ returnAll: true, filters: { conditions }, ...rest });
	}

	it('builds a date condition the way the API takes one', async () => {
		await executeSchedule.call(
			withConditions([{ field: 'dueDate', operator: 'ge', dateValue: '2026-07-01T00:00:00.000Z' }]),
			'creditSchedule',
			'list',
		);

		expect(filterSent()).toBe('dueDate ge 2026-07-01T00:00:00.000Z');
	});

	// The reason the builder learned a fourth type. Quoted, this is a 500 naming
	// the two types it could not compare.
	it('writes an amount bare, cents and all', async () => {
		await executeSchedule.call(
			withConditions([{ field: 'value', operator: 'gt', numberValue: 100.5 }]),
			'creditSchedule',
			'list',
		);

		expect(filterSent()).toBe('value gt 100.5');
	});

	it('joins the two questions a schedule is usually asked', async () => {
		await executeSchedule.call(
			withConditions([
				{ field: 'dueDate', operator: 'lt', dateValue: '2026-08-01' },
				{ field: 'isPaid', operator: 'eq', booleanValue: false },
			]),
			'debitSchedule',
			'list',
		);

		expect(filterSent()).toBe('dueDate lt 2026-08-01 and isPaid eq false');
	});

	it('lets the expression written under Options take the conditions out of the request', async () => {
		await executeSchedule.call(
			withConditions([{ field: 'isPaid', operator: 'eq', booleanValue: false }], {
				options: { filter: 'value gt 1000' },
			}),
			'creditSchedule',
			'list',
		);

		expect(filterSent()).toBe('value gt 1000');
	});

	// A field of the stakeholders' menu is not a field of this one, and dropping
	// the condition would hand back more records than the workflow asked for.
	it('fails the item on a field this menu does not have', async () => {
		const failure = executeSchedule.call(
			withConditions([{ field: 'isCompany', operator: 'eq', booleanValue: true }]),
			'creditSchedule',
			'list',
		);

		await expect(failure).rejects.toThrow(/isCompany/);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
	});
});

/**
 * The get-by-id of this API is one endpoint for both kinds. `/schedules/credit/{id}`
 * takes an ID of either kind and answers what that ID actually is;
 * `/schedules/debit/{id}` and `/schedules/{id}` are 404, always.
 */
describe('executeSchedule — Get', () => {
	it.each(['creditSchedule', 'debitSchedule'])(
		'reads a %s through the universal endpoint',
		async (resource) => {
			const parameter = `${resource}Id`;
			apiRequest.mockResolvedValue({
				scheduleId: 'not-a-real-id',
				type: resource === 'creditSchedule' ? 'Credit' : 'Debit',
			});

			const items = await executeSchedule.call(
				context({ [parameter]: 'not-a-real-id' }),
				resource,
				'get',
			);

			expect(apiCall(0)).toMatchObject({
				method: 'GET',
				endpoint: '/schedules/credit/not-a-real-id',
			});
			expect(items).toHaveLength(1);
		},
	);

	/**
	 * And the reason that endpoint needs a guard on top of it: it answers a
	 * debit ID with a debit record, cheerfully, under the credit resource. A
	 * workflow that asked for a receivable and got a payable back would not
	 * notice — which is exactly the swap this refuses to make.
	 */
	it('refuses a debit ID pasted into the credit resource, naming what it is', async () => {
		apiRequest.mockResolvedValue({ scheduleId: 'not-a-real-id', type: 'Debit' });

		const failure = executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id' }),
			'creditSchedule',
			'get',
		);

		await expect(failure).rejects.toThrow(/debit schedule/i);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
	});

	it('refuses a credit ID pasted into the debit resource just the same', async () => {
		apiRequest.mockResolvedValue({ scheduleId: 'not-a-real-id', type: 'Credit' });

		const failure = executeSchedule.call(
			context({ debitScheduleId: 'not-a-real-id' }),
			'debitSchedule',
			'get',
		);

		await expect(failure).rejects.toThrow(/credit schedule/i);
	});

	// Case is the API's business, not the workflow's.
	it('reads the type however the API spelled it', async () => {
		apiRequest.mockResolvedValue({ scheduleId: 'not-a-real-id', type: 'credit' });

		const items = await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id' }),
			'creditSchedule',
			'get',
		);

		expect(items).toHaveLength(1);
	});

	// A record that does not say what it is cannot be refused for being the
	// wrong thing. Guessing would fail reads that work today.
	it('hands back a record that carries no type at all', async () => {
		apiRequest.mockResolvedValue({ scheduleId: 'not-a-real-id' });

		const items = await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id' }),
			'creditSchedule',
			'get',
		);

		expect(items[0].json).toMatchObject({ scheduleId: 'not-a-real-id' });
	});

	it('fails the item when no ID was given, before any call is made', async () => {
		const failure = executeSchedule.call(
			context({ creditScheduleId: '  ' }),
			'creditSchedule',
			'get',
		);

		await expect(failure).rejects.toThrow(/ID/);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

/**
 * The defect the normalizer exists for: every read answers a root
 * `stakeholderId` of nothing but zeroes, and keeps the real one one level down,
 * in `stakeholder.id`. There is no read where the zeroed GUID is the right
 * answer, so it is repaired on all of them.
 */
describe('normalizeSchedule — the contact the API forgets at the root', () => {
	const ZEROED = '00000000-0000-0000-0000-000000000000';

	it('copies the real contact up to the root', () => {
		expect(
			normalizeSchedule({ stakeholderId: ZEROED, stakeholder: { id: 'real-id', name: 'ACME' } }),
		).toMatchObject({ stakeholderId: 'real-id' });
	});

	it('leaves the branch it read it from exactly as it was', () => {
		const normalized = normalizeSchedule({
			stakeholderId: ZEROED,
			stakeholder: { id: 'real-id', name: 'ACME' },
		});

		expect(normalized.stakeholder).toEqual({ id: 'real-id', name: 'ACME' });
	});

	it('fills a root that is missing altogether', () => {
		expect(normalizeSchedule({ stakeholder: { id: 'real-id' } })).toMatchObject({
			stakeholderId: 'real-id',
		});
	});

	// On a write the root is the field that carries the contact, and it is right.
	it('never overwrites a root that already carries a real ID', () => {
		expect(
			normalizeSchedule({ stakeholderId: 'typed-id', stakeholder: { id: 'other-id' } }),
		).toMatchObject({ stakeholderId: 'typed-id' });
	});

	it('leaves a record with no stakeholder branch untouched', () => {
		const record = { scheduleId: 'a', stakeholderId: ZEROED };

		expect(normalizeSchedule(record)).toEqual(record);
	});

	it('changes nothing when there is nothing to change', () => {
		const record = { scheduleId: 'a', value: 10 };

		expect(normalizeSchedule(record)).toEqual(record);
	});

	/**
	 * The sign is not touched, and that is a decision. A debit answers negative
	 * and is written positive; a node that flipped it on the way out would add
	 * up differently from the API it wraps, and every reconciliation built on it
	 * would be wrong in a way nobody could see.
	 */
	it('passes the sign of a debit through as the API answered it', () => {
		expect(normalizeSchedule({ scheduleId: 'a', value: -1226.12 })).toMatchObject({
			value: -1226.12,
		});
	});
});

describe('executeSchedule — the records it hands back', () => {
	const ZEROED = '00000000-0000-0000-0000-000000000000';

	it('repairs the contact on every record of a scan', async () => {
		listRequest.mockResolvedValue({
			records: [
				{ scheduleId: 'a', stakeholderId: ZEROED, stakeholder: { id: 'one' } },
				{ scheduleId: 'b', stakeholderId: ZEROED, stakeholder: { id: 'two' } },
			],
			count: 2,
		});

		const items = await executeSchedule.call(
			context({ returnAll: true }),
			'creditSchedule',
			'list',
		);

		expect(items.map((item) => item.json.stakeholderId)).toEqual(['one', 'two']);
	});

	it('repairs it on a record read by ID as well', async () => {
		apiRequest.mockResolvedValue({
			scheduleId: 'a',
			type: 'Credit',
			stakeholderId: ZEROED,
			stakeholder: { id: 'one' },
		});

		const items = await executeSchedule.call(
			context({ creditScheduleId: 'a' }),
			'creditSchedule',
			'get',
		);

		expect(items[0].json.stakeholderId).toBe('one');
	});
});
