import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';

import { niboCreate, niboSafeUpdate } from '../transport/save';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/request');
// Only `sleep` is replaced: the errors thrown below are real n8n classes.
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;
const waited = sleep as jest.MockedFunction<typeof sleep>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function context() {
	return {
		getNode: () => NODE,
	} as unknown as IExecuteFunctions;
}

/** (itemIndex, method, endpoint, qs, body) — the transport's own signature */
function call(index: number) {
	const [itemIndex, method, endpoint, qs, body] = apiRequest.mock.calls[index];
	return { itemIndex, method, endpoint, qs, body };
}

const STORED: IDataObject = {
	id: 'not-a-real-id',
	name: 'ACME LTDA',
	document: { number: '00000000000000', type: 'Cnpj' },
	communication: { email: 'billing@example.com', phone: '2130000000' },
	address: { line1: 'R EXAMPLE', number: 100, city: 'Rio de Janeiro', state: 'RJ' },
};

beforeEach(() => {
	apiRequest.mockReset();
	waited.mockClear();
});

/**
 * The pause between two calls of one operation.
 *
 * These cycles used to fire their calls back to back — `POST` then `GET`, or
 * `GET`/`PUT`/`GET` with nothing in between. This API answers 429 above roughly
 * fourteen calls a second and tightens that during business hours, and a node
 * that walks a portfolio spends that budget in bursts. Nothing here is waiting
 * on the millisecond; a call refused for going too fast costs far more than a
 * second.
 */
describe('the second of breathing between two calls of one operation', () => {
	it('waits between the write and the read that confirms it', async () => {
		apiRequest.mockResolvedValueOnce('an-id').mockResolvedValueOnce(STORED);

		await niboCreate.call(context(), 0, '/employees', { name: 'X' });

		expect(waited).toHaveBeenCalledTimes(1);
		expect(waited.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
	});

	it('waits between each of the three calls of the safe update', async () => {
		apiRequest
			.mockResolvedValueOnce(STORED)
			.mockResolvedValueOnce('')
			.mockResolvedValueOnce({ ...STORED, name: 'CHANGED' });

		await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', { name: 'CHANGED' });

		expect(waited).toHaveBeenCalledTimes(2);
		for (const [ms] of waited.mock.calls) {
			expect(ms).toBeGreaterThanOrEqual(1000);
		}
	});

	// One call is one call: nothing to pace against.
	it('does not wait when the creation answers with the record and reads nothing back', async () => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id', name: 'ACME LTDA' });

		await niboCreate.call(context(), 0, '/customers', { name: 'X' }, { answersWithTheRecord: true });

		expect(waited).not.toHaveBeenCalled();
	});
});

