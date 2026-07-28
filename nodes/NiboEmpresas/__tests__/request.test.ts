import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { niboApiRequest, niboDownloadRequest, niboUploadRequest } from '../transport/request';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function axiosError(statusCode: number, body: unknown): Error {
	return Object.assign(new Error(`Request failed with status code ${statusCode}`), {
		isAxiosError: true,
		response: { status: statusCode, statusText: '', headers: {}, data: body },
	});
}

interface IHelpers {
	httpRequestWithAuthentication?: jest.Mock;
	httpRequest?: jest.Mock;
}

/**
 * A node context whose parameters resolve per item, like the real one: an array
 * value is read at the item index, anything else is the same for every item.
 * No parameter of this node is itself an array, so the shape is unambiguous.
 */
function context(helpers: IHelpers, parameters: IDataObject = {}) {
	return {
		getCredentials: jest.fn().mockResolvedValue({ apiToken: 'not-a-real-token' }),
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) => {
			const value = parameters[name];
			if (Array.isArray(value)) {
				return value[itemIndex] ?? fallback;
			}
			return value ?? fallback;
		},
		getNode: () => NODE,
		helpers,
	} as unknown as IExecuteFunctions;
}

/** What the n8n helper throws: the axios failure, already wrapped */
function helperRejecting(statusCode: number, body: unknown): jest.Mock {
	return jest.fn().mockImplementation(async () => {
		throw new NodeApiError(NODE, axiosError(statusCode, body) as never);
	});
}

async function failureFrom(
	helper: jest.Mock,
	parameters: IDataObject = {},
): Promise<NodeApiError> {
	const helpers =
		parameters.authMode === 'field'
			? { httpRequest: helper }
			: { httpRequestWithAuthentication: helper };

	try {
		await niboApiRequest.call(context(helpers, parameters), 0, 'GET', '/customers');
	} catch (thrown) {
		return thrown as NodeApiError;
	}
	throw new Error('expected niboApiRequest to throw, but it resolved');
}

describe('niboApiRequest — credential mode', () => {
	it('calls the n8n helper with the credential, the query and a JS object body', async () => {
		const helper = jest.fn().mockResolvedValue({ items: [], count: 0 });

		await niboApiRequest.call(
			context({ httpRequestWithAuthentication: helper }),
			0,
			'GET',
			'/customers',
			{ $top: 5 },
		);

		const [credentialName, options] = helper.mock.calls[0];
		expect(credentialName).toBe('niboEmpresasApi');
		expect(options.url).toBe('https://api.nibo.com.br/empresas/v1/customers');
		expect(options.qs).toEqual({ $top: 5 });
		expect(options.json).toBe(true);
	});

	it('is what a node saved before the mode existed still gets', async () => {
		const helper = jest.fn().mockResolvedValue({ items: [] });
		const unauthenticated = jest.fn();

		await niboApiRequest.call(
			context({ httpRequestWithAuthentication: helper, httpRequest: unauthenticated }),
			0,
			'GET',
			'/customers',
		);

		expect(helper).toHaveBeenCalledTimes(1);
		expect(unauthenticated).not.toHaveBeenCalled();
	});
});

describe('niboApiRequest — per-item token mode', () => {
	it('sends the item token in the ApiToken header, against the default base URL', async () => {
		const helper = jest.fn().mockResolvedValue({ items: [], count: 0 });
		const withCredential = jest.fn();

		await niboApiRequest.call(
			context(
				{ httpRequest: helper, httpRequestWithAuthentication: withCredential },
				{ authMode: 'field', apiToken: 'token-of-item-0' },
			),
			0,
			'GET',
			'/customers',
		);

		const [options] = helper.mock.calls[0];
		expect(options.headers.ApiToken).toBe('token-of-item-0');
		expect(options.url).toBe('https://api.nibo.com.br/empresas/v1/customers');
		expect(withCredential).not.toHaveBeenCalled();
	});

	// The whole point of the version: without the index travelling all the way
	// to the HTTP exit, every item of one execution would send the same token.
	it('resolves a different token for each item of the same execution', async () => {
		const helper = jest.fn().mockResolvedValue({ items: [] });
		const ctx = context(
			{ httpRequest: helper },
			{
				authMode: 'field',
				apiToken: ['token-of-item-0', 'token-of-item-1', 'token-of-item-2'],
			},
		);

		await niboApiRequest.call(ctx, 0, 'GET', '/customers');
		await niboApiRequest.call(ctx, 2, 'GET', '/customers');

		expect(helper.mock.calls[0][0].headers.ApiToken).toBe('token-of-item-0');
		expect(helper.mock.calls[1][0].headers.ApiToken).toBe('token-of-item-2');
	});

	it('fails the item, not the node, when the item carries no token', async () => {
		const helper = jest.fn();

		const failure = niboApiRequest.call(
			context({ httpRequest: helper }, { authMode: 'field', apiToken: '   ' }),
			3,
			'GET',
			'/customers',
		);

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toMatchObject({ context: { itemIndex: 3 } });
		expect(helper).not.toHaveBeenCalled();
	});

	it('classifies a rejected token the same way it does in credential mode', async () => {
		const helper = helperRejecting(401, {
			Message: 'Authorization has been denied for this request.',
		});

		const error = await failureFrom(helper, {
			authMode: 'field',
			apiToken: 'token-of-item-0',
		});

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toMatch(/token/i);
		expect(error.httpCode).toBe('401');
	});
});

