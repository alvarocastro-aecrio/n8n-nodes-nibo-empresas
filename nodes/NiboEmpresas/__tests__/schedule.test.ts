import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeSchedule } from '../resources/schedule/execute';
import { normalizeSchedule } from '../resources/schedule/normalize';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';
import { niboCreate, niboSafeUpdate } from '../transport/save';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('../transport/save');

jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;
const create = niboCreate as jest.MockedFunction<typeof niboCreate>;
const safeUpdate = niboSafeUpdate as jest.MockedFunction<typeof niboSafeUpdate>;

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
	create.mockReset();
	create.mockResolvedValue({ scheduleId: 'not-a-real-id' });
	safeUpdate.mockReset();
	safeUpdate.mockResolvedValue({ scheduleId: 'not-a-real-id' });
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/** What a filled-in creation form hands the handler */
const CREATE_FORM: IDataObject = {
	stakeholderId: 'not-a-real-contact',
	dueDate: '2026-08-10T00:00:00.000-03:00',
	scheduleDate: '2026-08-10T00:00:00.000-03:00',
	categories: { category: [{ categoryId: 'not-a-real-category', value: 1226.12 }] },
};

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

/**
 * Everything here is what the cobaia answered on 2026-07-26, and nothing here
 * is what the documentation says.
 */
