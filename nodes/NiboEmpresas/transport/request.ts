import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

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
 * - Errors are re-thrown as NodeApiError with the original response preserved,
 *   never swallowed or rewritten.
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
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}
