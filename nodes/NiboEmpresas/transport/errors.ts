/**
 * Error classification for the Nibo Empresas API.
 *
 * The API answers **HTTP 500 for invalid requests too** — a malformed
 * `$filter`, a sort field that does not exist, a business rule that was
 * broken. The only reliable discriminator is the `error` field of the
 * response body:
 *
 *   { "error": "validation_error",      "error_description": "..." }  -> the request is wrong
 *   { "error": "internal_server_error", "error_description": "..." }  -> the server failed
 *
 * Treating both as "server error, try again" is wrong for the first one:
 * retrying never fixes a bad request, and the useful text is in
 * `error_description`. A missing or invalid token is a plain 401.
 *
 * This module is deliberately pure — no `this`, no network — so it can be
 * tested in isolation and used from a single place in the transport.
 */

export type NiboErrorKind =
	| 'auth'
	| 'validation'
	| 'server'
	| 'rateLimit'
	| 'tooLarge'
	| 'unknown';

export interface INiboErrorInfo {
	kind: NiboErrorKind;
	/** Ready to show to the user, in English */
	message: string;
	/** Longer hint, including whether retrying makes sense */
	description?: string;
	httpCode?: string;
	/** The response body exactly as the API sent it, for the caller to preserve */
	body?: unknown;
}

type UnknownRecord = Record<string, unknown>;

// Where the body and the status code hide, depending on who wrapped the
// failure. `httpRequestWithAuthentication` throws a NodeApiError built from
// the axios error: that wrapper keeps the response body in `context.data` and
// the status in `httpCode`, while `this.helpers.request` instead augments the
// error with `error` (the body) and `statusCode`. Both are covered here so
// classification never depends on which helper raised the failure.
const CONTAINER_KEYS = [
	'error',
	'body',
	'data',
	'response',
	'context',
	'cause',
	'errorResponse',
];
const STATUS_KEYS = ['statusCode', 'httpCode', 'status'];
const MAX_DEPTH = 5;

const RETRY_HINT_VALIDATION =
	'The Nibo API answers HTTP 500 for invalid requests as well. Retrying will not help: fix the request itself (the filter expression or the sort field, for example).';
const RETRY_HINT_SERVER =
	'This one is a genuine server-side failure, so retrying can help — turn on "Retry On Fail" in the node settings if it keeps happening.';
const AUTH_HINT =
	'Check the API token in the Nibo Empresas credential. In this API the token selects the organization, so a token that belongs to another organization fails exactly like an expired one.';

/**
 * Measured on 2026-07-27, the first 429 this project ever saw from this API —
 * and the body is plain text, not JSON, so none of the JSON discriminators
 * apply. The classification exists because an unrecognized 429 does worse than
 * read badly: a probe once took that text body for an empty collection and
 * briefly "proved" something false about the API.
 */
const RATE_LIMIT_HINT =
	'Nibo allows at most 14 calls per second per organization. The default Interval Between Requests (1000 ms, under Options) stays well clear of it — this usually means the interval was set to 0 on a large batch, or several executions hit the same organization at once. Waiting and retrying works: the request itself is fine.';

/**
 * The upload ceiling, measured on 2026-07-28: the classic ASP.NET
 * `maxRequestLength`, counted over the **whole request** rather than over the
 * file. It is the second body of this API that is not JSON — HTML at 411, plain
 * text at 413 — and the third shape is worse than either, because at exactly
 * 10 MB the answer is a perfectly well-formed JSON 500 whose sentence, *"O Nibo
 * se comportou de forma inesperada."*, is the one every internal failure
 * carries. Nothing in any of the three mentions size.
 */
const TOO_LARGE_HINT =
	'The whole request may not reach 10,485,760 bytes, and the multipart envelope — the field name, the file name and its content type — is counted inside it, so the file itself has to stay a little under that. Retrying does not help: send a smaller file, or split the document. The node refuses anything from 10,484,736 bytes upwards before any call is made, so reaching this answer means the envelope carried a file just below that line over the edge.';