describe('executeSchedule — Create', () => {
	/** The payload the handler built out of the form */
	function payloadSent(): IDataObject {
		return create.mock.calls[0][2];
	}

	it.each([
		['creditSchedule', '/schedules/credit'],
		['debitSchedule', '/schedules/debit'],
	])('posts a %s to its own collection', async (resource, endpoint) => {
		await executeSchedule.call(context(CREATE_FORM), resource, 'create');

		expect(create.mock.calls[0][0]).toBe(0);
		expect(create.mock.calls[0][1]).toBe(endpoint);
	});

	/**
	 * And reads it back somewhere else, because `GET /schedules/debit/{id}` is a
	 * 404 as a route. The POST answers a bare GUID on both kinds — no
	 * `/FormatType=json` anywhere — so a read-back is the only way Create hands
	 * back a record at all.
	 */
	it('tells the transport to read the new record at the universal endpoint', async () => {
		await executeSchedule.call(context(CREATE_FORM), 'debitSchedule', 'create');

		expect(create.mock.calls[0][3]).toEqual({ readEndpoint: '/schedules/credit' });
	});

	it('sends the flat payload the API takes, with the dates as plain days', async () => {
		await executeSchedule.call(context(CREATE_FORM), 'creditSchedule', 'create');

		expect(payloadSent()).toEqual({
			stakeholderId: 'not-a-real-contact',
			dueDate: '2026-08-10',
			scheduleDate: '2026-08-10',
			categories: [{ categoryId: 'not-a-real-category', value: 1226.12 }],
		});
	});

	/**
	 * The day the person picked, not the day it happens to be in UTC. The editor
	 * hands over an offset — `2026-08-10T00:00:00.000-03:00` is the 9th in
	 * London — and a schedule that falls due one day early is a schedule that is
	 * overdue one day early.
	 */
	it('keeps the day that was picked, whatever the offset it arrived with', async () => {
		await executeSchedule.call(
			context({ ...CREATE_FORM, dueDate: '2026-08-10T23:30:00.000-03:00' }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().dueDate).toBe('2026-08-10');
	});

	// Left empty it must not travel at all: it is the API's silent copy of the
	// due date that the field on the screen is warning about, and sending an
	// empty accrual date would be a different thing entirely.
	it('leaves the accrual date out of the payload when nobody filled it in', async () => {
		await executeSchedule.call(
			context({ ...CREATE_FORM, accrualDate: '' }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent()).not.toHaveProperty('accrualDate');
	});

	it('sends it when somebody did', async () => {
		await executeSchedule.call(
			context({ ...CREATE_FORM, accrualDate: '2026-07-31T00:00:00.000Z' }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().accrualDate).toBe('2026-07-31');
	});

	it('files the additional fields at the root, where this API keeps them', async () => {
		await executeSchedule.call(
			context({
				...CREATE_FORM,
				additionalFields: { description: 'SERVIÇOS DE JULHO', reference: 'NF 1234' },
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent()).toMatchObject({
			description: 'SERVIÇOS DE JULHO',
			reference: 'NF 1234',
		});
	});

	// One letter apart from what a payment calls the same thing, and the wrong
	// one is accepted and quietly ignored. Nobody types either.
	it('spells the flag the way a schedule spells it', async () => {
		await executeSchedule.call(
			context({ ...CREATE_FORM, additionalFields: { isFlagged: true } }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent()).toMatchObject({ isFlagged: true });
		expect(payloadSent()).not.toHaveProperty('isFlag');
	});

	it('takes more than one category line', async () => {
		await executeSchedule.call(
			context({
				...CREATE_FORM,
				categories: {
					category: [
						{ categoryId: 'one', value: 500 },
						{ categoryId: 'other', value: 726.12 },
					],
				},
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().categories).toEqual([
			{ categoryId: 'one', value: 500 },
			{ categoryId: 'other', value: 726.12 },
		]);
	});

	/**
	 * Positive on both kinds, and it is the API that signs it: a debit created
	 * with a line of 500 answers -500 when it is read back. Sending the sign
	 * ourselves would be inventing arithmetic the API already does.
	 */
	it('sends a debit line positive, exactly as a credit one', async () => {
		await executeSchedule.call(context(CREATE_FORM), 'debitSchedule', 'create');

		expect(payloadSent().categories).toEqual([
			{ categoryId: 'not-a-real-category', value: 1226.12 },
		]);
	});

	it('refuses an item with no category line, before anything is sent', async () => {
		const failure = executeSchedule.call(
			context({ ...CREATE_FORM, categories: {} }),
			'creditSchedule',
			'create',
		);

		await expect(failure).rejects.toThrow(/categor/i);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 0 } });
		expect(create).not.toHaveBeenCalled();
	});

	it('refuses a line that names no category', async () => {
		const failure = executeSchedule.call(
			context({ ...CREATE_FORM, categories: { category: [{ categoryId: '  ', value: 10 }] } }),
			'creditSchedule',
			'create',
		);

		await expect(failure).rejects.toThrow(/categor/i);
		expect(create).not.toHaveBeenCalled();
	});

	it('hands back the record the API stored, with the contact repaired', async () => {
		create.mockResolvedValue({
			scheduleId: 'not-a-real-id',
			stakeholderId: '00000000-0000-0000-0000-000000000000',
			stakeholder: { id: 'real-one' },
		});

		const items = await executeSchedule.call(context(CREATE_FORM), 'creditSchedule', 'create');

		expect(items[0].json.stakeholderId).toBe('real-one');
	});
});

describe('executeSchedule — Update', () => {
	/** (itemIndex, endpoint, id, changes, options) — the transport's own signature */
	function updateCall() {
		const [itemIndex, endpoint, id, changes, options] = safeUpdate.mock.calls[0];
		return { itemIndex, endpoint, id, changes, options };
	}

	it('writes at the collection of the record and reads at the universal endpoint', async () => {
		await executeSchedule.call(
			context({ debitScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'debitSchedule',
			'update',
		);

		expect(updateCall()).toMatchObject({
			endpoint: '/schedules/debit',
			id: 'not-a-real-id',
			changes: { description: 'CHANGED' },
		});
		expect(updateCall().options?.readEndpoint).toBe('/schedules/credit');
	});

	it('changes only the fields that were added', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { dueDate: '2026-09-20T00:00:00.000-03:00' },
			}),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).toEqual({ dueDate: '2026-09-20' });
	});

	it('replaces the category lines whole, which is the only thing a partial array could mean', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { categories: { category: [{ categoryId: 'one', value: 300 }] } },
			}),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).toEqual({ categories: [{ categoryId: 'one', value: 300 }] });
	});

	/**
	 * Without this the confirmation would cry wolf on every update.
	 *
	 * Ask for a due date of the 20th and the API answers `2026-09-20T00:00:00Z`.
	 * Ask a debit for a line of 300 and it answers -300, because the sign belongs
	 * to the collection. Neither is the API refusing the change, and reporting
	 * them as one would fail updates that worked.
	 */
	it('hands the safe cycle a normalizer that compares like for like', async () => {
		await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'creditSchedule',
			'update',
		);

		const normalize = updateCall().options?.normalize;

		expect(normalize?.({ dueDate: '2026-09-20T00:00:00Z' })).toMatchObject({
			dueDate: '2026-09-20',
		});
		expect(
			normalize?.({
				categories: [
					{ id: 'line-id', categoryId: 'one', categoryName: 'Whatever', value: -300, type: 'out' },
				],
			}),
		).toEqual({ categories: [{ categoryId: 'one', value: 300 }] });
	});

	// The whole record as the universal endpoint answers it is a valid write
	// body, measured on both kinds — so nothing has to be taken out of it, which
	// is the opposite of the stakeholders and their mirrored phone and e-mail.
	it('needs nothing dropped from the body it writes back', async () => {
		await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'creditSchedule',
			'update',
		);

		expect(updateCall().options?.writeBody).toBeUndefined();
	});

	/**
	 * A text field added and left blank is an erasure, and travels. A date or a
	 * category left blank is an unfinished row: a schedule with no due date or no
	 * amount is not a schedule this API keeps, so it is ignored rather than sent
	 * — and an update with nothing else in it fails in the transport, saying so.
	 */
	it('erases a text field left blank, and ignores a date left blank', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { description: '', dueDate: '' },
			}),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).toEqual({ description: '' });
	});

	it('hands back the confirmed record, with the contact repaired', async () => {
		safeUpdate.mockResolvedValue({
			scheduleId: 'not-a-real-id',
			stakeholderId: '00000000-0000-0000-0000-000000000000',
			stakeholder: { id: 'real-one' },
		});

		const items = await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'creditSchedule',
			'update',
		);

		expect(items[0].json.stakeholderId).toBe('real-one');
	});
});

