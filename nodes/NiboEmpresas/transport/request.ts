import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { classifyNiboError } from './errors';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * The one and only HTTP exit of this package. Every call to the Nibo Empresas
 * API flows through here, so the cross-cutting rules live in a single place:
 *
 * - Authentication via the n8n credential (the "ApiToken" header).
 * - The body is always handed to the helper as a plain JS object. The API
 *   reacts to broken encoding with misleading errors that never mention
 *   encoding, so JSON is never assembled by hand anywhere in this package.
 * - Errors are classified once (see errors.ts) and re-thrown as NodeApiError
 *   with a readable message and the original response body preserved — never
 *   swallowed.
 */
export async function niboApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body?: IDataObject,
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		qs,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json; charset=utf-8',
		},
		json: true,
	};

	if (body !== undefined) {
		options.body = body;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
	} catch (error) {
		throw asNiboApiError.call(this, error);
	}
}

/**
 * Turns whatever the HTTP helper threw into a NodeApiError a user can act on.
 *
 * The helper already wraps failures in a NodeApiError whose message comes from
 * a table of HTTP status codes — "The service was not able to process your
 * request" for every 500. Since this API answers 500 for invalid requests too,
 * that generic text hides the one sentence that matters. So the error is built
 * again from the classified body, and the body itself travels along untouched.
 *
 * A NodeApiError cannot simply be re-wrapped: its constructor returns the same
 * instance when handed one, which would silently drop the message below.
 */
function asNiboApiError(this: IExecuteFunctions, error: unknown): NodeApiError {
	const info = classifyNiboError(error);

	const payload: JsonObject = {};
	if (typeof info.body === 'object' && info.body !== null) {
		payload.error = info.body as JsonObject;
	} else if (info.body !== undefined) {
		payload.body = info.body as JsonObject;
	}
	if (error instanceof Error) {
		payload.message = error.message;
	}

	return new NodeApiError(this.getNode(), payload, {
		message: info.message,
		description: info.description,
		httpCode: info.httpCode,
	});
}