function asRecord(value: unknown): UnknownRecord | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as UnknownRecord;
}

/** Depth-first search for the object carrying the API's `error` discriminator */
function findBody(value: unknown, depth = 0): UnknownRecord | undefined {
	const record = asRecord(value);
	if (record === undefined || depth > MAX_DEPTH) {
		return undefined;
	}

	if (typeof record.error === 'string') {
		return record;
	}

	for (const key of CONTAINER_KEYS) {
		const found = findBody(record[key], depth + 1);
		if (found !== undefined) {
			return found;
		}
	}

	return undefined;
}

function findStatus(value: unknown, depth = 0): string | undefined {
	const record = asRecord(value);
	if (record === undefined || depth > MAX_DEPTH) {
		return undefined;
	}

	for (const key of STATUS_KEYS) {
		const status = record[key];
		if (typeof status === 'number' || (typeof status === 'string' && status !== '')) {
			return String(status);
		}
	}

	for (const key of CONTAINER_KEYS) {
		const found = findStatus(record[key], depth + 1);
		if (found !== undefined) {
			return found;
		}
	}

	return undefined;
}

function originalMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	const record = asRecord(error);
	if (record !== undefined && typeof record.message === 'string' && record.message !== '') {
		return record.message;
	}
	return 'The Nibo Empresas API request failed';
}

function describedBy(body: UnknownRecord | undefined, fallback: string): string {
	for (const key of ['error_description', 'errorDescription', 'Message', 'message']) {
		const value = body?.[key];
		if (typeof value === 'string' && value !== '') {
			return value;
		}
	}
	return fallback;
}

export interface INiboErrorContext {
	/** The call that failed was carrying a file up */
	upload?: boolean;
}

/**
 * Whether a failed upload is the size ceiling wearing the internal-failure
 * sentence. Only the status and the discriminator are asked: the text itself
 * says nothing about size, and matching on Portuguese prose would break the day
 * Nibo rewords it.
 */
function isUploadCeiling(httpCode: string | undefined, body: UnknownRecord | undefined): boolean {
	return httpCode === '500' && body?.error === 'internal_server_error';
}

export function classifyNiboError(
	error: unknown,
	context: INiboErrorContext = {},
): INiboErrorInfo {
	const body = findBody(error);
	const httpCode = findStatus(error);
	const fallback = originalMessage(error);

	// Read before the 500 below, and only for a call that was carrying a file:
	// the body of that 500 is indistinguishable from any other internal failure,
	// so what tells them apart is what the caller was doing. Anywhere else the
	// same body keeps the meaning it always had.
	if (httpCode === '413' || (context.upload === true && isUploadCeiling(httpCode, body))) {
		return {
			kind: 'tooLarge',
			message: `Nibo refused the file: a request to this API may not reach 10 MB (HTTP ${httpCode ?? '413'})`,
			description: TOO_LARGE_HINT,
			httpCode,
			body,
		};
	}

	if (httpCode === '401') {
		return {
			kind: 'auth',
			message: 'The Nibo Empresas API rejected the token (HTTP 401)',
			description: AUTH_HINT,
			httpCode,
			body,
		};
	}

	if (httpCode === '429') {
		return {
			kind: 'rateLimit',
			message: 'Nibo refused the call: more than 14 requests in one second (HTTP 429)',
			description: RATE_LIMIT_HINT,
			httpCode,
			body,
		};
	}

	if (body?.error === 'validation_error') {
		return {
			kind: 'validation',
			message: `Nibo rejected the request: ${describedBy(body, fallback)}`,
			description: RETRY_HINT_VALIDATION,
			httpCode,
			body,
		};
	}

	if (body?.error === 'internal_server_error') {
		return {
			kind: 'server',
			message: `The Nibo Empresas API failed: ${describedBy(body, fallback)}`,
			description: RETRY_HINT_SERVER,
			httpCode,
			body,
		};
	}

	return { kind: 'unknown', message: fallback, httpCode, body };
}