/**
 * The upload, which is the first request of this package that is not JSON.
 *
 * Everything else this node sends is a JS object handed to the helper with
 * `Content-Type: application/json`. A file is neither, and the two auth modes
 * still have to work exactly as they did — the token is what selects the
 * organization, so an upload that lost it would write into the wrong books.
 *
 * The multipart body is assembled here rather than by a library: this package
 * carries **no runtime dependency at all**, by rule and by the n8n verification
 * programme.
 */
const A_FILE = {
	name: 'file',
	fileName: 'invoice.pdf',
	mimeType: 'application/pdf',
	data: Buffer.from('%PDF-1.4 not really a pdf'),
};

/** The boundary the transport picked, read off the request it built */
function boundaryOf(options: { headers: IDataObject }): string {
	return /boundary=(.+)$/.exec(options.headers['Content-Type'] as string)?.[1] as string;
}

describe('niboUploadRequest', () => {
	it('sends the file as multipart, and not as JSON', async () => {
		const helper = jest.fn().mockResolvedValue([{ fileId: 'f1', fileName: 'invoice.pdf' }]);

		await niboUploadRequest.call(
			context({ httpRequestWithAuthentication: helper }),
			0,
			'/files',
			A_FILE,
		);

		const [, options] = helper.mock.calls[0];
		expect(options.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
		expect(options.headers['Content-Type']).not.toContain('application/json');
	});

	it('carries the bytes and the file name in the body it builds', async () => {
		const helper = jest.fn().mockResolvedValue([{ fileId: 'f1' }]);

		await niboUploadRequest.call(
			context({ httpRequestWithAuthentication: helper }),
			0,
			'/files',
			A_FILE,
		);

		const body = helper.mock.calls[0][1].body as Buffer;
		expect(Buffer.isBuffer(body)).toBe(true);
		expect(body.includes(A_FILE.data)).toBe(true);
		expect(body.toString('utf8')).toContain('filename="invoice.pdf"');
		expect(body.toString('utf8')).toContain('Content-Type: application/pdf');
	});

	/**
	 * A boundary that also occurs inside the document would close the part early
	 * and Nibo would store a truncated file — with a 200, since the request would
	 * still be well formed. So the bytes are asked before the boundary is chosen.
	 */
	it('never picks a boundary that occurs inside the file', async () => {
		const helper = jest.fn().mockResolvedValue([{ fileId: 'f1' }]);
		const ctx = context({ httpRequestWithAuthentication: helper });

		// Two boundaries drawn at random never collide, so randomness alone would
		// make this test pass whether the bytes are looked at or not. Pinning the
		// draw is what turns it into a question: offered the same first candidate
		// twice, does the second call notice the document already contains it?
		const draw = jest.spyOn(Math, 'random');
		draw.mockReturnValueOnce(0.123456789).mockReturnValueOnce(0.987654321);
		await niboUploadRequest.call(ctx, 0, '/files', A_FILE);

		const firstCandidate = boundaryOf(helper.mock.calls[0][1]);

		// The same draw again, so the first candidate is the one the document
		// already contains. Anything after that comes from the real generator.
		draw.mockReturnValueOnce(0.123456789).mockReturnValueOnce(0.987654321);
		await niboUploadRequest.call(ctx, 0, '/files', {
			...A_FILE,
			data: Buffer.from(`a document that happens to contain ${firstCandidate} in it`),
		});
		draw.mockRestore();

		const chosen = boundaryOf(helper.mock.calls[1][1]);
		const body = (helper.mock.calls[1][1].body as Buffer).toString('utf8');

		expect(chosen).not.toBe(firstCandidate);
		// Twice and no more: the one that opens the part and the one that closes
		// it. A third occurrence would be the document ending itself early.
		expect(body.split(chosen)).toHaveLength(3);
	});

	it('still sends the item token when the token is per item', async () => {
		const helper = jest.fn().mockResolvedValue([{ fileId: 'f1' }]);
		const withCredential = jest.fn();

		await niboUploadRequest.call(
			context(
				{ httpRequest: helper, httpRequestWithAuthentication: withCredential },
				{ authMode: 'field', apiToken: 'token-of-item-0' },
			),
			0,
			'/files',
			A_FILE,
		);

		const [options] = helper.mock.calls[0];
		expect(options.headers.ApiToken).toBe('token-of-item-0');
		expect(options.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
		expect(withCredential).not.toHaveBeenCalled();
	});

	it('still goes through the credential when there is one', async () => {
		const helper = jest.fn().mockResolvedValue([{ fileId: 'f1' }]);

		await niboUploadRequest.call(
			context({ httpRequestWithAuthentication: helper }),
			0,
			'/files',
			A_FILE,
		);

		expect(helper.mock.calls[0][0]).toBe('niboEmpresasApi');
		expect(helper.mock.calls[0][1].url).toBe('https://api.nibo.com.br/empresas/v1/files');
	});

	/**
	 * The 413 of this route answers in plain text, so nothing in the body says
	 * what went wrong. Without the upload being named at the exit, the reader gets
	 * "Request failed with status code 413" and no ceiling at all.
	 */
	it('reads a refusal on the way up as the size ceiling', async () => {
		const helper = helperRejecting(
			413,
			'The page was not displayed because the request entity is too large.',
		);

		try {
			await niboUploadRequest.call(
				context({ httpRequestWithAuthentication: helper }),
				0,
				'/files',
				A_FILE,
			);
			throw new Error('expected niboUploadRequest to throw, but it resolved');
		} catch (thrown) {
			expect((thrown as NodeApiError).message).toMatch(/10 MB/);
		}
	});
});

/**
 * The way back, which is the one route of this node that carries no token —
 * because it needs none, and because it must not.
 */
describe('niboDownloadRequest', () => {
	const FILE_ID = '0d5be9d2-1c3f-4a75-9a9a-3e4de0e4a0f1';

	function downloadContext(helper: jest.Mock, parameters: IDataObject = {}) {
		return context({ httpRequest: helper, httpRequestWithAuthentication: jest.fn() }, parameters);
	}

	it('asks the file service for the raw bytes, not for JSON', async () => {
		const helper = jest.fn().mockResolvedValue({
			body: Buffer.from('the document'),
			headers: { 'content-type': 'application/pdf' },
			statusCode: 200,
		});

		await niboDownloadRequest.call(downloadContext(helper), FILE_ID);

		const [options] = helper.mock.calls[0];
		expect(options.url).toBe(`https://arquivos.nibo.com.br/download/${FILE_ID}`);
		expect(options.encoding).toBe('arraybuffer');
		expect(options.json).toBe(false);
	});

	it('hands back the bytes and the content type the service reported', async () => {
		const helper = jest.fn().mockResolvedValue({
			body: Buffer.from('the document'),
			headers: { 'content-type': 'application/pdf' },
			statusCode: 200,
		});

		const file = await niboDownloadRequest.call(downloadContext(helper), FILE_ID);

		expect(file.data.toString('utf8')).toBe('the document');
		expect(file.mimeType).toBe('application/pdf');
	});

	/**
	 * Measured on 2026-07-28: this URL answers 302 to a signed Azure link and
	 * hands the document over **with no authentication at all**. Sending the
	 * organization's token to it buys nothing — and n8n forwards credential
	 * headers across a cross-origin redirect by default, so it would end up at
	 * the storage host, which is a place an organization-wide token has no
	 * business being.
	 */
	it('sends no token to the file service, in either mode', async () => {
		const helper = jest.fn().mockResolvedValue({ body: Buffer.alloc(0), headers: {} });
		const withCredential = jest.fn();

		await niboDownloadRequest.call(
			context(
				{ httpRequest: helper, httpRequestWithAuthentication: withCredential },
				{ authMode: 'field', apiToken: 'token-of-item-0' },
			),
			FILE_ID,
		);

		expect(helper.mock.calls[0][0].headers?.ApiToken).toBeUndefined();
		expect(withCredential).not.toHaveBeenCalled();
	});

	it('reads the file name out of the content-disposition when the service sends one', async () => {
		const helper = jest.fn().mockResolvedValue({
			body: Buffer.from('the document'),
			headers: { 'content-disposition': 'attachment; filename="nota fiscal.pdf"' },
		});

		const file = await niboDownloadRequest.call(downloadContext(helper), FILE_ID);

		expect(file.fileName).toBe('nota fiscal.pdf');
	});
});

describe('niboApiRequest — errors', () => {
	it('replaces the generic 500 message with the validation text Nibo returned', async () => {
		const helper = helperRejecting(500, {
			error: 'validation_error',
			error_description: "Could not find a property named 'foo' on type 'Customer'",
		});

		const error = await failureFrom(helper);

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toContain("Could not find a property named 'foo' on type 'Customer'");
		expect(error.description).toMatch(/Retrying will not help/i);
	});

	it('says the token was rejected on a 401 instead of "Authorization failed"', async () => {
		const helper = helperRejecting(401, {
			Message: 'Authorization has been denied for this request.',
		});

		const error = await failureFrom(helper);

		expect(error.message).toMatch(/token/i);
		expect(error.httpCode).toBe('401');
	});

	it('keeps the original API body in the error it throws', async () => {
		const body = { error: 'internal_server_error', error_description: 'Object reference not set' };
		const helper = helperRejecting(500, body);

		const error = (await failureFrom(helper)) as NodeApiError & {
			errorResponse?: { error?: unknown };
		};

		expect(error.errorResponse?.error).toEqual(body);
	});
});
