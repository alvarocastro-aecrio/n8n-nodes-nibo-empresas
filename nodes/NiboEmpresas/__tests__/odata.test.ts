import type { IODataCondition } from '../transport/odata';
import { buildODataFilter } from '../transport/odata';

/** One condition, spelled out, so each test says only what it is about */
function condition(parts: Partial<IODataCondition>): IODataCondition {
	return { field: 'name', operator: 'contains', value: '', type: 'text', ...parts };
}

describe('buildODataFilter — the text operators', () => {
	it.each([
		['contains', "contains(name,'ACME')"],
		['startswith', "startswith(name,'ACME')"],
		['endswith', "endswith(name,'ACME')"],
		['eq', "name eq 'ACME'"],
		['ne', "name ne 'ACME'"],
	])('writes %s the way the API spells it', (operator, expected) => {
		expect(buildODataFilter([condition({ operator, value: 'ACME' })], 'and')).toBe(expected);
	});

	// Measured on 2026-07-25: tolower() is accepted, and it is what almost
	// everybody actually means when searching by name.
	it('lowercases both sides when the case is to be ignored', () => {
		const filter = buildODataFilter(
			[condition({ operator: 'containsIgnoreCase', value: 'ACME' })],
			'and',
		);

		expect(filter).toBe("contains(tolower(name),'acme')");
	});

	it('keeps a nested path as the API names it', () => {
		const filter = buildODataFilter(
			[condition({ field: 'document/number', operator: 'contains', value: '096' })],
			'and',
		);

		expect(filter).toBe("contains(document/number,'096')");
	});

	// Accented text needs no treatment at all — it is sent as it was typed.
	it('leaves accented text alone', () => {
		expect(buildODataFilter([condition({ value: 'SERVIÇOS' })], 'and')).toBe(
			"contains(name,'SERVIÇOS')",
		);
	});
});

/**
 * The defect this whole version exists for. `D'ALESSANDRO` typed raw closes the
 * literal early, the API answers 500 `validation_error` — *unterminated
 * literal* — and nothing in that answer points at the apostrophe. Doubling it
 * is what the API accepts, measured on 2026-07-25.
 */
describe('buildODataFilter — the apostrophe', () => {
	it('escapes an apostrophe by doubling it', () => {
		expect(buildODataFilter([condition({ value: "D'ALESSANDRO" })], 'and')).toBe(
			"contains(name,'D''ALESSANDRO')",
		);
	});

	it('escapes every apostrophe of the value, not just the first', () => {
		expect(buildODataFilter([condition({ value: "O'B'C" })], 'and')).toBe(
			"contains(name,'O''B''C')",
		);
	});

	it('escapes it in a comparison as well', () => {
		expect(buildODataFilter([condition({ operator: 'eq', value: "D'ALESSANDRO" })], 'and')).toBe(
			"name eq 'D''ALESSANDRO'",
		);
	});

	it('escapes it under tolower too, where the value is lowercased first', () => {
		expect(
			buildODataFilter([condition({ operator: 'containsIgnoreCase', value: "D'ALESSANDRO" })], 'and'),
		).toBe("contains(tolower(name),'d''alessandro')");
	});
});

/**
 * Each type carries its own literal: text between quotes, boolean and date
 * bare. A builder that quoted everything would be wrong in three of the four
 * cases — `isCompany eq 'true'` is a 500.
 */
describe('buildODataFilter — one literal per type', () => {
	it('writes a boolean without quotes', () => {
		expect(
			buildODataFilter([{ field: 'isCompany', operator: 'eq', value: true, type: 'boolean' }], 'and'),
		).toBe('isCompany eq true');
	});

	it('writes a false the same way, instead of dropping the condition', () => {
		expect(
			buildODataFilter(
				[{ field: 'isArchived', operator: 'eq', value: false, type: 'boolean' }],
				'and',
			),
		).toBe('isArchived eq false');
	});

	// The editor hands a boolean back as a boolean, but an expression can hand
	// back the string it read from an incoming item.
	it.each([
		['true', 'isCompany ne true'],
		['false', 'isCompany ne false'],
	])('reads the string %s as the boolean it means', (value, expected) => {
		expect(
			buildODataFilter([{ field: 'isCompany', operator: 'ne', value, type: 'boolean' }], 'and'),
		).toBe(expected);
	});

	it('writes a date without quotes', () => {
		expect(
			buildODataFilter(
				[{ field: 'updateDate', operator: 'ge', value: '2026-07-01', type: 'date' }],
				'and',
			),
		).toBe('updateDate ge 2026-07-01');
	});

	// Every form the editor's date field can produce was measured against the
	// API on 2026-07-25 — with milliseconds, with a Z, with an offset — and all
	// of them answer 200. So the value travels as it came, only trimmed.
	it.each([
		'2026-07-01T00:00:00Z',
		'2026-07-01T00:00:00.000Z',
		'2026-07-01T00:00:00-03:00',
		'2026-07-01T00:00:00.000-03:00',
	])('passes %s through as the API accepts it', (value) => {
		expect(
			buildODataFilter([{ field: 'updateDate', operator: 'gt', value, type: 'date' }], 'and'),
		).toBe(`updateDate gt ${value}`);
	});
});

