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

/**
 * The type v0.6.0 adds, and the schedules are what asked for it: `value` is
 * money, and money compares as a number.
 *
 * Measured against the API on 2026-07-26, on `/schedules/credit`: the six
 * comparisons answer 200 with the literal bare, and `value gt '100'` answers
 * **500** — *A binary operator with incompatible types was detected. Found
 * operand types 'Edm.Decimal' and 'Edm.String'*. So a number is never quoted,
 * for the same reason a boolean never is.
 */
describe('buildODataFilter — the number type', () => {
	function amount(parts: Partial<IODataCondition>): IODataCondition {
		return { field: 'value', operator: 'gt', value: 100, type: 'number', ...parts };
	}

	it.each([
		['eq', 'value eq 100'],
		['ne', 'value ne 100'],
		['gt', 'value gt 100'],
		['ge', 'value ge 100'],
		['lt', 'value lt 100'],
		['le', 'value le 100'],
	])('writes %s with the literal bare, which is the only form the API takes', (operator, expected) => {
		expect(buildODataFilter([amount({ operator })], 'and')).toBe(expected);
	});

	it('keeps the cents of a decimal', () => {
		expect(buildODataFilter([amount({ value: 100.5 })], 'and')).toBe('value gt 100.5');
	});

	it('keeps a decimal handed over as text exactly as it was written', () => {
		expect(buildODataFilter([amount({ value: '100.50' })], 'and')).toBe('value gt 100.50');
	});

	it('writes a negative amount, which is what a debit answers', () => {
		expect(buildODataFilter([amount({ operator: 'lt', value: -100.5 })], 'and')).toBe(
			'value lt -100.5',
		);
	});

	it('writes a zero rather than treating it as a blank', () => {
		expect(buildODataFilter([amount({ value: 0 })], 'and')).toBe('value gt 0');
	});

	/**
	 * The box in the editor hands over a number, so this only happens through an
	 * expression — and an expression reads whatever the incoming item carries,
	 * which in this country is written with a comma. It is the same amount.
	 */
	it('reads a decimal comma as the decimal point it means', () => {
		expect(buildODataFilter([amount({ value: '100,50' })], 'and')).toBe('value gt 100.50');
	});

	it('trims the text an expression handed over', () => {
		expect(buildODataFilter([amount({ value: '  100.50  ' })], 'and')).toBe('value gt 100.50');
	});

	/**
	 * Anything the node cannot read as one number fails here, instead of
	 * travelling as an expression the API answers 500 to — or, worse, as a
	 * number that means something else. `1.234,56` is the one that matters: read
	 * one way it is a thousand, read the other it is one and a bit, and there is
	 * nothing in the value that says which. Guessing would be a filter that
	 * quietly returns the wrong records.
	 */
	it.each(['ACME', '1.234,56', '1,234.56', '100.50.25', '1e3', 'R$ 100'])(
		'refuses %s instead of sending something the API has to reject',
		(value) => {
			expect(() => buildODataFilter([amount({ value })], 'and')).toThrow(/number/i);
		},
	);

	it('refuses an operator no number can be asked for', () => {
		expect(() => buildODataFilter([amount({ operator: 'contains' })], 'and')).toThrow(/contains/);
	});

	it('joins a number condition with the others', () => {
		const filter = buildODataFilter(
			[
				{ field: 'isPaid', operator: 'eq', value: false, type: 'boolean' },
				amount({ value: 100.5 }),
			],
			'and',
		);

		expect(filter).toBe('isPaid eq false and value gt 100.5');
	});
});

/**
 * The type v0.7.0 adds, and the categories are what asked for it: `type` holds
 * one of two words, `in` or `out`, and offering it as free text would be asking
 * someone to guess which.
 *
 * It is a text literal in every other respect — quoted, apostrophe doubled —
 * because that is what the API takes. Measured on 2026-07-26 against
 * `/categories`: `type eq 'in'` and `type ne 'in'` both answer 200. Worth
 * saying out loud, because the same thing is not true everywhere: on the
 * stakeholders `document/type eq 'Cpf'` is a 500, which is why that field is
 * not on their menu at all.
 */
describe('buildODataFilter — the options type', () => {
	function choice(parts: Partial<IODataCondition>): IODataCondition {
		return { field: 'type', operator: 'eq', value: 'in', type: 'options', ...parts };
	}

	it.each([
		['eq', "type eq 'in'"],
		['ne', "type ne 'in'"],
	])('writes %s as the quoted literal the API takes', (operator, expected) => {
		expect(buildODataFilter([choice({ operator })], 'and')).toBe(expected);
	});

	it('writes the other choice the same way', () => {
		expect(buildODataFilter([choice({ value: 'out' })], 'and')).toBe("type eq 'out'");
	});

	// The value comes from a closed list, so this can only reach it through an
	// expression — but the escaping is the text one, and it costs nothing to keep.
	it('escapes an apostrophe, exactly as a text value does', () => {
		expect(buildODataFilter([choice({ value: "D'ALESSANDRO" })], 'and')).toBe(
			"type eq 'D''ALESSANDRO'",
		);
	});

	it('skips a condition whose choice was left empty', () => {
		expect(buildODataFilter([choice({ value: '' })], 'and')).toBe('');
	});

	// Two operators and no more: a list of two words has nothing to be greater
	// than, and `contains` on it is a question nobody means to ask.
	it.each(['contains', 'gt', 'startswith'])('refuses %s, which no choice can be asked', (operator) => {
		expect(() => buildODataFilter([choice({ operator })], 'and')).toThrow(new RegExp(operator));
	});

	it('joins a choice with the conditions around it', () => {
		const filter = buildODataFilter(
			[choice({}), { field: 'name', operator: 'contains', value: 'Receita', type: 'text' }],
			'and',
		);

		expect(filter).toBe("type eq 'in' and contains(name,'Receita')");
	});
});

