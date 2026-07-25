import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { classifyNiboError } from './errors';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * The one and only HTTP exit of this package. Every call to the Nibo Empresas
 * API flows through here, so the cross-cutting rules live in a single place:
 *
 * - Authentication, in either of the two modes below. The mode is read here,
 *   and only here.
 * - The body is always handed to the helper as a plain JS object. The API
 *   reacts to broken encoding with misleading errors that never mention
 *   encoding, so JSON is never assembled by hand anywhere in this package.
 * - Errors are classified once (see errors.ts) and re-thrown as NodeApiError
 *   with a readable message and the original response body preserved — never
 *   swallowed.
 *
 * `itemIndex` is not decoration: it is what makes the per-item mode possible.
 * A node's `credentials` field cannot hold an expression — it is resolved once
 * per node — while `getNodeParameter(name, itemIndex)` resolves the expression
 * FOR THAT ITEM. Carrying the index down to the HTTP exit is therefore the
 * whole mechanism behind one node walking a portfolio of organizations, each
 * item reading the books of its own token.
 */
export async function niboApiRequest(
	this: IExecuteFunctions,
	itemIndex: number,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body?: IDataObject,
): Promise<unknown> {
	// Nodes saved before this parameter existed have no value for it, and the
	// fallback is what keeps them on the behavior they were built with.
	const authentication = this.getNodeParameter('authentication', itemIndex, 'credential');

	try {
		return authentication === 'field'
			? await requestWithItemToken.call(this, itemIndex, method, endpoint, qs, body)
			: await requestWithCredential.call(this, method, endpoint, qs, body);
	} catch (error) {
		// A missing token never reached the network, so there is no API answer to
		// classify — and its itemIndex is what keeps `continueOnFail` and the
		// error output working item by item. Rethrown as an expression, not as a
		// bare `throw error`, which the scanner reads as losing node context.
		throw error instanceof NodeOperationError ? error : asNiboApiError.call(this, error);
	}
}

/**
 * Mode "credential": the n8n credential holds both the token and the base URL,
 * and the helper injects the ApiToken header from it.
 *
 * Kept apart from the per-item mode on purpose. The official scanner rejects
 * `this.helpers.httpRequest()` inside any function that also calls
 * `this.getCredentials()` — one function per mode is both the way past that
 * rule and the honest shape of the code.
 */
async function requestWithCredential(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject,
	body?: IDataObject,
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const options = requestOptions(
		(credentials.baseUrl as string) || DEFAULT_BASE_URL,
		method,
		endpoint,
		qs,
		body,
	);

	return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
}

/**
 * Mode "field": the token comes from a node parameter, resolved for this item,
 * and is sent as the ApiToken header by hand.
 *
 * There is no base URL to read here — no credential exists in this mode — so
 * the address is the only one the API has ever had. Anyone needing another one
 * uses the credential mode, where the field still exists.
 */
async function requestWithItemToken(
	this: IExecuteFunctions,
	itemIndex: number,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject,
	body?: IDataObject,
): Promise<unknown> {
	const token = String(this.getNodeParameter('apiToken', itemIndex, '') ?? '').trim();
	if (token === '') {
		throw new NodeOperationError(this.getNode(), 'This item carries no Nibo API token', {
			itemIndex,
			description:
				'Authentication is set to "API Token (Per Item)", so every input item has to supply a token — usually through an expression reading it from the item, such as {{ $json.apiToken }}.',
		});
	}

	const options = requestOptions(DEFAULT_BASE_URL, method, endpoint, qs, body);
	options.headers = { ...options.headers, ApiToken: token };

	return await this.helpers.httpRequest(options);
}

/** The request both modes send, minus how it is authenticated */
function requestOptions(
	baseUrl: string,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject,
	body?: IDataObject,
): IHttpRequestOptions {
	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl.replace(/\/+$/, '')}${endpoint}`,
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

	return options;
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
