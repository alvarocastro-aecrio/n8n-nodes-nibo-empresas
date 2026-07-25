import type { INodePropertyOptions } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';

const description = new NiboEmpresas().description;

function property(name: string) {
	return description.properties.find((prop) => prop.name === name);
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

	it('offers the read operations, with Get Many as the default', () => {
		expect(operationValues()).toEqual(expect.arrayContaining(['delete', 'get', 'list']));
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
			expect.arrayContaining(['delete', 'get']),
		);
	});
});
