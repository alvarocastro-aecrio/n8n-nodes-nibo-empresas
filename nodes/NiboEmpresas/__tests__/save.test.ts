import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { niboCreate, niboSafeUpdate } from '../transport/save';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/request');

const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

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
});

describe('niboCreate', () => {
	// Measured 2026-07-25: the plain POST answers a bare JSON string, while the
	// FormatType=json suffix answers the whole record — with personType,
	// isCompany and document.type as the API filled them in. That is the entire
	// reason the create needs no read-back call.
	it('posts to the FormatType=json endpoint and returns the record the API stored', async () => {
		apiRequest.mockResolvedValue({ id: 'not-a-real-id', name: 'ACME LTDA', isCompany: true });

		const created = await niboCreate.call(context(), 0, '/customers', { name: 'ACME LTDA' });

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

	// The fallbacks below are the rearguard for the resources still to come:
	// POST answers a bare id in one of two shapes depending on the collection.
	it('falls back to the bare id when that is all the API answers', async () => {
		apiRequest.mockResolvedValue('not-a-real-id');

		const created = await niboCreate.call(context(), 0, '/customers', { name: 'ACME LTDA' });

		expect(created).toEqual({ id: 'not-a-real-id' });
	});

	it('falls back to the id wrapped in a data envelope', async () => {
		apiRequest.mockResolvedValue({ data: 'not-a-real-id' });

		const created = await niboCreate.call(context(), 0, '/customers', { name: 'ACME LTDA' });

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
