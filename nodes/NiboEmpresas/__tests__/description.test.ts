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
		expect(credential.displayOptions?.show?.authMode).toEqual(['credential']);
	});

	/**
	 * Where the credential picker is drawn is not ours to set directly. The
	 * editor puts it immediately **before the last parameter any credential
	 * names in its `displayOptions.show`** (ParameterInputList.vue,
	 * `indexToShowSlotAt`, n8n 2.18.5). Naming only `authMode` there drew the
	 * picker above the Authentication field — the field that decides whether a
	 * credential is used at all. Naming `resource` too moves the picker below
	 * it, which is the order the node is read in.
	 */
	it('names a later parameter in the credential, so the picker is drawn under Authentication', () => {
		const [credential] = description.credentials ?? [];
		const named = Object.keys(credential.displayOptions?.show ?? {});
		const order = description.properties.map((prop) => prop.name);

		expect(order.indexOf('authMode')).toBeLessThan(
			Math.max(...named.map((name) => order.indexOf(name))),
		);
	});

	// And the cost of that: a resource missing from the list would have no
	// credential at all. This is the only thing keeping the two in step.
	it('lists every resource the node offers in the credential', () => {
		const [credential] = description.credentials ?? [];
		const resources = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.value,
		);

		expect(credential.displayOptions?.show?.resource).toEqual(resources);
	});

	/**
	 * The interval is a defense that costs a second per item, so it is offered
	 * where a defense belongs: under Options, at the end, opt-in — and still
	 * 1000 ms the moment it is added.
	 */
	function option(name: string): INodeProperties | undefined {
		const options = description.properties[description.properties.length - 1];
		expect(options?.name).toBe('options');
		expect(options?.type).toBe('collection');

		return ((options?.options ?? []) as INodeProperties[]).find((field) => field.name === name);
	}

	it('offers the interval as an option at the end, not as a field of its own', () => {
		expect(property('requestInterval')).toBeUndefined();
		expect(option('requestInterval')?.default).toBe(1000);
	});

	/**
	 * A scan that may have missed records is a bad answer to build on — the sort
	 * of thing a workflow deletes by. So the strict reading is what happens when
	 * nobody chose anything, and tolerating an incomplete result is the decision
	 * that has to be taken on purpose.
	 */
	it('refuses a possibly incomplete scan by default, and says so only under Options', () => {
		expect(property('failOnIncomplete')).toBeUndefined();
		expect(option('failOnIncomplete')?.default).toBe(true);
	});

	it('offers that option only where it can happen — a scan of everything', () => {
		expect(option('failOnIncomplete')?.displayOptions?.show).toEqual({ '/returnAll': [true] });
	});

	it('shows the token field only in the per-item mode, and masks it', () => {
		const apiToken = property('apiToken');

		expect(apiToken?.displayOptions?.show).toEqual({ authMode: ['field'] });
		expect(apiToken?.typeOptions?.password).toBe(true);
		expect(apiToken?.required).toBe(true);
	});
});