describe('buildODataFilter — joining conditions', () => {
	const TWO: IODataCondition[] = [
		{ field: 'name', operator: 'contains', value: 'ACME', type: 'text' },
		{ field: 'isCompany', operator: 'eq', value: true, type: 'boolean' },
	];

	it('joins two conditions with and', () => {
		expect(buildODataFilter(TWO, 'and')).toBe("contains(name,'ACME') and isCompany eq true");
	});

	it('joins them with or when that is what was chosen', () => {
		expect(buildODataFilter(TWO, 'or')).toBe("contains(name,'ACME') or isCompany eq true");
	});

	it('joins three the same way', () => {
		const filter = buildODataFilter(
			[...TWO, { field: 'address/state', operator: 'eq', value: 'RJ', type: 'text' }],
			'and',
		);

		expect(filter).toBe("contains(name,'ACME') and isCompany eq true and address/state eq 'RJ'");
	});

	// Only one operator, chosen once, so there is no precedence to parenthesize
	// away. Nested groups are what the raw OData field stays for.
	it('adds no parentheses to a single condition', () => {
		expect(buildODataFilter([condition({ value: 'ACME' })], 'and')).toBe("contains(name,'ACME')");
	});

	it('treats a missing combine as and', () => {
		expect(buildODataFilter(TWO, '')).toBe("contains(name,'ACME') and isCompany eq true");
	});
});

/**
 * An empty expression is not a filter: the transport only sends `$filter` when
 * the string is non-empty, so "nothing to filter by" has to come out as ''.
 */
describe('buildODataFilter — what does not become a filter', () => {
	it('answers an empty string for an empty list', () => {
		expect(buildODataFilter([], 'and')).toBe('');
	});

	it('answers an empty string when the list is not there at all', () => {
		expect(buildODataFilter(undefined, 'and')).toBe('');
	});

	it.each([[''], ['   ']])('skips a condition with no field (%s)', (field) => {
		expect(buildODataFilter([condition({ field, value: 'ACME' })], 'and')).toBe('');
	});

	it('skips a condition with no operator', () => {
		expect(buildODataFilter([condition({ operator: '', value: 'ACME' })], 'and')).toBe('');
	});

	// A row added and left blank is an unfinished row, not "match everything".
	it('skips a text condition whose value was left empty', () => {
		expect(buildODataFilter([condition({ value: '' })], 'and')).toBe('');
	});

	it('skips a date condition whose value was left empty', () => {
		expect(
			buildODataFilter([{ field: 'updateDate', operator: 'gt', value: '', type: 'date' }], 'and'),
		).toBe('');
	});

	// The one that has to survive: a boolean is never "empty", and `false` is an
	// answer, not a blank.
	it('keeps a boolean condition, whichever side it is on', () => {
		expect(
			buildODataFilter([{ field: 'isCompany', operator: 'eq', value: false, type: 'boolean' }], 'and'),
		).toBe('isCompany eq false');
	});

	it('joins only the conditions that survived', () => {
		const filter = buildODataFilter(
			[
				{ field: 'name', operator: 'contains', value: 'ACME', type: 'text' },
				{ field: '', operator: 'contains', value: 'ignored', type: 'text' },
				{ field: 'address/city', operator: 'eq', value: '', type: 'text' },
				{ field: 'address/state', operator: 'eq', value: 'RJ', type: 'text' },
			],
			'and',
		);

		expect(filter).toBe("contains(name,'ACME') and address/state eq 'RJ'");
	});

	/**
	 * The operators come from a closed menu, so an unknown one is a saved node
	 * carrying something this version does not have. Dropping it silently would
	 * widen the result — the direction a workflow deletes by — so it fails
	 * instead, and the handler turns it into an error carrying the item index.
	 */
	it('refuses an operator it does not know instead of ignoring the condition', () => {
		expect(() => buildODataFilter([condition({ operator: 'like', value: 'ACME' })], 'and')).toThrow(
			/like/,
		);
	});
});
