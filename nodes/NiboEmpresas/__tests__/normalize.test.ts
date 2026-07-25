import type { IDataObject } from 'n8n-workflow';

import { normalizeStakeholder } from '../resources/stakeholder/normalize';

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
