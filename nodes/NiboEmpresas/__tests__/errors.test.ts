import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { classifyNiboError } from '../transport/errors';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * What axios throws, and what `httpRequestWithAuthentication` hands to
 * NodeApiError: the parsed body lives in `response.data`.
 */
function axiosError(statusCode: number, body: unknown, message = 'Request failed'): Error {
	return Object.assign(new Error(message), {
		isAxiosError: true,
		response: { status: statusCode, statusText: '', headers: {}, data: body },
	});
}

/**
 * The older shape, produced by `this.helpers.request`, which augments the
 * error with `statusCode` and `error` (the body). Kept covered so the
 * classifier stays usable from either helper.
 */
function httpError(statusCode: number, body: unknown, message = 'Request failed'): Error {
	return Object.assign(new Error(message), {
		statusCode,
		error: body,
		response: { status: statusCode, statusText: '', headers: {} },
	});
}

describe('classifyNiboError', () => {
	it('classifies HTTP 401 as an authentication problem', () => {
		const info = classifyNiboError(
			httpError(401, { Message: 'Authorization has been denied for this request.' }),
		);

		expect(info.kind).toBe('auth');
		expect(info.httpCode).toBe('401');
		expect(info.message).toMatch(/token/i);
	});

	it('classifies a validation_error body as a validation problem, not a server failure', () => {
		const info = classifyNiboError(
			httpError(500, {
				error: 'validation_error',
				error_description: "Could not find a property named 'foo' on type 'Customer'",
			}),
		);

		expect(info.kind).toBe('validation');
		expect(info.message).toContain("Could not find a property named 'foo' on type 'Customer'");
	});

	it('classifies an internal_server_error body as a server failure', () => {
		const info = classifyNiboError(
			httpError(500, {
				error: 'internal_server_error',
				error_description: 'Object reference not set to an instance of an object.',
			}),
		);

		expect(info.kind).toBe('server');
		expect(info.message).toContain('Object reference not set to an instance of an object.');
	});

	it('falls back to unknown for a body it does not recognize', () => {
		const info = classifyNiboError(httpError(502, '<html>Bad gateway</html>', 'socket hang up'));

		expect(info.kind).toBe('unknown');
		expect(info.message).toContain('socket hang up');
	});

	it('reads the body through the NodeApiError the n8n helper already threw', () => {
		// httpRequestWithAuthentication wraps the axios failure in a
		// NodeApiError before it ever reaches this package. That wrapper keeps
		// the response body in `context.data` and reduces the useful text to a
		// generic "The service was not able to process your request" — which is
		// exactly the message this classification exists to replace.
		const wrapped = new NodeApiError(
			NODE,
			axiosError(500, {
				error: 'validation_error',
				error_description: 'The $orderby expression must evaluate to a single value',
			}) as unknown as JsonObject,
		);

		const info = classifyNiboError(wrapped);

		expect(info.kind).toBe('validation');
		expect(info.message).toContain('The $orderby expression must evaluate to a single value');
	});

	/**
	 * The rate limit, met for the first time on 2026-07-27 while probing the
	 * account writes: **14 calls per second**, answered as HTTP 429 with a body
	 * that is PLAIN TEXT — `API calls quota exceeded! maximum admitted 14 per
	 * Second.` — not JSON.
	 *
	 * It earned its classification the hard way: a probe read that 429 text as an
	 * empty collection and "proved" something false about the API. A 429 that
	 * falls through to the generic message invites exactly that misreading.
	 */
	it('classifies HTTP 429 as the rate limit, naming the measured ceiling', () => {
		const info = classifyNiboError(
			httpError(429, 'API calls quota exceeded! maximum admitted 14 per Second.'),
		);

		expect(info.kind).toBe('rateLimit');
		expect(info.httpCode).toBe('429');
		expect(info.message).toMatch(/14.*second/i);
		expect(info.description).toMatch(/Interval Between Requests/);
	});

	it('classifies a wrapped 429 the same way, even with the text body', () => {
		const wrapped = new NodeApiError(
			NODE,
			axiosError(429, 'API calls quota exceeded! maximum admitted 14 per Second.') as unknown as JsonObject,
		);

		const info = classifyNiboError(wrapped);

		expect(info.kind).toBe('rateLimit');
		expect(info.httpCode).toBe('429');
	});

	it('classifies a wrapped 401 as an authentication problem', () => {
		const wrapped = new NodeApiError(
			NODE,
			axiosError(401, { Message: 'Authorization has been denied for this request.' }) as unknown as JsonObject,
		);

		const info = classifyNiboError(wrapped);

		expect(info.kind).toBe('auth');
		expect(info.httpCode).toBe('401');
	});

	it('reads the body from a nested response.data payload', () => {
		const info = classifyNiboError({
			response: {
				status: 500,
				data: { error: 'validation_error', error_description: 'Invalid filter' },
			},
		});

		expect(info.kind).toBe('validation');
		expect(info.message).toContain('Invalid filter');
	});

	it('tells validation and server failures apart in the retry hint', () => {
		const validation = classifyNiboError(
			httpError(500, { error: 'validation_error', error_description: 'nope' }),
		);
		const server = classifyNiboError(
			httpError(500, { error: 'internal_server_error', error_description: 'boom' }),
		);

		expect(validation.description).toMatch(/retry/i);
		expect(server.description).toMatch(/retry/i);
		expect(validation.description).not.toBe(server.description);
	});
});
