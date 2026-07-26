import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

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
/**
 * The error that blames the wrong thing.
 *
 * Measured on the cobaia on 2026-07-26: a cost category on a receivable answers
 * HTTP 500 `validation_error` — *"Valor do agendamento deve ser positivo"* — to
 * someone who typed a positive number, and a revenue category on a payable
 * answers the mirror of it. The category's type is what signs the line, so the
 * total goes the wrong way and the validation complains about the total.
 *
 * The list on the field makes that unreachable for whoever picks from it. This
 * is for whoever does not: an expression, or an ID pasted by hand.
 */
describe('executeSchedule — the error that is really about the category', () => {
	function apiError(description: string) {
		return new NodeApiError(
			NODE,
			{ error: { error: 'validation_error', error_description: description } },
			{ message: `Nibo rejected the request: ${description}`, httpCode: '500' },
		);
	}

	const CREATE = {
		stakeholderId: 'contact',
		dueDate: '2026-08-10',
		scheduleDate: '2026-08-10',
		categories: { category: [{ categoryId: 'wrong-kind', value: 100 }] },
	};

	it.each([
		['creditSchedule', 'Valor do agendamento deve ser positivo'],
		['debitSchedule', 'Valor do agendamento de pagamento deve ser negativo'],
	])('tells a %s author that the category is the likely cause', async (resource, description) => {
		create.mockRejectedValue(apiError(description));

		const failure = executeSchedule.call(context(CREATE), resource, 'create');

		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/categor/i),
		});
	});

	/**
	 * The third sentence of this family, and the one that names a category kind
	 * without saying which field carries it.
	 *
	 * Measured on the cobaia on 2026-07-26, on both sides: a discount category —
	 * "Descontos Recebidos" on a receivable, "Descontos Concedidos" on a payable —
	 * is refused with *"Categoria de juros, multa ou desconto invalida"*. Those
	 * categories are Nibo's own, filled in when a receipt carries interest or a
	 * discount, and they are not something a schedule is filed under. The list on
	 * the field no longer offers them; this is for the ID that came from somewhere
	 * else.
	 */
	it('explains the refusal of one of Nibo automatic categories', async () => {
		create.mockRejectedValue(apiError('Categoria de juros, multa ou desconto invalida'));

		const failure = executeSchedule.call(context(CREATE), 'creditSchedule', 'create');

		await expect(failure).rejects.toThrow(/Categoria de juros, multa ou desconto invalida/);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/automatic categor/i),
		});
	});

	/**
	 * Measured on the cobaia on 2026-07-26, both ways: with the split off, two
	 * category lines are refused with *"Utilize apenas uma categoria"*; turned on
	 * in Nibo, the same two are accepted and the schedule's amount comes back as
	 * their sum. It is a setting of the organization and the API never says
	 * whether it is on — so the node explains the refusal and, above all, says
	 * that it can be turned on.
	 */
	it('explains the refusal of a schedule split across several categories', async () => {
		create.mockRejectedValue(apiError('Utilize apenas uma categoria.'));

		const failure = executeSchedule.call(
			context({
				...CREATE_FORM,
				categories: {
					category: [
						{ categoryId: 'a', value: 100 },
						{ categoryId: 'b', value: 50 },
					],
				},
			}),
			'creditSchedule',
			'create',
		);

		await expect(failure).rejects.toThrow(/Utilize apenas uma categoria/);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/enabled for the organization in Nibo/i),
		});
	});

	// The API's own sentence is the evidence; it must survive, not be replaced.
	it('keeps what the API said', async () => {
		create.mockRejectedValue(apiError('Valor do agendamento deve ser positivo'));

		const failure = executeSchedule.call(context(CREATE), 'creditSchedule', 'create');

		await expect(failure).rejects.toThrow(/Valor do agendamento deve ser positivo/);
	});

	// Only where it can be true. A rejection about something else is not about a
	// category, and a node that answered "it is probably the category" to every
	// failure would be worse than one that said nothing.
	it('says nothing extra about a rejection on another subject', async () => {
		create.mockRejectedValue(apiError('Stakeholder não encontrado'));

		const failure = executeSchedule.call(context(CREATE), 'creditSchedule', 'create');

		await expect(failure).rejects.not.toMatchObject({
			description: expect.stringMatching(/categor/i),
		});
	});

	it('says nothing extra on a read, where no category was sent', async () => {
		listRequest.mockRejectedValue(apiError('Valor do agendamento deve ser positivo'));

		const failure = executeSchedule.call(
			context({ returnAll: true }),
			'creditSchedule',
			'list',
		);

		await expect(failure).rejects.not.toMatchObject({
			description: expect.stringMatching(/categor/i),
		});
	});
});

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

	/**
	 * Flat all the way down: unlike a stakeholder, a schedule has no branches.
	 *
	 * Description and the flag are in here since 0.7.1 even untouched, because
	 * they are fields of the form now rather than entries of a menu — and on a
	 * creation an empty description is the same as no description, and a flag
	 * left down is the API's own default. Nothing else that was not filled in
	 * reaches the payload.
	 */
	it('sends the flat payload the API takes, with the dates as plain days', async () => {
		await executeSchedule.call(context(CREATE_FORM), 'creditSchedule', 'create');

		expect(payloadSent()).toEqual({
			stakeholderId: 'not-a-real-contact',
			dueDate: '2026-08-10',
			scheduleDate: '2026-08-10',
			categories: [{ categoryId: 'not-a-real-category', value: 1226.12 }],
			description: '',
			isFlagged: false,
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

	/**
	 * Both moved onto the screen in 0.7.1, and moving a field is not only a
	 * matter of where it is drawn: the handler read them out of the menu, so the
	 * first version of that change built a payload with neither in it. The form
	 * looked right and the schedule was created without a description.
	 */
	it.each([
		['description', 'SERVIÇOS DE JULHO'],
		['isFlagged', true],
	])('reads %s from the body of the form, where it now lives', async (name, value) => {
		await executeSchedule.call(
			context({ ...CREATE_FORM, [name]: value }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent()).toMatchObject({ [name]: value });
	});

	// And a node saved under 0.7.0 still carries them in the menu, where its
	// author put them. That value is the one that wins.
	it('still honours the two from the menu of a node saved before they moved', async () => {
		await executeSchedule.call(
			context({
				...CREATE_FORM,
				additionalFields: { description: 'DA VERSÃO ANTERIOR', isFlagged: true },
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent()).toMatchObject({
			description: 'DA VERSÃO ANTERIOR',
			isFlagged: true,
		});
	});

	/**
	 * The contact arrives in two shapes and neither is negotiable.
	 *
	 * Since 0.8.0 the field is the editor's search component, which stores
	 * `{__rl, mode, value}`. A node saved before it stores the plain ID, and
	 * `getNodeParameters` was measured to keep that string rather than discard
	 * it — so the handler reads both, and a workflow built last week goes on
	 * running without being opened.
	 */
	it('reads the contact out of what the search component stores', async () => {
		await executeSchedule.call(
			context({
				...CREATE_FORM,
				stakeholderId: { __rl: true, mode: 'list', value: 'picked-from-the-list' },
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().stakeholderId).toBe('picked-from-the-list');
	});

	it('still reads the plain ID a node saved before 0.8.0 carries', async () => {
		await executeSchedule.call(
			context({ ...CREATE_FORM, stakeholderId: 'saved-as-a-string' }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().stakeholderId).toBe('saved-as-a-string');
	});

	it.each([
		[{ __rl: true, mode: 'list', value: '' }],
		[{ __rl: true, mode: 'id', value: '   ' }],
		[''],
	])('refuses %s before any call is made', async (stakeholderId) => {
		const failure = executeSchedule.call(
			context({ ...CREATE_FORM, stakeholderId }),
			'creditSchedule',
			'create',
		);

		await expect(failure).rejects.toThrow(/contact/i);
		expect(create).not.toHaveBeenCalled();
	});

	/**
	 * The detail of one line, which the API takes inside the line itself —
	 * measured on the cobaia before it was offered, since the project's own
	 * reference had flagged the field as suspicious.
	 */
	it('sends the detail of a category line when one was written', async () => {
		await executeSchedule.call(
			context({
				...CREATE_FORM,
				categories: {
					category: [{ categoryId: 'cat', value: 10, description: 'serviços de setembro' }],
				},
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().categories).toEqual([
			{ categoryId: 'cat', value: 10, description: 'serviços de setembro' },
		]);
	});

	// A line without a detail sends no empty detail: the same rule the rest of
	// the payload follows, and on an update it is what erases one.
	it.each([[''], ['   '], [undefined]])('leaves the detail out when it is %s', async (description) => {
		await executeSchedule.call(
			context({
				...CREATE_FORM,
				categories: { category: [{ categoryId: 'cat', value: 10, description }] },
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().categories).toEqual([{ categoryId: 'cat', value: 10 }]);
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

/**
 * The apportionment by cost centre — what a schedule can carry and this node
 * offered no way to say.
 *
 * Measured on the test company on 2026-07-26. `costCenterValueType` is the
 * switch and it is not guessable: **1 is percentage, 0 is value**. Sending the
 * wrong pair — type 0 with `percent` — answers 500 complaining about the sum,
 * never about the pair, which is why the node explains that refusal.
 *
 * And unlike the split across **categories**, this one needs nothing turned on
 * in Nibo: the test company has the category split off and took two cost-centre
 * lines in the same run.
 */
describe('executeSchedule — the apportionment on a creation', () => {
	function payloadSent(): IDataObject {
		return create.mock.calls[0][2];
	}

	function creating(apportionment: IDataObject = {}) {
		return context({ ...CREATE_FORM, ...apportionment });
	}

	/**
	 * The promise every schedule saved before 0.9.0 depends on: a form with no
	 * apportionment sends the same body it sent in 0.8.2, down to the absence of
	 * both keys.
	 */
	it('sends neither key when there is no line at all', async () => {
		await executeSchedule.call(creating(), 'creditSchedule', 'create');

		expect(payloadSent()).not.toHaveProperty('costCenters');
		expect(payloadSent()).not.toHaveProperty('costCenterValueType');
	});

	it('sends neither key when the collection was opened and left empty', async () => {
		await executeSchedule.call(
			creating({ costCenters: { costCenter: [] }, apportionBy: 'percent' }),
			'creditSchedule',
			'create',
		);

		expect(payloadSent()).not.toHaveProperty('costCenters');
		expect(payloadSent()).not.toHaveProperty('costCenterValueType');
	});

	// 1 is percentage — measured, because nothing about 0 and 1 says which.
	it('writes a percentage share under percent, with the type that means percentage', async () => {
		await executeSchedule.call(
			creating({
				apportionBy: 'percent',
				costCenters: { costCenter: [{ costCenterId: 'centre-a', share: 60 }] },
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().costCenterValueType).toBe(1);
		expect(payloadSent().costCenters).toEqual([{ costCenterId: 'centre-a', percent: 60 }]);
	});

	// And 0 is value.
	it('writes an amount share under value, with the type that means value', async () => {
		await executeSchedule.call(
			creating({
				apportionBy: 'value',
				costCenters: { costCenter: [{ costCenterId: 'centre-a', share: 300 }] },
			}),
			'debitSchedule',
			'create',
		);

		expect(payloadSent().costCenterValueType).toBe(0);
		expect(payloadSent().costCenters).toEqual([{ costCenterId: 'centre-a', value: 300 }]);
	});

	/**
	 * Never both, and it is the form that makes that true: one box for the share,
	 * and which key it becomes is decided once, above it. The wrong pair is a 500
	 * that talks about the sum.
	 */
	it.each([
		['percent', 'value'],
		['value', 'percent'],
	])('sends %s and never %s in the same line', async (chosen, absent) => {
		await executeSchedule.call(
			creating({
				apportionBy: chosen,
				costCenters: { costCenter: [{ costCenterId: 'centre-a', share: 40 }] },
			}),
			'creditSchedule',
			'create',
		);

		expect((payloadSent().costCenters as IDataObject[])[0]).not.toHaveProperty(absent);
	});

	// Two lines of 60 and 40 were measured and accepted; 60 and 30 were refused.
	it('sends every line it was given, in the order they were added', async () => {
		await executeSchedule.call(
			creating({
				apportionBy: 'percent',
				costCenters: {
					costCenter: [
						{ costCenterId: 'centre-a', share: 60 },
						{ costCenterId: 'centre-b', share: 40 },
					],
				},
			}),
			'creditSchedule',
			'create',
		);

		expect(payloadSent().costCenters).toEqual([
			{ costCenterId: 'centre-a', percent: 60 },
			{ costCenterId: 'centre-b', percent: 40 },
		]);
	});

	it('refuses a line that names no cost center, while it is still cheap to refuse', async () => {
		const failure = executeSchedule.call(
			creating({
				apportionBy: 'percent',
				costCenters: { costCenter: [{ costCenterId: '', share: 60 }] },
			}),
			'creditSchedule',
			'create',
		);

		await expect(failure).rejects.toThrow(/no cost center/i);
		expect(create).not.toHaveBeenCalled();
	});
});

/**
 * The two refusals the API answers when the shares do not add up.
 *
 * Both say what happened and neither says that the pair type↔field may be the
 * wrong way round — which is the mistake that produces the first of them. The
 * node keeps the API's own words and adds that underneath, exactly as it has
 * done for the category of the wrong kind since 0.7.0.
 */
describe('executeSchedule — the errors that are about the apportionment', () => {
	function apiError(description: string) {
		return new NodeApiError(
			NODE,
			{ error: { error: 'validation_error', error_description: description } },
			{ message: `Nibo rejected the request: ${description}`, httpCode: '500' },
		);
	}

	const FORM = {
		...CREATE_FORM,
		apportionBy: 'percent',
		costCenters: { costCenter: [{ costCenterId: 'centre-a', share: 60 }] },
	};

	it.each([
		['A soma do percentual total dos Centros de Custo deve ser de 100%'],
		['A soma dos valores totais dos Centros de Custo deve ser igual ao valor do agendamento.'],
	])('explains "%s"', async (said) => {
		create.mockRejectedValue(apiError(said));

		const failure = executeSchedule.call(context(FORM), 'creditSchedule', 'create');

		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/Apportion By/),
		});
	});

	it('keeps what the API said, and adds to it', async () => {
		const said = 'A soma do percentual total dos Centros de Custo deve ser de 100%';
		create.mockRejectedValue(apiError(said));

		const failure = executeSchedule.call(context(FORM), 'creditSchedule', 'create');

		await expect(failure).rejects.toMatchObject({
			message: expect.stringContaining('100%'),
		});
	});

	// The same rule the category explanation follows: a node that answered "it is
	// probably the apportionment" to every failure would be worse than one that
	// said nothing.
	it('says nothing extra about a refusal that is not about the sums', async () => {
		create.mockRejectedValue(apiError('Stakeholder is not compatible'));

		const failure = executeSchedule.call(context(FORM), 'creditSchedule', 'create');

		await expect(failure).rejects.not.toMatchObject({
			description: expect.stringMatching(/Apportion By/),
		});
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

	/**
	 * The apportionment on an update, and the measurement that is the whole of
	 * this slice.
	 *
	 * On 2026-07-26, on the test company: a `PUT` that does not mention
	 * `costCenters` answers 204 and the apportionment **disappears** from the
	 * record, while a `PUT` returning `costCenters` in the exact shape the `GET`
	 * hands over keeps it. This node has always sent the whole record back — the
	 * safe cycle reads, merges and writes — so the second is what it does, and
	 * nothing about that had to change. This test is that fact, held in place.
	 */
	it('leaves the apportionment alone when the field was not added', async () => {
		await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).not.toHaveProperty('costCenters');
		expect(updateCall().changes).not.toHaveProperty('costCenterValueType');
	});

	// The same rule the category lines follow, and the only thing a partial array
	// could mean: the merge replaces an array whole.
	it('replaces the apportionment whole when lines were added', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: {
					apportionBy: 'percent',
					costCenters: {
						costCenter: [
							{ costCenterId: 'centre-a', share: 70 },
							{ costCenterId: 'centre-b', share: 30 },
						],
					},
				},
			}),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).toEqual({
			costCenterValueType: 1,
			costCenters: [
				{ costCenterId: 'centre-a', percent: 70 },
				{ costCenterId: 'centre-b', percent: 30 },
			],
		});
	});

	/**
	 * Apportion By is what the number in a line means, so on its own it means
	 * nothing: there is no line for it to describe. It travels only alongside
	 * lines, which is what keeps this from silently rewriting the type of an
	 * apportionment somebody else set.
	 */
	it('changes nothing when Apportion By was added with no line', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { apportionBy: 'value' },
			}),
			'creditSchedule',
			'update',
		);

		// Nothing at all — which the transport then refuses as "an update that
		// rewrites the record with itself", where every resource is caught.
		expect(updateCall().changes).toEqual({});
	});

	/**
	 * And lines added without it are refused rather than defaulted.
	 *
	 * On a creation Apportion By is always on the screen. Here it is an entry of
	 * a menu, and lines added without it would be written under whichever key the
	 * node happened to default to — turning the amounts of a value apportionment
	 * into percentages, quietly, on a record that already had one.
	 */
	it('asks for Apportion By when lines were added without it', async () => {
		const failure = executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { costCenters: { costCenter: [{ costCenterId: 'centre-a', share: 70 }] } },
			}),
			'creditSchedule',
			'update',
		);

		await expect(failure).rejects.toThrow(/how to read it/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/Apportion By/),
		});
	});

	/**
	 * Without this the confirmation would report every apportionment update as
	 * having failed. The `GET` answers a line as `{costCenterId, percent, value,
	 * costCenterDescription}` where the update asked for `{costCenterId,
	 * percent}`, and comparing those two shapes as they stand can only ever say
	 * "not applied".
	 *
	 * It compares the **cost centres**, and deliberately not the shares. Measured
	 * against the test company on 2026-07-26, while accepting this very version:
	 *
	 * - **The `value` a read answers is the percentage applied twice.** A 60%
	 *   line of a schedule of 1000 comes back with `value` 360, and a line asked
	 *   for as `value` 300 comes back as `percent` 30 with `value` 90. The
	 *   percentage is right in both; the amount is `percent × percent × total`.
	 *   Comparing by it would fail an update that worked.
	 * - **The order is not kept either.** Two lines sent A then B came back B
	 *   then A, so the list is compared as a set.
	 *
	 * What the confirmation still catches is what it exists for: an apportionment
	 * that did not take at all, or took with the wrong cost centres.
	 */
	it('compares an apportionment by its cost centres, not by shares the API recomputes', async () => {
		await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'creditSchedule',
			'update',
		);

		const normalize = updateCall().options?.normalize;

		expect(
			normalize?.({
				costCenterValueType: 1,
				costCenters: [
					{ costCenterId: 'centre-a', percent: 60, value: 360, costCenterDescription: 'Rio' },
				],
			}),
		).toEqual({ costCenterValueType: 1, costCenters: ['centre-a'] });
	});

	/**
	 * The case that found it: the node asks for `value` 300 and the API answers
	 * `value` 90 on the very same line, having stored the percentage correctly.
	 * Compared by the amount, that is a change reported as refused; compared by
	 * the cost centre, the two agree — which they should, because they do.
	 */
	it('reads an asked-for value and a recomputed one as the same line', () => {
		const { scheduleComparable } = jest.requireActual('../resources/schedule/normalize');

		const asked = scheduleComparable({
			costCenterValueType: 0,
			costCenters: [{ costCenterId: 'centre-a', value: 300 }],
		});
		const answered = scheduleComparable({
			costCenterValueType: 0,
			costCenters: [{ costCenterId: 'centre-a', percent: 30, value: 90, costCenterDescription: 'Rio' }],
		});

		expect(asked).toEqual(answered);
	});

	// Two lines sent A then B came back B then A, measured on 2026-07-26.
	it('reads the same two cost centres in either order as the same apportionment', () => {
		const { scheduleComparable } = jest.requireActual('../resources/schedule/normalize');

		const sent = scheduleComparable({
			costCenterValueType: 1,
			costCenters: [
				{ costCenterId: 'centre-a', percent: 60 },
				{ costCenterId: 'centre-b', percent: 40 },
			],
		});
		const answered = scheduleComparable({
			costCenterValueType: 1,
			costCenters: [
				{ costCenterId: 'centre-b', percent: 40, value: 160 },
				{ costCenterId: 'centre-a', percent: 60, value: 360 },
			],
		});

		expect(sent).toEqual(answered);
	});

	// And it still catches what it is for: the wrong centres, or none at all.
	it('still reads a different set of cost centres as a different apportionment', () => {
		const { scheduleComparable } = jest.requireActual('../resources/schedule/normalize');

		expect(
			scheduleComparable({ costCenters: [{ costCenterId: 'centre-a' }] }),
		).not.toEqual(scheduleComparable({ costCenters: [{ costCenterId: 'centre-b' }] }));
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

	/**
	 * The contact of an update arrives in the same two shapes as the contact of a
	 * creation, and is read by the same code — the field is the same field, and
	 * the handler cannot tell which form it came from anyway.
	 */
	it('reads the contact of an update out of what the search component stores', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { stakeholderId: { __rl: true, mode: 'list', value: 'picked-from-the-list' } },
			}),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).toEqual({ stakeholderId: 'picked-from-the-list' });
	});

	it('still reads the plain ID an update saved before 0.8.0 carries', async () => {
		await executeSchedule.call(
			context({
				creditScheduleId: 'not-a-real-id',
				updateFields: { stakeholderId: 'saved-as-a-string' },
			}),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).toEqual({ stakeholderId: 'saved-as-a-string' });
	});

	/**
	 * Added and left empty, it is refused rather than written — the same answer
	 * the category lines give, and for the same reason: a schedule with no
	 * contact is not a schedule this API keeps. Writing the emptiness would
	 * either be refused by the API in words about something else, or take the
	 * contact off a record nobody meant to touch.
	 */
	it.each([[{ __rl: true, mode: 'list', value: '' }], ['']])(
		'refuses an update whose contact was added as %s',
		async (stakeholderId) => {
			const failure = executeSchedule.call(
				context({ creditScheduleId: 'not-a-real-id', updateFields: { stakeholderId } }),
				'creditSchedule',
				'update',
			);

			await expect(failure).rejects.toThrow(/contact/i);
			expect(safeUpdate).not.toHaveBeenCalled();
		},
	);

	// And left out of the menu it is not touched, which is the whole promise of
	// this operation.
	it('leaves the contact alone when it was not added', async () => {
		await executeSchedule.call(
			context({ creditScheduleId: 'not-a-real-id', updateFields: { description: 'CHANGED' } }),
			'creditSchedule',
			'update',
		);

		expect(updateCall().changes).not.toHaveProperty('stakeholderId');
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