describe('niboCreate', () => {
	// Measured 2026-07-25: the plain POST answers a bare JSON string, while the
	// FormatType=json suffix answers the whole record — with personType,
	// isCompany and document.type as the API filled them in. That is the entire
	// reason the create needs no read-back call.
	it('posts to the FormatType=json endpoint and returns the record the API stored', async () => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id', name: 'ACME LTDA', isCompany: true });

		const created = await niboCreate.call(
			context(),
			0,
			'/customers',
			{ name: 'ACME LTDA' },
			{ answersWithTheRecord: true },
		);

		expect(call(0).method).toBe('POST');
		expect(call(0).endpoint).toBe('/customers/FormatType=json');
		expect(call(0).body).toEqual({ name: 'ACME LTDA' });
		expect(created).toEqual({ id: 'not-a-real-id', name: 'ACME LTDA', isCompany: true });
	});

	it('carries the item index down to the transport', async () => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id' });

		await niboCreate.call(context(), 3, '/customers', { name: 'ACME LTDA' });

		expect(call(0).itemIndex).toBe(3);
	});

	/**
	 * Measured on the cobaia on 2026-07-25: the FormatType=json suffix exists on
	 * /customers and /suppliers and answers 404 on /employees and /partners.
	 * Where it is missing the plain POST answers a bare id, and the record has
	 * to be read back — otherwise a workflow would get a different shape from
	 * Create depending on which collection it wrote to.
	 */
	it('posts plainly and reads the record back where the suffix does not exist', async () => {
		apiRequest
			.mockResolvedValueOnce('not-a-real-id')
			.mockResolvedValueOnce({ id: 'not-a-real-id', name: 'ADA LOVELACE' });

		const created = await niboCreate.call(context(), 0, '/employees', { name: 'ADA LOVELACE' });

		expect(call(0)).toMatchObject({ method: 'POST', endpoint: '/employees' });
		expect(call(1)).toMatchObject({ method: 'GET', endpoint: '/employees/not-a-real-id' });
		expect(created).toEqual({ id: 'not-a-real-id', name: 'ADA LOVELACE' });
	});

	/**
	 * The schedules read where they are not written. `GET /schedules/debit/{id}`
	 * is a 404 as a route — the get-by-id of this API is `/schedules/credit/{id}`
	 * for both kinds — so the collection a record is created in is not the
	 * collection it can be read back from.
	 */
	it('reads the record back where it can be read, not where it was written', async () => {
		apiRequest
			.mockResolvedValueOnce('not-a-real-id')
			.mockResolvedValueOnce({ scheduleId: 'not-a-real-id', type: 'Debit' });

		const created = await niboCreate.call(
			context(),
			0,
			'/schedules/debit',
			{ dueDate: '2026-08-10' },
			{ readEndpoint: '/schedules/credit' },
		);

		expect(call(0)).toMatchObject({ method: 'POST', endpoint: '/schedules/debit' });
		expect(call(1)).toMatchObject({ method: 'GET', endpoint: '/schedules/credit/not-a-real-id' });
		expect(created).toEqual({ scheduleId: 'not-a-real-id', type: 'Debit' });
	});

	// And where nobody says otherwise nothing changes at all, which is what the
	// four stakeholder collections depend on.
	it('reads it back from the collection it was written to when nobody says otherwise', async () => {
		apiRequest.mockResolvedValueOnce('not-a-real-id').mockResolvedValueOnce({ id: 'not-a-real-id' });

		await niboCreate.call(context(), 0, '/employees', { name: 'ADA LOVELACE' });

		expect(call(1)).toMatchObject({ method: 'GET', endpoint: '/employees/not-a-real-id' });
	});

	it('still answers with the id when the read-back gives nothing to show', async () => {
		apiRequest.mockResolvedValueOnce('not-a-real-id').mockResolvedValueOnce('');

		const created = await niboCreate.call(context(), 0, '/employees', { name: 'ADA LOVELACE' });

		expect(created).toEqual({ id: 'not-a-real-id' });
	});

	// The fallbacks below are the rearguard for the resources still to come:
	// POST answers a bare id in one of two shapes depending on the collection.
	it('falls back to the bare id when that is all the API answers', async () => {
		apiRequest.mockResolvedValue('not-a-real-id');

		const created = await niboCreate.call(
			context(),
			0,
			'/customers',
			{ name: 'ACME LTDA' },
			{ answersWithTheRecord: true },
		);

		expect(created).toEqual({ id: 'not-a-real-id' });
	});

	it('falls back to the id wrapped in a data envelope', async () => {
		apiRequest.mockResolvedValue({ data: 'not-a-real-id' });

		const created = await niboCreate.call(
			context(),
			0,
			'/customers',
			{ name: 'ACME LTDA' },
			{ answersWithTheRecord: true },
		);

		expect(created).toEqual({ id: 'not-a-real-id' });
	});

	it('fails instead of returning an empty record when the answer holds nothing', async () => {
		apiRequest.mockResolvedValue('');

		const failure = niboCreate.call(context(), 2, '/customers', { name: 'ACME LTDA' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 2 } });
	});
});

