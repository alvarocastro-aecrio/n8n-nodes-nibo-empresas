import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { niboApiRequest } from '../transport/request';

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