/**
 * The type that looks like text and is not.
 *
 * A GUID column of this API is compared **bare**: `costCenterId eq '<guid>'`
 * answers HTTP 500 — *Found operand types 'Edm.Guid' and 'Edm.String'* — while
 * the same expression without quotes answers 200. Measured on 2026-07-26 on
 * `/costcenters` and on `/categories` alike. It is the exact opposite of what
 * every text field of this API requires, which is why it is a type rather than
 * a special case somebody has to remember.
 */
/**
 * The `code` type, added in 0.13.0 for the one column that is a **closed list of
 * numbers**: the status of a collection.
 *
 * It is neither of the two types that already existed. `options` writes a quoted
 * literal — `status/code eq '3'` is a 500 *"incompatible types"* — and `number`
 * writes bare but offers a box, which asks somebody to remember that a paid
 * charge is `3`. So: the dropdown of `options`, the bare literal of `number`.
 *
 * Measured on 2026-07-28: `$filter=status/code eq 3` answers 200. And the codes
 * are not guessable — `1` pending, `3` paid, `-1` cancelled.
 */
describe('buildODataFilter — the code type', () => {
	it('writes the chosen code bare, because the column is a number', () => {
		const filter = buildODataFilter(
			[condition({ field: 'status/code', operator: 'eq', value: '3', type: 'code' })],
			'and',
		);

		expect(filter).toBe('status/code eq 3');
	});

	it('writes a negative code, which is what a cancelled charge is', () => {
		const filter = buildODataFilter(
			[condition({ field: 'status/code', operator: 'ne', value: '-1', type: 'code' })],
			'and',
		);

		expect(filter).toBe('status/code ne -1');
	});

	it('takes the code as a number as well as a string, since the list stores either', () => {
		const filter = buildODataFilter(
			[condition({ field: 'status/code', operator: 'eq', value: 1, type: 'code' })],
			'and',
		);

		expect(filter).toBe('status/code eq 1');
	});

	// The same two an identifier gets, and for the same reason: a handful of
	// named states has nothing to be greater than.
	it.each(['gt', 'lt', 'contains'])('refuses the operator %s, which the list cannot answer', (operator) => {
		expect(() =>
			buildODataFilter(
				[condition({ field: 'status/code', operator, value: '3', type: 'code' })],
				'and',
			),
		).toThrow(/not one this node can write/);
	});

	/**
	 * A value that is not a number would be pasted straight into the expression
	 * and answered with a 500 about operand types — the same failure the guid
	 * type refuses locally, for the same reason: a condition that fails is a scan
	 * that hands back nothing, which reads as "no records" to whoever is watching.
	 */
	it('refuses a code that is not a number rather than sending it', () => {
		expect(() =>
			buildODataFilter(
				[condition({ field: 'status/code', operator: 'eq', value: 'Paga', type: 'code' })],
				'and',
			),
		).toThrow(/"Paga"/);
	});

	it('skips a row whose code was never chosen', () => {
		expect(
			buildODataFilter(
				[condition({ field: 'status/code', operator: 'eq', value: '', type: 'code' })],
				'and',
			),
		).toBe('');
	});
});

describe('buildODataFilter — the guid type', () => {
	const ID = '2efffcd0-8730-4348-86da-6d9a95be6149';

	function identifier(parts: Partial<IODataCondition>): IODataCondition {
		return { field: 'costCenterId', operator: 'eq', value: ID, type: 'guid', ...parts };
	}

	it.each([
		['eq', `costCenterId eq ${ID}`],
		['ne', `costCenterId ne ${ID}`],
	])('writes %s bare, which is what an ID column takes', (operator, expected) => {
		expect(buildODataFilter([identifier({ operator })], 'and')).toBe(expected);
	});

	it('never quotes the value, which is the 500', () => {
		expect(buildODataFilter([identifier({})], 'and')).not.toContain("'");
	});

	it('takes an ID in capitals as it was typed', () => {
		expect(buildODataFilter([identifier({ value: ID.toUpperCase() })], 'and')).toBe(
			`costCenterId eq ${ID.toUpperCase()}`,
		);
	});

	it('skips a condition whose ID was left empty', () => {
		expect(buildODataFilter([identifier({ value: '' })], 'and')).toBe('');
	});

	/**
	 * Refused here rather than sent. The server's answer to a malformed one is a
	 * 500 about operand types that names neither the field nor the value, and a
	 * condition that fails is a scan that returns nothing — which reads as "no
	 * records" to whoever is watching.
	 */
	it('refuses a value that is not an ID instead of sending it', () => {
		expect(() => buildODataFilter([identifier({ value: 'Filial Rio' })], 'and')).toThrow(
			/Filial Rio/,
		);
	});

	it.each(['contains', 'gt', 'startswith'])('refuses %s, which no ID can be asked', (operator) => {
		expect(() => buildODataFilter([identifier({ operator })], 'and')).toThrow(
			new RegExp(operator),
		);
	});

	it('joins an ID with the conditions around it', () => {
		const filter = buildODataFilter(
			[identifier({}), { field: 'description', operator: 'contains', value: 'Rio', type: 'text' }],
			'and',
		);

		expect(filter).toBe(`costCenterId eq ${ID} and contains(description,'Rio')`);
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

	it.each([[''], ['   '], [undefined], [null]])(
		'skips a number condition whose value was left empty (%s)',
		(value) => {
			expect(
				buildODataFilter([{ field: 'value', operator: 'gt', value, type: 'number' }], 'and'),
			).toBe('');
		},
	);

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