describe('niboSafeUpdate', () => {
	/** GET the stored record, empty answer to the PUT, then the confirmation GET */
	function apiAnswering(confirmation: IDataObject, putAnswer: unknown = '') {
		apiRequest
			.mockResolvedValueOnce(STORED)
			.mockResolvedValueOnce(putAnswer)
			.mockResolvedValueOnce(confirmation);
	}

	it('reads, writes and reads again — in that order', async () => {
		apiAnswering({ ...STORED, communication: { email: 'billing@example.com', phone: '2199' } });

		await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			communication: { phone: '2199' },
		});

		expect(apiRequest).toHaveBeenCalledTimes(3);
		expect(call(0).method).toBe('GET');
		expect(call(1).method).toBe('PUT');
		expect(call(2).method).toBe('GET');
		expect(call(0).endpoint).toBe('/customers/not-a-real-id');
		expect(call(1).endpoint).toBe('/customers/not-a-real-id');
	});

	/**
	 * The same asymmetry the create has, and here it costs two of the three
	 * calls: `GET /schedules/debit/{id}` is a 404 as a route, so the cycle reads
	 * a debit through the universal endpoint and writes it back to its own.
	 */
	it('reads at the universal endpoint and writes at the collection of the record', async () => {
		apiAnswering({ scheduleId: 'not-a-real-id', description: 'CHANGED' });
		apiRequest.mockReset();
		apiRequest
			.mockResolvedValueOnce({ scheduleId: 'not-a-real-id', description: 'BEFORE' })
			.mockResolvedValueOnce('')
			.mockResolvedValueOnce({ scheduleId: 'not-a-real-id', description: 'CHANGED' });

		await niboSafeUpdate.call(
			context(),
			0,
			'/schedules/debit',
			'not-a-real-id',
			{ description: 'CHANGED' },
			{ readEndpoint: '/schedules/credit' },
		);

		expect(call(0)).toMatchObject({ method: 'GET', endpoint: '/schedules/credit/not-a-real-id' });
		expect(call(1)).toMatchObject({ method: 'PUT', endpoint: '/schedules/debit/not-a-real-id' });
		expect(call(2)).toMatchObject({ method: 'GET', endpoint: '/schedules/credit/not-a-real-id' });
	});

	// The whole reason this cycle exists: the PUT body is the record as stored,
	// with the change merged in. Anything less zeroes the fields left out.
	it('sends the complete merged record in the PUT, not just what changed', async () => {
		apiAnswering({ ...STORED, communication: { email: 'billing@example.com', phone: '2199' } });

		await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			communication: { phone: '2199' },
		});

		expect(call(1).body).toEqual({
			...STORED,
			communication: { email: 'billing@example.com', phone: '2199' },
		});
	});

	it('returns the record as the confirmation read it back', async () => {
		const confirmed = { ...STORED, communication: { email: 'billing@example.com', phone: '2199' } };
		apiAnswering(confirmed);

		const result = await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			communication: { phone: '2199' },
		});

		expect(result).toEqual(confirmed);
	});

	// A malformed payload answers {"Messages":[""]} with HTTP 200 and applies
	// nothing at all. It is the single largest source of silent bugs in this API.
	it('treats a Messages answer to the PUT as a failure, never as success', async () => {
		apiAnswering(STORED, { Messages: [''] });

		const failure = niboSafeUpdate.call(context(), 1, '/customers', 'not-a-real-id', {
			communication: { phone: '2199' },
		});

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 1 } });
	});

	it('fails when the confirmation shows the change did not take', async () => {
		apiAnswering(STORED);

		const failure = niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			communication: { phone: '2199' },
		});

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(/communication\.phone/);
	});

	// The API answers `Cnpj` on a read and takes `CNPJ` on a write. Without the
	// normalization the confirmation would accuse every document change of
	// having failed.
	it('does not accuse a document change that only differs in casing', async () => {
		apiAnswering({ ...STORED, document: { number: '11111111111', type: 'Cpf' } });

		const result = await niboSafeUpdate.call(
			context(),
			0,
			'/customers',
			'not-a-real-id',
			{ document: { number: '11111111111', type: 'CPF' } },
			{ normalize: (record) => normalizeDocumentType(record) },
		);

		expect(result).toMatchObject({ document: { number: '11111111111', type: 'Cpf' } });
	});

	// Adding a field and leaving it blank is how a stored value is erased. The
	// API answers such a field as null, which must not read as "did not apply".
	it('accepts null as the answer to a field that was erased on purpose', async () => {
		apiAnswering({ ...STORED, communication: { email: 'billing@example.com', phone: null } });

		const result = await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			communication: { phone: '' },
		});

		expect(result).toBeDefined();
	});

	// Measured on the cobaia: a PUT carrying the record exactly as the GET
	// answered it writes nothing at all. The resource knows which fields the API
	// mirrors and hands in a function to drop them; the transport does not.
	it('puts the body the resource prepared, not the merged record raw', async () => {
		apiAnswering({ ...STORED, communication: { email: 'billing@example.com', phone: '2199' } });

		await niboSafeUpdate.call(
			context(),
			0,
			'/customers',
			'not-a-real-id',
			{ communication: { phone: '2199' } },
			{
				writeBody: (record) => {
					const { id, ...rest } = record;
					return rest;
				},
			},
		);

		expect(call(1).body).not.toHaveProperty('id');
		expect(call(1).body).toMatchObject({ communication: { phone: '2199' } });
	});

	// This API stores `address.zipCode` padded with a trailing space: ask for
	// "22000000" and every later read answers "22000000 ". It applied the
	// change; reporting it as refused would make the confirmation cry wolf.
	it('does not cry wolf when the API pads the value it stored', async () => {
		apiAnswering({ ...STORED, address: { ...(STORED.address as object), zipCode: '22000000 ' } });

		const result = await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			address: { zipCode: '22000000' },
		});

		expect(result).toBeDefined();
	});

	it('reads a value the API padded into blankness as the erasure it was', async () => {
		apiAnswering({ ...STORED, communication: { email: 'billing@example.com', phone: ' ' } });

		const result = await niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {
			communication: { phone: '' },
		});

		expect(result).toBeDefined();
	});

	it('refuses to rewrite the record with itself when nothing was informed', async () => {
		const failure = niboSafeUpdate.call(context(), 0, '/customers', 'not-a-real-id', {});

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

/** Stands in for the resource's own normalizer, which the transport never imports */
function normalizeDocumentType(record: IDataObject): IDataObject {
	const document = record.document as IDataObject | undefined;
	if (document === undefined || typeof document.type !== 'string') {
		return record;
	}
	return { ...record, document: { ...document, type: document.type.toUpperCase() } };
}
