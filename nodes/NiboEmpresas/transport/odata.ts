/**
 * The `$filter` expression builder behind the assisted filter.
 *
 * Until 0.5.0 the expression went to the API exactly as it was typed, so a name
 * with an apostrophe — `D'ALESSANDRO` — closed the literal early and the API
 * answered HTTP 500 `validation_error`, *unterminated literal*, with nothing in
 * the answer pointing at the quote. That is the defect this module exists for.
 *
 * Two rules make it correct, both measured against the API on 2026-07-25:
 *
 * - **An apostrophe is escaped by doubling it.** `D''ALESSANDRO` answers 200.
 * - **Each type carries its own literal.** Text goes between single quotes;
 *   boolean, number and date go bare. Quoting a boolean (`isCompany eq 'true'`)
 *   is a 500, quoting a number (`value gt '100'`) is a 500 naming the two types
 *   it could not compare, and so is the OData v2 spelling of a date
 *   (`datetime'2020-01-01'`).
 *
 * Pure by design — no `this`, no network, no idea that Nibo exists. It takes a
 * field path, an operator, a value and the value's type, and answers text. That
 * is what lets the resources still to come (schedules, payments, NFS-e) filter
 * through it without a line of it changing.
 */

/**
 * What the value is, which is what decides how the literal is written.
 *
 * `options` is a text value from a closed list — the API takes the same quoted
 * literal, and what the list buys is the person not having to guess which words
 * are on it.
 *
 * `guid` is the one type that looks like text and is not. A GUID column of this
 * API is compared **bare**: `costCenterId eq '<guid>'` answers HTTP 500 —
 * *Found operand types 'Edm.Guid' and 'Edm.String'* — while the same expression
 * without the quotes answers 200. Measured on 2026-07-26 on `/costcenters` and
 * on `/categories` alike. It is the exact opposite of what every text field
 * here requires, which is why it is a type of its own rather than a special
 * case somebody has to remember.
 */
export type ODataFieldType = 'text' | 'boolean' | 'number' | 'options' | 'date' | 'guid';

export interface IODataCondition {
	/** The field path as the API names it, e.g. `name` or `document/number` */
	field: string;
	/** One of the operators below, as the UI stores it */
	operator: string;
	/** The value as the editor collected it */
	value: unknown;
	type: ODataFieldType;
}

/** Operators written as `f(field,'value')` — the API's own function syntax */
const FUNCTION_OPERATORS = ['contains', 'startswith', 'endswith'];

/**
 * `contains` under `tolower()`, which the API accepts and which is what almost
 * everybody means by "find this name".
 */
const CONTAINS_IGNORING_CASE = 'containsIgnoreCase';

/**
 * Which operators each type can be asked for. The UI offers exactly these, so
 * anything else is a node saved with an operator this version does not have —
 * see `writeCondition` for why that fails rather than being ignored.
 */
const OPERATORS_OF: Record<ODataFieldType, string[]> = {
	text: [CONTAINS_IGNORING_CASE, ...FUNCTION_OPERATORS, 'eq', 'ne'],
	boolean: ['eq', 'ne'],
	// All six measured on 2026-07-26 against `/schedules/credit`, each with the
	// literal bare: an amount is the one type where "exactly this" and "more
	// than this" are both ordinary questions.
	number: ['eq', 'ne', 'gt', 'ge', 'lt', 'le'],
	// Two, and no more: a list of a few words has nothing to be greater than.
	// Measured on 2026-07-26 on `/categories`, where `type eq 'in'` answers 200 —
	// which is not a given, since the same shape is a 500 on the stakeholders'
	// `document/type`. A closed list is only offered where it was measured.
	options: ['eq', 'ne'],
	date: ['gt', 'ge', 'lt', 'le'],
	// Two, and no more: an identifier is the same one or a different one. There
	// is nothing to be greater than and no substring worth looking for.
	guid: ['eq', 'ne'],
};

/** The shape a GUID column compares against — anything else is a 500, not a miss */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns the conditions the editor collected into one `$filter` expression.
 *
 * Answers `''` when there is nothing to filter by, which is what the transport
 * reads as "send no `$filter` at all".
 *
 * The conditions are joined by a single operator, chosen once, so there is no
 * precedence to parenthesize away. Nested groups — `(A or B) and C` — are what
 * the raw OData field stays for.
 */
