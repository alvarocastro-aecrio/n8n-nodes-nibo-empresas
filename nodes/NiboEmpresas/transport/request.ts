import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { INiboErrorContext } from './errors';
import { classifyNiboError } from './errors';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * Where a stored file is read back from — Nibo's own file service, and the host
 * the API itself hands out in the `url` of every attachment it lists. It is not
 * the API address and it does not come from the credential: there is no route
 * on the API that returns a file (`GET /files/{id}` is a 404, measured on
 * 2026-07-28), so this address is the only way back for a document.
 */
const FILE_SERVICE_URL = 'https://arquivos.nibo.com.br/download';

/** A file on its way up: the bytes, plus everything the multipart part needs */
export interface INiboUpload {
	/**
	 * The multipart field name. **Nibo ignores it** — a part called `anexo`
	 * uploads exactly as one called `file`, measured on 2026-07-28 — so `file` is
	 * a convention this package keeps rather than a requirement of the API.
	 */
	name: string;
	fileName: string;
	mimeType: string;
	data: Buffer;
}

/** A file on its way back */
export interface INiboDownload {
	data: Buffer;
	mimeType?: string;
	fileName?: string;
}

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
	// fallback is what keeps them on the behavior they were built with. The
	// name is `authMode`, not `authentication` — see the node description for
	// why that exact name is unusable here.
	const authMode = this.getNodeParameter('authMode', itemIndex, 'credential');

	try {
		return authMode === 'field'
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
 * The same exit, with a file in the body instead of a JSON object.
 *
 * It is a second entry rather than a flag on the first because everything about
 * the request changes: the content type, the shape of the body, and what a
 * failure means. That last one is the reason it cannot be folded in — at exactly
 * 10 MB this API answers a **JSON 500 whose sentence is the one every internal
 * failure carries**, and the only thing that tells the two apart is that a file
 * was going up. That fact lives here, at the exit, and travels to the
 * classification with the failure.
 *
 * Both authentication modes are untouched: the token still selects the
 * organization, and an upload that lost it would file the document in somebody
 * else's books.
 */
export async function niboUploadRequest(
	this: IExecuteFunctions,
	itemIndex: number,
	endpoint: string,
	file: INiboUpload,
): Promise<unknown> {
	const authMode = this.getNodeParameter('authMode', itemIndex, 'credential');

	try {
		return authMode === 'field'
			? await requestWithItemToken.call(this, itemIndex, 'POST', endpoint, {}, undefined, file)
			: await requestWithCredential.call(this, 'POST', endpoint, {}, undefined, file);
	} catch (error) {
		throw error instanceof NodeOperationError
			? error
			: asNiboApiError.call(this, error, { upload: true });
	}
}

/**
 * A stored document, read back from Nibo's file service.
 *
 * **It carries no token, and that is measured rather than forgotten.** The URL
 * this builds is the one the API itself publishes in the `url` of every listed
 * attachment, and on 2026-07-28 it was confirmed to answer a 302 to a signed
 * Azure link and hand the document over with no header, no cookie and no token
 * of any kind. Whoever holds a `fileId` holds the document — a fact the node
 * says out loud on screen rather than papers over.
 *
 * Given that, sending the organization's token would buy nothing and cost
 * something: n8n forwards credential headers across a cross-origin redirect by
 * default, so the token would end up at the storage host. If Nibo ever closes
 * the hole this route fails loudly with a 401, which is the honest way for it to
 * find out.
 */
export async function niboDownloadRequest(
	this: IExecuteFunctions,
	fileId: string,
): Promise<INiboDownload> {
	try {
		const response = (await this.helpers.httpRequest({
			method: 'GET',
			url: `${FILE_SERVICE_URL}/${encodeURIComponent(fileId)}`,
			// Without this the helper hands the bytes to a JSON parse and a PDF
			// comes back as mojibake, or as an exception on the first byte that is
			// not valid UTF-8.
			encoding: 'arraybuffer',
			json: false,
			// The content type is the whole reason: it is what the item's binary
			// gets, and this service is the only one that knows it.
			returnFullResponse: true,
		})) as { body: unknown; headers?: Record<string, unknown> };

		const headers = response.headers ?? {};

		return {
			data: Buffer.isBuffer(response.body)
				? response.body
				: Buffer.from(response.body as ArrayBuffer),
			mimeType: headerValue(headers, 'content-type'),
			fileName: fileNameFrom(headerValue(headers, 'content-disposition')),
		};
	} catch (error) {
		throw error instanceof NodeOperationError ? error : asNiboApiError.call(this, error);
	}
}

function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
	const key = Object.keys(headers).find((header) => header.toLowerCase() === name);
	const value = key === undefined ? undefined : headers[key];

	return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The name the service put on the document, when it put one there at all */
function fileNameFrom(contentDisposition: string | undefined): string | undefined {
	const quoted = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition ?? '');

	return quoted === null ? undefined : decodeURIComponent(quoted[1].trim());
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
	file?: INiboUpload,
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const options = requestOptions(
		(credentials.baseUrl as string) || DEFAULT_BASE_URL,
		method,
		endpoint,
		qs,
		body,
		file,
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
	file?: INiboUpload,
): Promise<unknown> {
	const token = String(this.getNodeParameter('apiToken', itemIndex, '') ?? '').trim();
	if (token === '') {
		throw new NodeOperationError(this.getNode(), 'This item carries no Nibo API token', {
			itemIndex,
			description:
				'Authentication is set to "API Token (Per Item)", so every input item has to supply a token — usually through an expression reading it from the item, such as {{ $json.apiToken }}.',
		});
	}

	const options = requestOptions(DEFAULT_BASE_URL, method, endpoint, qs, body, file);
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
	file?: INiboUpload,
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

	if (file !== undefined) {
		const part = multipartBody(file);

		// The JSON content type is replaced, not added to: a multipart body under
		// `application/json` is read by the server as a JSON document that fails to
		// parse, which this API answers with a 411 in HTML.
		options.headers = { ...options.headers, 'Content-Type': part.contentType };
		options.body = part.data;

		return options;
	}

	if (body !== undefined) {
		options.body = body;
	}

	return options;
}

const CRLF = '\r\n';

/**
 * One file, encoded as a `multipart/form-data` body.
 *
 * Written out by hand because this package has **no runtime dependency** — a
 * rule of the project and a requirement of the n8n verification programme — and
 * the n8n helpers offer no multipart builder of their own. What goes on the wire
 * is the smallest thing that is still a correct multipart body: one part, with
 * the field name, the file name and the content type Nibo stores and hands back
 * on download.
 */
function multipartBody(file: INiboUpload): { contentType: string; data: Buffer } {
	const boundary = boundaryFor(file.data);
	const head = Buffer.from(
		`--${boundary}${CRLF}` +
			`Content-Disposition: form-data; name="${quotable(file.name)}"; filename="${quotable(file.fileName)}"${CRLF}` +
			`Content-Type: ${file.mimeType}${CRLF}${CRLF}`,
		'utf8',
	);
	const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');

	return {
		contentType: `multipart/form-data; boundary=${boundary}`,
		data: Buffer.concat([head, file.data, tail]),
	};
}

/**
 * A boundary the document does not contain.
 *
 * Not a formality: a boundary that also occurs inside the bytes closes the part
 * early, and the server stores a **truncated file and answers 200**. Random
 * alone cannot promise that, so the bytes are asked. A file that reached this
 * loop twice would have to contain a string it could not have known.
 */
function boundaryFor(data: Buffer): string {
	let boundary = candidateBoundary();
	while (data.includes(boundary)) {
		boundary = candidateBoundary();
	}

	return boundary;
}

function candidateBoundary(): string {
	return `----NiboEmpresas${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * A header value that cannot break out of its own quotes. A file called
 * `note".pdf` would otherwise end the `filename=` early and leave the rest of
 * the name as a parameter the server reads as something else.
 */
function quotable(value: string): string {
	return value.replace(/[\r\n"]/g, '_');
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
function asNiboApiError(
	this: IExecuteFunctions,
	error: unknown,
	context: INiboErrorContext = {},
): NodeApiError {
	const info = classifyNiboError(error, context);

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
