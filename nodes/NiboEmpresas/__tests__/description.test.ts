import type {
	INodeParameters,
	INodeProperties,
	INodePropertyOptions,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeHelpers } from 'n8n-workflow';

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

	// The four are still all there, and still in this order — the schedules of
	// 0.6.0 are interleaved with them alphabetically, not appended after them.
	it('offers the four, in the order the linter asks for', () => {
		const options = property('resource')?.options as INodePropertyOptions[];
		const values = options.map((option) => option.value);

		expect(values.filter((value) => TYPES.includes(value as string))).toEqual(TYPES);
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

	// `arrayContaining` rather than equality: since 0.6.0 three of these names
	// are also parameters of the schedules, which have declarations of their
	// own. What this is about is that no stakeholder type is left out of any of
	// them.
	it('asks the same fields of all four types', () => {
		for (const field of ['name', 'documentNumber', 'additionalFields', 'updateFields', 'returnAll']) {
			expect(shownFor(field)).toEqual(expect.arrayContaining(TYPES));
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

	// The conditions are simply what the node offers. Writing an expression by
	// hand under Options is the exception, and adding it there is the whole
	// switch — a second switch in the body could disagree with it, and that is
	// how a filter ends up being one thing on the screen and another on the wire.
	it('has no mode switch at all, only the conditions and the option', () => {
		expect(property('filterType')).toBeUndefined();
		expect(property('filters')).toBeDefined();
		expect(option('filter')).toBeDefined();
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
	// Nothing to find first: it is on the Add option list of every scan.
	it('offers that option on every Get Many, with no mode to choose first', () => {
		expect(option('filter')?.displayOptions?.show).toEqual({ '/operation': ['list'] });
	});

	it('offers the two condition parameters on Get Many of all four types', () => {
		for (const name of ['filters', 'filterCombine']) {
			expect(property(name)?.displayOptions?.show?.operation).toEqual(['list']);
			expect(property(name)?.displayOptions?.show?.resource).toEqual(TYPES);
		}
	});

	/**
	 * And they take themselves off the screen the moment that option carries an
	 * expression. `exists` is how the editor spells "filled in" — not null, not
	 * undefined, not empty — so an option added and left blank costs the
	 * conditions nothing.
	 */
	it('hides the builder and its combine once the option carries an expression', () => {
		for (const name of ['filters', 'filterCombine']) {
			expect(property(name)?.displayOptions?.hide).toEqual({
				'/options.filter': [{ _cnd: { exists: true } }],
			});
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

/**
 * The second family, and what it was for: the core built up to 0.5.x pays for
 * it. Two resources, five operations each, and nothing about the filter, the
 * paging or the safe update written a second time.
 */
describe('NiboEmpresas — the two schedule resources', () => {
	const SCHEDULES = ['creditSchedule', 'debitSchedule'];

	function declarations(name: string): INodeProperties[] {
		return description.properties.filter((prop) => prop.name === name);
	}

	/** The declaration of a parameter drawn for this resource */
	function forResource(name: string, resource: string): INodeProperties | undefined {
		return declarations(name).find((prop) =>
			((prop.displayOptions?.show?.resource ?? []) as string[]).includes(resource),
		);
	}

	// Interleaved, not appended: whoever is looking for "Debit Schedule" is
	// looking for the letter D, not for a family they would have to know exists.
	// (Which names are on the menu is checked in category.test.ts, where the
	// newest one is added — here it is only that the two land in their places.)
	it('puts the two in their alphabetical places, between the contacts', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([...names].sort());
		expect(names.indexOf('Credit Schedule')).toBeLessThan(names.indexOf('Customer'));
		expect(names.indexOf('Customer')).toBeLessThan(names.indexOf('Debit Schedule'));
		expect(names.indexOf('Debit Schedule')).toBeLessThan(names.indexOf('Employee'));
	});

	// The cost of the credential trick (see the block at the top): a resource
	// missing from that list would be a resource with no credential at all.
	it('lists the two new resources in the credential as well', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toEqual(
			expect.arrayContaining(SCHEDULES),
		);
	});

	it('gives both the same five operations as the stakeholders', () => {
		for (const resource of SCHEDULES) {
			const operations = forResource('operation', resource);
			const values = (operations?.options as INodePropertyOptions[]).map((option) => option.value);

			expect(values.sort()).toEqual(['create', 'delete', 'get', 'list', 'update']);
			expect(operations?.default).toBe('list');
		}
	});

	// A parameter name is a contract, so each resource carries its own rather
	// than the two sharing one.
	it('names the ID field after the resource it belongs to', () => {
		for (const [resource, parameter] of [
			['creditSchedule', 'creditScheduleId'],
			['debitSchedule', 'debitScheduleId'],
		]) {
			const field = forResource(parameter, resource);

			expect(field?.displayOptions?.show?.resource).toEqual([resource]);
			expect(field?.displayOptions?.show?.operation).toEqual(['delete', 'get', 'update']);
			expect(field?.required).toBe(true);
		}
	});

	it('offers Get Many the same Return All and Limit the stakeholders have', () => {
		for (const name of ['returnAll', 'limit']) {
			expect(forResource(name, 'creditSchedule')?.displayOptions?.show?.operation).toEqual(['list']);
		}
	});
});

describe('NiboEmpresas — the fields a schedule is created with', () => {
	const SCHEDULES = ['creditSchedule', 'debitSchedule'];

	function forSchedules(name: string): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('creditSchedule'),
		);
	}

	/** The fields offered inside a collection drawn for the schedules */
	function fieldsOf(collection: string): string[] {
		return ((forSchedules(collection)?.options ?? []) as INodeProperties[]).map(
			(field) => field.name,
		);
	}

	it('asks up front for exactly what the API refuses a creation without', () => {
		for (const name of ['stakeholderId', 'dueDate', 'scheduleDate', 'categories']) {
			const field = forSchedules(name);

			expect(field?.required).toBe(true);
			expect(field?.displayOptions?.show?.operation).toEqual(['create']);
			expect(field?.displayOptions?.show?.resource).toEqual(SCHEDULES);
		}
	});

	/**
	 * The asymmetry the node exists for, and the reason this field is on the
	 * screen instead of inside a menu: omit `accrualDate` and the API copies the
	 * due date without saying so, which files the income or the expense in the
	 * wrong month. A field nobody sees is a decision nobody took.
	 */
	/** Where a parameter of the schedules sits in the body of the node */
	function positionOf(name: string): number {
		return description.properties.findIndex(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('creditSchedule'),
		);
	}

	it('puts the accrual date next to the due date, optional but never hidden', () => {
		const accrualDate = forSchedules('accrualDate');

		expect(accrualDate?.type).toBe('dateTime');
		expect(accrualDate?.required).toBeUndefined();
		expect(positionOf('accrualDate')).toBeGreaterThan(positionOf('dueDate'));
		expect(positionOf('accrualDate')).toBeLessThan(positionOf('additionalFields'));
	});

	it('says on that field what leaving it empty does', () => {
		expect(forSchedules('accrualDate')?.description).toMatch(/copies the due date/i);
	});

	/**
	 * A schedule falls due on a **day**. The API takes `YYYY-MM-DD` and there is
	 * no hour in any of these three, so offering a clock is offering a decision
	 * that does not exist — and one that has a wrong answer, since the editor
	 * hands over the moment with its offset and `2026-08-10T00:00:00-03:00` is
	 * the 9th in UTC.
	 *
	 * `dateOnly` settles both at once: the picker loses its clock, and the value
	 * is stored as the plain day the API wants.
	 */
	it.each(['dueDate', 'scheduleDate', 'accrualDate'])(
		'asks %s as a day, with no clock on it',
		(name) => {
			const field = forSchedules(name);

			expect(field?.type).toBe('dateTime');
			expect(field?.typeOptions?.dateOnly).toBe(true);
		},
	);

	it.each(['dueDate', 'scheduleDate', 'accrualDate'])(
		'asks %s the same way inside Update Fields',
		(name) => {
			const field = ((forSchedules('updateFields')?.options ?? []) as INodeProperties[]).find(
				(one) => one.name === name,
			);

			expect(field?.typeOptions?.dateOnly).toBe(true);
		},
	);

	// There is no total field to fill in: the amount of a schedule is the sum of
	// its lines, and that is the API's own arithmetic, not ours.
	it('collects the categories as the lines the payload is made of', () => {
		const categories = forSchedules('categories');
		const line = ((categories?.options ?? []) as Array<{ name: string; values: INodeProperties[] }>)[0];

		expect(categories?.type).toBe('fixedCollection');
		expect(categories?.typeOptions?.multipleValues).toBe(true);
		expect(line.values.find((field) => field.name === 'value')?.type).toBe('number');
	});

	it('says that the amount of a schedule is the sum of its lines', () => {
		expect(forSchedules('categories')?.description).toMatch(/sum/i);
	});

	/**
	 * A line of its own detail. Measured on the cobaia on 2026-07-26 before it
	 * was offered: the API takes `description` inside a category line, stores it
	 * and answers with it — accents and all. The project's reference had it
	 * marked suspicious, from a payload that once crashed the server; that turned
	 * out to be the encoding, not this field.
	 */
	it('lets each category line carry its own detail', () => {
		const line = ((forSchedules('categories')?.options ?? []) as Array<{
			values: INodeProperties[];
		}>)[0];

		expect(line.values.map((field) => field.name)).toEqual(['categoryId', 'value', 'description']);
		expect(line.values.find((field) => field.name === 'description')?.type).toBe('string');
	});

	/**
	 * The order the form is filled in. What a schedule *is* — who, when, what it
	 * is about — comes before how the amount is split, because the split is the
	 * detail and the rest is the decision.
	 */
	it('asks what the schedule is before asking how it is split', () => {
		for (const name of ['description', 'isFlagged']) {
			expect(positionOf(name)).toBeLessThan(positionOf('categories'));
		}
	});

	/**
	 * The 0.6.0 hole, closed in 0.7.0: the field asked for a GUID and the node
	 * offered no way to learn one.
	 *
	 * It gains the list without changing anything a saved node depends on. A
	 * resourceLocator would read better and would store `{mode, value}` where a
	 * plain string is stored today — every node saved under 0.6.0 would break on
	 * the upgrade. The name, the place, the default and the stored shape are all
	 * the contract, and none of them moves.
	 */
	it('fills the category from a list, without changing what is stored', () => {
		const line = ((forSchedules('categories')?.options ?? []) as Array<{
			values: INodeProperties[];
		}>)[0];
		const categoryId = line.values.find((field) => field.name === 'categoryId');

		expect(categoryId?.type).toBe('options');
		expect(categoryId?.default).toBe('');
		expect(categoryId?.typeOptions?.loadOptionsMethod).toBe('loadScheduleCategories');
	});

	/**
	 * The list is fetched once and then only refetched on three things, read out
	 * of the n8n 2.18.5 editor on 2026-07-26: the refresh button, a watch on the
	 * node's credentials, and a watch on the value of `loadOptionsDependsOn`.
	 *
	 * Declaring nothing there is what made the field keep whichever half of the
	 * chart of accounts it loaded first — switch from Credit Schedule to Debit
	 * Schedule and the revenue categories stayed on the screen. The resource is
	 * what the list is filtered by, so the resource is what it has to follow.
	 */
	it('reloads the list when the resource it is filtered by changes', () => {
		const line = ((forSchedules('categories')?.options ?? []) as Array<{
			values: INodeProperties[];
		}>)[0];
		const dependsOn = line.values.find((field) => field.name === 'categoryId')?.typeOptions
			?.loadOptionsDependsOn as string[];

		expect(dependsOn).toContain('resource');
	});

	// And on the way back from the per-item mode, where the list refuses to load
	// at all — otherwise the refusal would stay on the screen after the reason
	// for it was gone.
	it('reloads it when the authentication mode changes too', () => {
		const line = ((forSchedules('categories')?.options ?? []) as Array<{
			values: INodeProperties[];
		}>)[0];
		const dependsOn = line.values.find((field) => field.name === 'categoryId')?.typeOptions
			?.loadOptionsDependsOn as string[];

		expect(dependsOn).toContain('authMode');
	});

	// A field that offers a list and has nothing behind it is the 0.3.1 bug: the
	// name is a key into the node's own methods, and only this test ties the two.
	it('names a list the node actually declares', () => {
		const line = ((forSchedules('categories')?.options ?? []) as Array<{
			values: INodeProperties[];
		}>)[0];
		const method = line.values.find((field) => field.name === 'categoryId')?.typeOptions
			?.loadOptionsMethod as string;

		expect(Object.keys(new NiboEmpresas().methods?.loadOptions ?? {})).toContain(method);
	});

	it('keeps the rest of what can be written under Additional Fields', () => {
		expect(fieldsOf('additionalFields')).toEqual(['reference']);
	});

	/**
	 * Moved out of the menu in 0.7.1, after Alvaro used the form: a schedule with
	 * no description is a line nobody can read later in Nibo, and the flag is set
	 * at the moment the entry is made, not hunted for in a menu.
	 */
	it.each(['description', 'isFlagged'])('asks for %s on the screen when creating', (name) => {
		const field = forSchedules(name);

		expect(field?.displayOptions?.show?.operation).toEqual(['create']);
		expect(field?.displayOptions?.show?.resource).toEqual(SCHEDULES);
		expect(field?.required).toBeUndefined();
	});

	/**
	 * And on Update they are back inside the menu, which is not an oversight.
	 * There a field on the screen is a field that gets written, so a visible
	 * empty Description would erase the stored one every time anything else was
	 * changed — the menu is what makes "a field you did not add is not touched"
	 * true.
	 */
	it.each(['description', 'isFlagged'])(
		'changes %s from inside Update Fields, never from the body',
		(name) => {
			expect(fieldsOf('updateFields')).toContain(name);

			const onScreen = description.properties.filter(
				(prop) =>
					prop.name === name &&
					((prop.displayOptions?.show?.operation ?? []) as string[]).includes('update'),
			);

			expect(onScreen).toEqual([]);
		},
	);

	// Same rule as the stakeholders: what can be set when creating can be
	// changed later, and nothing in Update is mandatory.
	it('offers under Update Fields everything Create asks for, all optional', () => {
		const inUpdate = fieldsOf('updateFields');

		expect(inUpdate).toEqual(
			expect.arrayContaining([
				'accrualDate',
				'categories',
				'description',
				'dueDate',
				'reference',
				'scheduleDate',
				'stakeholderId',
			]),
		);
		expect(forSchedules('updateFields')?.required).toBeUndefined();
	});
});

/**
 * The filter menu of the schedules — closed and measured on 2026-07-26, like
 * the stakeholders' was on 2026-07-25. It is the first one with an amount in
 * it, which is the type v0.6.0 added to the builder.
 */
describe('NiboEmpresas — the schedule filter menu', () => {
	function forSchedules(name: string): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('creditSchedule'),
		);
	}

	function conditionFields(): INodeProperties[] {
		const collections = (forSchedules('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map((option) => option.value as string);
	}

	function fieldBox(): INodeProperties | undefined {
		return conditionFields().find((field) => field.name === 'field');
	}

	it('offers only the paths the API was measured to filter on', () => {
		expect(optionValues(fieldBox()).sort()).toEqual(
			[
				'accrualDate',
				'createDate',
				'description',
				'dueDate',
				'hasInvoice',
				'isDued',
				'isFlagged',
				'isPaid',
				'reference',
				'scheduleDate',
				'stakeholder/name',
				'updateDate',
				'value',
			].sort(),
		);
	});

	/**
	 * Three absences, each for its own reason: `type` is a constant inside one of
	 * these collections, so filtering by it can only say "yes" or "nothing";
	 * `isDeleted` is a 500 because the field is not on this view; and
	 * `costCenterValueType` is a 500 because the enum does not compare, exactly
	 * as `document/type` does not on the stakeholders.
	 */
	it.each(['type', 'isDeleted', 'costCenterValueType'])(
		'never offers %s, which the API cannot filter on here',
		(path) => {
			expect(optionValues(fieldBox())).not.toContain(path);
		},
	);

	it('starts the row on the due date, which is what a schedule is asked about', () => {
		expect(fieldBox()?.default).toBe('dueDate');
	});

	/** Which value box is drawn for a given field path */
	function valueBoxFor(path: string): INodeProperties | undefined {
		return conditionFields().find(
			(field) =>
				field.displayName === 'Value' &&
				((field.displayOptions?.show?.field ?? []) as string[]).includes(path),
		);
	}

	// The amount is the reason the builder learned a fourth type: quoting it is
	// a 500 naming the two types it could not compare.
	it('collects the amount in a number box', () => {
		expect(valueBoxFor('value')?.type).toBe('number');
		expect(valueBoxFor('value')?.name).toBe('numberValue');
	});

	it.each([
		['dueDate', 'dateTime'],
		['description', 'string'],
		['isPaid', 'boolean'],
	])('collects %s as a %s, as it always did', (path, type) => {
		expect(valueBoxFor(path)?.type).toBe(type);
	});

	/** Which operator values are offered for a given field path */
	function operatorsFor(path: string): string[] {
		const declaration = conditionFields().find(
			(field) =>
				field.name === 'operator' &&
				((field.displayOptions?.show?.field ?? []) as string[]).includes(path),
		);

		return optionValues(declaration);
	}

	it('offers an amount the six comparisons, all of them measured', () => {
		expect(operatorsFor('value').sort()).toEqual(['eq', 'ge', 'gt', 'le', 'lt', 'ne'].sort());
	});

	it('never offers contains for an amount, a date or a yes-or-no', () => {
		for (const path of ['value', 'dueDate', 'isPaid']) {
			expect(operatorsFor(path)).not.toContain('contains');
		}
	});

	it('keeps every menu of the builder alphabetical', () => {
		for (const field of conditionFields()) {
			const names = ((field.options ?? []) as INodePropertyOptions[]).map((option) => option.name);

			expect(names).toEqual([...names].sort());
		}
	});
});

/**
 * What the editor actually draws, decided by the editor's own function.
 *
 * Every other test here reads `displayOptions` and trusts our reading of it.
 * This one hands the node's parameters to `NodeHelpers.displayParameter` — the
 * same call the editor makes to decide whether a field is on the screen — and
 * asks it. It is the difference between "the rule is written down" and "the
 * rule does what we think it does".
 */
describe('NiboEmpresas — what the editor draws for each filter type', () => {
	const NODE = { typeVersion: 1 };

	/**
	 * What the editor holds for a node whose author only chose these values.
	 *
	 * The editor does not ask about the raw stored parameters: it fills in the
	 * default of every parameter it is showing first (`getNodeParameters` with
	 * `returnDefaults`), and asks about the result. That is why a node saved
	 * before Filter Type existed still lands in the assisted mode — the default
	 * is filled in for it — and simulating only the second step would answer
	 * that such a node is shown no filter at all, which is not what happens.
	 */
	function asTheEditorHoldsIt(chosen: INodeParameters): INodeParameters {
		return NodeHelpers.getNodeParameters(
			description.properties,
			chosen,
			true,
			false,
			NODE,
			description as INodeTypeDescription,
		) as INodeParameters;
	}

	/** Whether the editor would draw this top-level parameter, given these node values */
	function drawn(name: string, chosen: INodeParameters): boolean {
		const values = asTheEditorHoldsIt(chosen);
		const parameter = description.properties.find((prop) => prop.name === name);

		expect(parameter).toBeDefined();
		return NodeHelpers.displayParameter(
			values,
			parameter as INodeProperties,
			NODE,
			description as INodeTypeDescription,
			values,
		);
	}

	/** The same question for a field inside the Options collection */
	function drawnInOptions(name: string, chosen: INodeParameters): boolean {
		const values = asTheEditorHoldsIt(chosen);
		const options = description.properties[description.properties.length - 1];
		const field = ((options?.options ?? []) as INodeProperties[]).find(
			(one) => one.name === name,
		);

		expect(field).toBeDefined();
		return NodeHelpers.displayParameter(
			(values.options ?? {}) as INodeParameters,
			field as INodeProperties,
			NODE,
			description as INodeTypeDescription,
			values,
		);
	}

	const GET_MANY = { resource: 'customer', operation: 'list' };

	it('draws the condition builder, and offers the OData box, on a plain Get Many', () => {
		expect(drawn('filters', GET_MANY)).toBe(true);
		expect(drawn('filterCombine', GET_MANY)).toBe(true);
		expect(drawnInOptions('filter', GET_MANY)).toBe(true);
	});

	/**
	 * The request, in one test: fill the OData box in under Options and the new
	 * filters go away, leaving only the OData filter.
	 *
	 * `_cnd: { exists: true }` is what the editor understands by "this field is
	 * filled in" — it reads `!== null && !== undefined && !== ''` — and a `hide`
	 * rule fires only when the value it names is there at all. That is what makes
	 * one field able to answer for another without a mode switch between them.
	 */
	it('drops the condition builder once the OData box has an expression in it', () => {
		const written = { ...GET_MANY, options: { filter: "contains(name,'LTDA')" } };

		expect(drawn('filters', written)).toBe(false);
		expect(drawn('filterCombine', written)).toBe(false);
		expect(drawnInOptions('filter', written)).toBe(true);
	});

	// Added and left blank is not a filter, and must not cost the conditions
	// their place on the screen.
	it('keeps the condition builder while the OData box is empty', () => {
		const blank = { ...GET_MANY, options: { filter: '' } };

		expect(drawn('filters', blank)).toBe(true);
		expect(drawn('filterCombine', blank)).toBe(true);
	});

	// The option is opt-in: not adding it leaves everything as it was.
	it('keeps the condition builder when the option was never added', () => {
		expect(drawn('filters', { ...GET_MANY, options: { requestInterval: 500 } })).toBe(true);
	});

	// And nothing to filter means no filter fields at all.
	it('draws neither on an operation that reads a single record', () => {
		const one = { resource: 'customer', operation: 'get' };

		expect(drawn('filters', one)).toBe(false);
		expect(drawnInOptions('filter', one)).toBe(false);
	});
});
