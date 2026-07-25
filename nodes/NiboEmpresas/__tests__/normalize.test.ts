import type { IDataObject } from 'n8n-workflow';

import { normalizeStakeholder, stakeholderWriteBody } from '../resources/stakeholder/normalize';

describe('normalizeStakeholder', () => {
	// The API takes CNPJ/CPF on a write and answers Cnpj/Cpf on a read. The node
	// hands out one spelling, so a workflow can compare against a constant.
	it('spells the document type the way the API accepts it, not the way it answers', () => {
		const record = normalizeStakeholder({
			name: 'ACME LTDA',
			document: { number: '00000000000000', type: 'Cnpj' },
		});

		expect(record.document).toEqual({ number: '00000000000000', type: 'CNPJ' });
	});

	it('does the same for a person', () => {
		const record = normalizeStakeholder({ document: { number: '00000000000', type: 'Cpf' } });

		expect((record.document as IDataObject).type).toBe('CPF');
	});

	it('accepts the type in any casing, which is what makes it work on the way in too', () => {
		for (const type of ['cnpj', 'CNPJ', 'Cnpj', ' cnpj ']) {
			const record = normalizeStakeholder({ document: { type } });

			expect((record.document as IDataObject).type).toBe('CNPJ');
		}
	});

	it('leaves a type it does not know alone instead of guessing', () => {
		const record = normalizeStakeholder({ document: { type: 'Passport' } });

		expect((record.document as IDataObject).type).toBe('Passport');
	});

	it('leaves a record with no document exactly as it is', () => {
		const record = normalizeStakeholder({ id: 'not-a-real-id', name: 'ACME LTDA' });

		expect(record).toEqual({ id: 'not-a-real-id', name: 'ACME LTDA' });
	});

	it('keeps every other field of the document untouched', () => {
		const record = normalizeStakeholder({
			document: { number: '00000000000000', type: 'Cnpj', extra: 'kept' },
		});

		expect(record.document).toEqual({ number: '00000000000000', type: 'CNPJ', extra: 'kept' });
	});

	it('never touches the record it was given', () => {
		const original: IDataObject = { document: { type: 'Cnpj' } };

		normalizeStakeholder(original);

		expect(original).toEqual({ document: { type: 'Cnpj' } });
	});
});

/**
 * Measured against the cobaia on 2026-07-25, while the v0.4.0 acceptance was
 * running: a `PUT` carrying the record exactly as a `GET` answered it comes
 * back HTTP 200 and writes **nothing**. The API mirrors `communication.phone`
 * and `communication.email` at the root of the record on the way out, and on
 * the way in the mirror wins — so the values just read overwrite the change.
 * Dropping the two mirrors makes the same write take, and the API fills them
 * back in from `communication`.
 */
describe('stakeholderWriteBody', () => {
	const READ_BACK: IDataObject = {
		id: 'not-a-real-id',
		name: 'ACME LTDA',
		email: 'billing@example.com',
		phone: '2130000000',
		document: { number: '00000000000000', type: 'Cnpj' },
		communication: { email: 'billing@example.com', phone: '2199999999' },
		address: { line1: 'R EXAMPLE', number: 100 },
	};

	it('drops the root fields the API mirrors, which would undo the change', () => {
		const body = stakeholderWriteBody(READ_BACK);

		expect(body).not.toHaveProperty('phone');
		expect(body).not.toHaveProperty('email');
	});

	it('keeps the branch that actually holds the values', () => {
		const body = stakeholderWriteBody(READ_BACK);

		expect(body.communication).toEqual({ email: 'billing@example.com', phone: '2199999999' });
	});

	// Everything else the read answers goes back untouched: the API's PUT zeroes
	// whatever is missing from the body, so dropping a field is never free.
	it('sends every other field back exactly as it came', () => {
		const body = stakeholderWriteBody(READ_BACK);

		expect(body).toEqual({
			id: 'not-a-real-id',
			name: 'ACME LTDA',
			document: { number: '00000000000000', type: 'Cnpj' },
			communication: { email: 'billing@example.com', phone: '2199999999' },
			address: { line1: 'R EXAMPLE', number: 100 },
		});
	});

	it('never touches the record it was given', () => {
		const original = { ...READ_BACK };

		stakeholderWriteBody(original);

		expect(original).toHaveProperty('phone');
	});
});
