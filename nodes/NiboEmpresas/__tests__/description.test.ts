import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';

const description = new NiboEmpresas().description;

function property(name: string) {
	return description.properties.find((prop) => prop.name === name);
}

/** The fields offered inside a collection, e.g. Additional Fields */
function collectionFields(collection: string): string[] {
	return ((property(collection)?.options ?? []) as INodeProperties[]).map((field) => field.name);
}

function fieldOf(collection: string, name: string): INodeProperties | undefined {
	return ((property(collection)?.options ?? []) as INodeProperties[]).find(
		(field) => field.name === name,
	);
}

describe('NiboEmpresas — the mode switch as the editor sees it', () => {
	/**
	 * The n8n editor reserves the exact parameter name `authentication`: it
	 * treats such a field as the node's "main auth field", removes it from the
	 * parameter list (shouldDisplayNodeParameter returns false for it) and
	 * redraws it inside the credentials block, where every option has to be
	 * backed by a credential of its own.
	 *
	 * The per-item mode is backed by no credential — that is the entire point
	 * of it — so under that name the option is listed but selecting it does
	 * nothing at all. Measured against n8n 2.18.5 and fixed in 0.3.1; this test
	 * exists so the name never comes back.
	 */
	it('never names a parameter `authentication`', () => {
		expect(description.properties.map((prop) => prop.name)).not.toContain('authentication');
	});

	it('offers both modes, with the credential one as the default', () => {
		const authMode = property('authMode');
		const values = (authMode?.options as INodePropertyOptions[]).map((option) => option.value);

		expect(values).toEqual(['credential', 'field']);
		expect(authMode?.default).toBe('credential');
		expect(authMode?.displayName).toBe('Authentication');
	});

	it('ties the credential to the mode, so it disappears when the token is per item', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.name).toBe('niboEmpresasApi');
		expect(credential.required).toBe(true);
		expect(credential.displayOptions?.show).toEqual({ authMode: ['credential'] });
	});

	it('shows the token field only in the per-item mode, and masks it', () => {
		const apiToken = property('apiToken');

		expect(apiToken?.displayOptions?.show).toEqual({ authMode: ['field'] });
		expect(apiToken?.typeOptions?.password).toBe(true);
		expect(apiToken?.required).toBe(true);
	});
});

describe('NiboEmpresas — the Customer operations', () => {
	function operationValues(): string[] {
		return (property('operation')?.options as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	it('offers the five operations, with Get Many as the default', () => {
		expect(operationValues().sort()).toEqual(['create', 'delete', 'get', 'list', 'update']);
		expect(property('operation')?.default).toBe('list');
	});

	// The editor lists options in the order they are declared, and the n8n
	// linter requires that order to be alphabetical by name.
	it('lists the operations in alphabetical order', () => {
		const names = (property('operation')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([...names].sort());
	});

	it('asks for the customer ID on every operation that works on one record', () => {
		const customerId = property('customerId');

		expect(customerId?.required).toBe(true);
		expect(customerId?.displayOptions?.show?.operation).toEqual(
			expect.arrayContaining(['delete', 'get', 'update']),
		);
	});

	it('asks for a name and a document up front when creating', () => {
		for (const name of ['name', 'documentNumber', 'documentType']) {
			expect(property(name)?.required).toBe(true);
			expect(property(name)?.displayOptions?.show?.operation).toEqual(['create']);
		}

		const type = property('documentType')?.options as INodePropertyOptions[];
		expect(type.map((option) => option.value)).toEqual(['CNPJ', 'CPF']);
	});

	// Same menu on both sides: what can be set when creating can be changed
	// later, and nothing in Update is mandatory.
	it('offers under Update Fields everything Create offers, plus the first-class fields', () => {
		const inCreate = collectionFields('additionalFields');
		const inUpdate = collectionFields('updateFields');

		expect(inUpdate).toEqual(
			expect.arrayContaining([...inCreate, 'name', 'documentNumber', 'documentType']),
		);
	});

	it('warns that the e-mail field is one string with several addresses', () => {
		const email = fieldOf('additionalFields', 'email');

		expect(email?.type).toBe('string');
		expect(email?.description).toMatch(/comma/i);
	});

	/**
	 * The address is offered one field at a time rather than as a block. A
	 * fixedCollection would submit every field it contains, with its default,
	 * the moment the block is added — so changing a ZIP code would send an
	 * empty street and a house number of 0, and the API's PUT would write
	 * exactly that. One field at a time is what keeps "the node does not touch
	 * what you did not add" true for the address as well.
	 */
	it('offers the address field by field, so adding one never rewrites the others', () => {
		for (const collection of ['additionalFields', 'updateFields']) {
			expect(collectionFields(collection)).toEqual(
				expect.arrayContaining([
					'addressLine1',
					'addressNumber',
					'addressCity',
					'addressState',
					'addressZipCode',
				]),
			);
			expect(fieldOf(collection, 'address')).toBeUndefined();
		}
	});
});