export function buildODataFilter(
	conditions: IODataCondition[] | undefined,
	combine: string,
): string {
	const joiner = combine === 'or' ? 'or' : 'and';

	return (conditions ?? [])
		.map(writeCondition)
		.filter((written): written is string => written !== undefined)
		.join(` ${joiner} `);
}

/**
 * One condition, or `undefined` when there is nothing to write.
 *
 * A row added and left blank is an unfinished row, not "match everything", so
 * it is skipped. An operator that is not on the menu is a different thing: it
 * cannot be written, and dropping it would silently widen the result — the
 * direction a workflow deletes by — so it fails instead, and the handler turns
 * it into an error carrying the index of the item it happened on.
 */
function writeCondition(condition: IODataCondition): string | undefined {
	const field = String(condition.field ?? '').trim();
	const operator = String(condition.operator ?? '').trim();

	if (field === '' || operator === '') {
		return undefined;
	}

	if (!OPERATORS_OF[condition.type]?.includes(operator)) {
		throw new Error(
			`The filter operator "${operator}" is not one this node can write for a ${condition.type} field`,
		);
	}

	if (condition.type === 'boolean') {
		// Never skipped: `false` is an answer, not a blank. And written bare —
		// `isCompany eq 'true'` is a 500.
		const yes = condition.value === true || condition.value === 'true';

		return `${field} ${operator} ${yes ? 'true' : 'false'}`;
	}

	if (condition.type === 'number') {
		const amount = numberLiteral(condition.value);

		return amount === undefined ? undefined : `${field} ${operator} ${amount}`;
	}

	if (condition.type === 'guid') {
		const id = String(condition.value ?? '').trim();
		if (id === '') {
			return undefined;
		}

		// Refused here rather than sent, because the server's answer to a
		// malformed one is a 500 about operand types that names neither the field
		// nor the value — and a condition that fails is a scan that hands back
		// nothing, which reads as "no records" to whoever is watching.
		if (!GUID.test(id)) {
			throw new Error(`The filter value "${id}" is not the ID this node can compare with`);
		}

		// Bare. See the note on the type: quoting this is the 500.
		return `${field} ${operator} ${id}`;
	}

	if (condition.type === 'date') {
		const date = String(condition.value ?? '').trim();

		// Every form the editor's date field produces was measured and accepted:
		// bare, with a Z, with milliseconds, with an offset. So it travels as it
		// came — bare, because quoting it is a 500.
		return date === '' ? undefined : `${field} ${operator} ${date}`;
	}

	// Text, and `options` with it: a choice from a closed list is a text value
	// that happens to have been picked rather than typed, and the API takes the
	// very same quoted literal for both. The list is a fact about the UI, not
	// about the expression, so it earns no branch here.
	const text = String(condition.value ?? '');
	if (text === '') {
		return undefined;
	}

	if (operator === CONTAINS_IGNORING_CASE) {
		return `contains(tolower(${field}),${quote(text.toLowerCase())})`;
	}

	return FUNCTION_OPERATORS.includes(operator)
		? `${operator}(${field},${quote(text)})`
		: `${field} ${operator} ${quote(text)}`;
}

/**
 * A number literal — bare, with its cents — or `undefined` when there is
 * nothing to compare with.
 *
 * The editor collects an amount in a number box, so most of the time the value
 * arrives as a number and there is nothing to do. The text path is for the
 * other way in: an expression, reading whatever the incoming item carried. In
 * this country that is written `100,50`, which is the same amount, so the
 * decimal comma is read as the point it means.
 *
 * Everything else fails rather than travelling. `1.234,56` is the reason: read
 * one way it is a thousand and read the other it is one and a bit, and nothing
 * in the value says which — a filter that guessed would quietly return the
 * wrong records, which is the direction a workflow deletes by.
 */
function numberLiteral(value: unknown): string | undefined {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new Error(`The filter value "${value}" is not a number this node can compare with`);
		}

		return String(value);
	}

	const text = String(value ?? '')
		.trim()
		.replace(/^\+/, '');
	if (text === '') {
		return undefined;
	}

	// Only when there is no point to disagree with: `1.234,56` keeps its comma
	// here and is refused below, which is the whole point.
	const written = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text;

	if (!/^-?\d+(\.\d+)?$/.test(written)) {
		throw new Error(`The filter value "${text}" is not a number this node can compare with`);
	}

	return written;
}

/** A text literal: single quotes, and every apostrophe inside doubled */
function quote(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}