describe('NiboEmpresas — the four stakeholder types', () => {
	const TYPES = ['customer', 'employee', 'partner', 'supplier'];

	/** Every declaration of a parameter, since one name can have several */
	function declarations(name: string): INodeProperties[] {
		return description.properties.filter((prop) => prop.name === name);
	}

	/** The resources a parameter is shown for, across all its declarations */
	function shownFor(name: string): string[] {
		return declarations(name)
			.flatMap((prop) => (prop.displayOptions?.show?.resource ?? []) as string[])
			.filter((resource, index, all) => all.indexOf(resource) === index)
			.sort();
	}

	it('offers the four, in the order the linter asks for', () => {
		const options = property('resource')?.options as INodePropertyOptions[];

		expect(options.map((option) => option.value)).toEqual(TYPES);
		expect(options.map((option) => option.name)).toEqual([
			'Customer',
			'Employee',
			'Partner',
			'Supplier',
		]);
	});

	it('gives all four the same five operations', () => {
		for (const resource of TYPES) {
			const operations = declarations('operation').find((prop) =>
				(prop.displayOptions?.show?.resource ?? []).includes(resource),
			);
			const values = (operations?.options as INodePropertyOptions[]).map((option) => option.value);

			expect(values.sort()).toEqual(['create', 'delete', 'get', 'list', 'update']);
		}
	});

	// A parameter name is a contract, and `customerId` is already published, so
	// each type carries its own rather than everyone sharing a renamed one.
	it('names the ID field after the type it belongs to', () => {
		for (const [resource, parameter] of [
			['customer', 'customerId'],
			['employee', 'employeeId'],
			['partner', 'partnerId'],
			['supplier', 'supplierId'],
		]) {
			const field = declarations(parameter)[0];

			expect(field?.displayOptions?.show?.resource).toEqual([resource]);
			expect(field?.displayOptions?.show?.operation).toEqual(['delete', 'get', 'update']);
			expect(field?.required).toBe(true);
		}
	});

	it('asks the same fields of all four types', () => {
		for (const field of ['name', 'documentNumber', 'additionalFields', 'updateFields', 'returnAll']) {
			expect(shownFor(field)).toEqual(TYPES);
		}
	});

	// An employee is a person. The API would take a CNPJ there, which is how a
	// payroll ends up with a company in it.
	it('offers an employee no document type other than CPF', () => {
		const forEmployee = declarations('documentType').find((prop) =>
			(prop.displayOptions?.show?.resource ?? []).includes('employee'),
		);

		expect((forEmployee?.options as INodePropertyOptions[]).map((option) => option.value)).toEqual([
			'CPF',
		]);
		expect(forEmployee?.default).toBe('CPF');
	});

	// A partner can be a holding company, so both are offered there.
	it('keeps both documents for the three types that can be a company', () => {
		for (const resource of ['customer', 'partner', 'supplier']) {
			const field = declarations('documentType').find((prop) =>
				(prop.displayOptions?.show?.resource ?? []).includes(resource),
			);

			expect((field?.options as INodePropertyOptions[]).map((option) => option.value)).toEqual([
				'CNPJ',
				'CPF',
			]);
			expect(field?.default).toBe('CNPJ');
		}
	});

	it('offers an employee no company name to change either', () => {
		const forEmployee = description.properties.find(
			(prop) =>
				prop.name === 'updateFields' &&
				(prop.displayOptions?.show?.resource ?? []).includes('employee'),
		);
		const documentType = ((forEmployee?.options ?? []) as INodeProperties[]).find(
			(field) => field.name === 'documentType',
		);

		expect((documentType?.options as INodePropertyOptions[]).map((option) => option.value)).toEqual(
			['CPF'],
		);
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

	// The type decides what the number has to be, and what else the form asks
	// for — so it is answered first.
	it('asks which document it is before asking for its number', () => {
		const order = description.properties.map((prop) => prop.name);

		expect(order.indexOf('documentType')).toBeLessThan(order.indexOf('documentNumber'));
	});

	// A person has no trading name. The field is not merely useless there: this
	// API keeps it, and a workflow could fill a person's record with one.
	it('drops Company Name from the menu when the document is a CPF', () => {
		expect(fieldOf('additionalFields', 'companyName')?.displayOptions?.hide).toEqual({
			'/documentType': ['CPF'],
		});
	});

	// In an update the document type is a field of the same menu, and it is
	// usually not filled in at all — so the rule can only fire when the person
	// says, in that same form, that this is a CPF.
	it('does the same inside Update Fields, where the type is a sibling field', () => {
		expect(fieldOf('updateFields', 'companyName')?.displayOptions?.hide).toEqual({
			documentType: ['CPF'],
		});
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

/**
 * The assisted filter of 0.5.0. Until then the expression went to the API
 * exactly as it was typed, and a name with an apostrophe was an HTTP 500 that
 * said nothing about the quote.
 */
describe('NiboEmpresas — the assisted filter', () => {
	const TYPES = ['customer', 'employee', 'partner', 'supplier'];

	/** One field of the Options collection, which is the last parameter of the node */
	function option(name: string): INodeProperties | undefined {
		const options = description.properties[description.properties.length - 1];
		expect(options?.name).toBe('options');

		return ((options?.options ?? []) as INodeProperties[]).find((field) => field.name === name);
	}

	/** The fields of one row of the condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (property('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;
		const row = collections.find((collection) => collection.name === 'conditions');

		expect(row).toBeDefined();
		return row?.values ?? [];
	}

	/** Every declaration of one field of a row, since one name can have several */
	function inRow(name: string): INodeProperties[] {
		return conditionFields().filter((field) => field.name === name);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map((option) => option.value as string);
	}

	function optionNames(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map((option) => option.name);
	}

	it('starts assisted, and keeps the raw expression as the other mode', () => {
		expect(optionValues(property('filterType'))).toEqual(['conditions', 'odata']);
		expect(property('filterType')?.default).toBe('conditions');
	});

	/**
	 * Writing OData by hand is the exception, not the way in — so since 0.5.1 it
	 * is an Option at the end of the node, opt-in, where the interval (0.4.2) and
	 * the strict scan (0.4.3) already live. The body asks only what the operation
	 * needs.
	 *
	 * The name does not change, because it is the value a node saved before that
	 * still carries.
	 */
	it('offers the raw expression as an option at the end, not as a field of the body', () => {
		expect(property('filter')).toBeUndefined();

		const filter = option('filter');

		expect(filter?.type).toBe('string');
		expect(filter?.default).toBe('');
	});

	// The two sets of fields are what Filter Type switches between, so the option
	// is offered in the mode that is about it — and only on a scan, which is the
	// only operation with anything to filter.
	it('offers that option only in the OData mode of Get Many', () => {
		expect(option('filter')?.displayOptions?.show).toEqual({
			'/operation': ['list'],
			'/filterType': ['odata'],
		});
	});

	it('offers the three filter parameters on Get Many of all four types', () => {
		for (const name of ['filterType', 'filters', 'filterCombine']) {
			expect(property(name)?.displayOptions?.show?.operation).toEqual(['list']);
			expect(property(name)?.displayOptions?.show?.resource).toEqual(TYPES);
		}
	});

	it('shows the builder and its combine only in the assisted mode', () => {
		for (const name of ['filters', 'filterCombine']) {
			expect(property(name)?.displayOptions?.show?.filterType).toEqual(['conditions']);
		}
	});

	it('combines the conditions with and unless someone chooses or', () => {
		expect(optionValues(property('filterCombine'))).toEqual(['and', 'or']);
		expect(property('filterCombine')?.default).toBe('and');
	});

	it('takes more than one condition', () => {
		expect(property('filters')?.type).toBe('fixedCollection');
		expect(property('filters')?.typeOptions?.multipleValues).toBe(true);
	});

	/**
	 * The menu is closed and measured: every path in it answered 200 on
	 * 2026-07-25. Letting a field name be typed would only trade one way of
	 * getting a 500 for another.
	 */
	it('offers only paths the API was measured to filter on', () => {
		expect(optionValues(inRow('field')[0]).sort()).toEqual(
			[
				'address/city',
				'address/state',
				'companyInformation/companyName',
				'document/number',
				'email',
				'isArchived',
				'isCompany',
				'name',
				'phone',
				'updateDate',
			].sort(),
		);
	});

	// `document/type eq 'Cpf'` is an HTTP 500: the enum does not compare. So it
	// is not on the menu at all — whoever needs it filters by the number.
	it('never offers the document type, which the API answers 500 for', () => {
		expect(optionValues(inRow('field')[0])).not.toContain('document/type');
		expect(optionNames(inRow('field')[0]).join(' ')).not.toMatch(/document type/i);
	});

	it('starts the row on a field, so a row added and untouched is a whole condition', () => {
		expect(inRow('field')[0]?.default).toBe('name');
	});

	/** Which operator values are offered for a given field path */
	function operatorsFor(path: string): string[] {
		const declaration = inRow('operator').find((field) =>
			((field.displayOptions?.show?.field ?? []) as string[]).includes(path),
		);

		return optionValues(declaration);
	}

	it('offers a text field the six text operators, tolower included', () => {
		expect(operatorsFor('name').sort()).toEqual(
			['contains', 'containsIgnoreCase', 'endswith', 'eq', 'ne', 'startswith'].sort(),
		);
	});

	it('offers a yes-or-no field only is and is not', () => {
		expect(operatorsFor('isCompany').sort()).toEqual(['eq', 'ne']);
	});

	it('offers a date field only the four comparisons', () => {
		expect(operatorsFor('updateDate').sort()).toEqual(['ge', 'gt', 'le', 'lt'].sort());
	});

	// A text operator on a date is an expression the API answers 500 to, so the
	// menu never offers one.
	it('never offers contains for a date or a yes-or-no', () => {
		for (const path of ['updateDate', 'isCompany', 'isArchived']) {
			expect(operatorsFor(path)).not.toContain('contains');
		}
	});

	/** Which value box is drawn for a given field path */
	function valueBoxFor(path: string): INodeProperties | undefined {
		return conditionFields().find(
			(field) =>
				field.displayName === 'Value' &&
				((field.displayOptions?.show?.field ?? []) as string[]).includes(path),
		);
	}

	// Each type has its own box, so the value is collected as what it is — which
	// is what lets the builder write the right literal for it.
	it.each([
		['name', 'string'],
		['document/number', 'string'],
		['isCompany', 'boolean'],
		['isArchived', 'boolean'],
		['updateDate', 'dateTime'],
	])('collects the value of %s as a %s', (path, type) => {
		expect(valueBoxFor(path)?.type).toBe(type);
	});

	// The editor lists options in the order they are declared, and the n8n
	// linter requires that order to be alphabetical by name.
	it('keeps every menu of the builder alphabetical', () => {
		for (const field of [...inRow('field'), ...inRow('operator'), property('filterType')!, property('filterCombine')!]) {
			const names = optionNames(field);

			expect(names).toEqual([...names].sort());
		}
	});
});