describe('executeSchedule — Delete', () => {
	// Both routes measured on the cobaia on 2026-07-26: 204, empty body. The
	// reference had them down as "to validate".
	it.each([
		['creditSchedule', 'creditScheduleId', '/schedules/credit'],
		['debitSchedule', 'debitScheduleId', '/schedules/debit'],
	])('deletes a %s at its own collection', async (resource, parameter, endpoint) => {
		apiRequest.mockResolvedValue(undefined);

		const items = await executeSchedule.call(
			context({ [parameter]: 'not-a-real-id' }),
			resource,
			'delete',
		);

		expect(apiCall(0)).toMatchObject({
			method: 'DELETE',
			endpoint: `${endpoint}/not-a-real-id`,
		});
		expect(items[0].json).toEqual({ id: 'not-a-real-id', deleted: true });
	});

	it('fails the item when no ID was given', async () => {
		const failure = executeSchedule.call(
			context({ creditScheduleId: '' }),
			'creditSchedule',
			'delete',
		);

		await expect(failure).rejects.toThrow(/ID/);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

/**
 * The same guard the stakeholders have had since 0.3.1: an operation the editor
 * offers and the handler does not route answers "not supported" at run time,
 * and only at run time.
 */
describe('the schedule operations the editor offers and the handler routes', () => {
	const description = new NiboEmpresas().description;

	const offered = (
		(description.properties.find(
			(prop) =>
				prop.name === 'operation' &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('creditSchedule'),
		)?.options ?? []) as Array<{ value: string }>
	).map((option) => option.value);

	it.each(offered)('routes "%s"', async (operation) => {
		apiRequest.mockResolvedValue({ scheduleId: 'not-a-real-id', type: 'Credit' });

		const items = await executeSchedule.call(
			context({
				...CREATE_FORM,
				creditScheduleId: 'not-a-real-id',
				updateFields: { description: 'CHANGED' },
				limit: 1,
			}),
			'creditSchedule',
			operation,
		);

		expect(items).toBeDefined();
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
