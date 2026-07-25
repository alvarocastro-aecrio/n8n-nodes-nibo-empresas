import type { IDataObject } from 'n8n-workflow';

import { deepMerge } from '../transport/merge';

/**
 * A customer as the API hands it back, trimmed to the fields this package
 * writes. The whole point of the merge is that a change to one of them never
 * costs the others — the API's PUT zeroes every field left out of the body.
 */
const CURRENT: IDataObject = {
	id: 'not-a-real-id',
	name: 'ACME LTDA',
	document: { number: '00000000000000', type: 'Cnpj' },
	communication: { email: 'billing@example.com', phone: '2130000000', contactName: 'Ada' },
	address: {
		line1: 'R EXAMPLE',
		number: 100,
		district: 'CENTRO',
		city: 'Rio de Janeiro',
		state: 'RJ',
		zipCode: '20000000',
	},
};

describe('deepMerge', () => {
	it('changes one nested field and leaves its siblings alone', () => {
		const merged = deepMerge(CURRENT, { communication: { phone: '2199999999' } });

		expect(merged.communication).toEqual({
			email: 'billing@example.com',
			phone: '2199999999',
			contactName: 'Ada',
		});
	});

	it('leaves every field that was not part of the change untouched', () => {
		const merged = deepMerge(CURRENT, { communication: { phone: '2199999999' } });

		expect(merged.name).toBe('ACME LTDA');
		expect(merged.document).toEqual({ number: '00000000000000', type: 'Cnpj' });
		expect(merged.address).toEqual(CURRENT.address);
	});

	// This is how a field is erased on purpose: adding it and leaving it blank.
	// Treating '' as "not informed" would make erasing a phone impossible.
	it('writes an empty value when the change carries one', () => {
		const merged = deepMerge(CURRENT, { communication: { phone: '' } });

		expect((merged.communication as IDataObject).phone).toBe('');
		expect((merged.communication as IDataObject).email).toBe('billing@example.com');
	});

	it('changes one address field without erasing the rest of the address', () => {
		const merged = deepMerge(CURRENT, { address: { zipCode: '20010000' } });

		expect(merged.address).toEqual({
			line1: 'R EXAMPLE',
			number: 100,
			district: 'CENTRO',
			city: 'Rio de Janeiro',
			state: 'RJ',
			zipCode: '20010000',
		});
	});

	it('adds a branch the record did not have yet', () => {
		const merged = deepMerge(
			{ name: 'ACME LTDA' },
			{ companyInformation: { companyName: 'Acme' } },
		);

		expect(merged).toEqual({ name: 'ACME LTDA', companyInformation: { companyName: 'Acme' } });
	});

	it('replaces an array instead of merging it element by element', () => {
		const merged = deepMerge({ tags: ['a', 'b'] }, { tags: ['c'] });

		expect(merged.tags).toEqual(['c']);
	});

	// The record it merges onto is what a GET just returned, and the caller
	// still holds it — the confirmation step compares against it.
	it('never touches the record it was given', () => {
		const before = JSON.stringify(CURRENT);

		deepMerge(CURRENT, { communication: { phone: '2199999999' }, name: 'OTHER LTDA' });

		expect(JSON.stringify(CURRENT)).toBe(before);
	});
});
