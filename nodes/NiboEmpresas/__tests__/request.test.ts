import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

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

function context(httpRequestWithAuthentication: jest.Mock) {
	return {
		getCredentials: jest.fn().mockResolvedValue({ apiToken: 'not-a-real-token' }),
		getNode: () => NODE,
		helpers: { httpRequestWithAuthentication },
	} as unknown as IExecuteFunctions;
}

/** What the n8n helper throws: the axios failure, already wrapped */
function helperRejecting(statusCode: number, body: unknown): jest.Mock {
	return jest.fn().mockImplementation(async () => {
		throw new NodeApiError(NODE, axiosError(statusCode, body) as never);
	});
}

async function failureFrom(helper: jest.Mock): Promise<NodeApiError> {
	try {
		await niboApiRequest.call(context(helper), 'GET', '/customers');
	} catch (thrown) {
		return thrown as NodeApiError;
	}
	throw new Error('expected niboApiRequest to throw, but it resolved');
}

describe('niboApiRequest', () => {
	it('calls the n8n helper with the credential, the query and a JS object body', async () => {
		const helper = jest.fn().mockResolvedValue({ items: [], count: 0 });

		await niboApiRequest.call(context(helper), 'GET', '/customers', { $top: 5 });

		const [credentialName, options] = helper.mock.calls[0];
		expect(credentialName).toBe('niboEmpresasApi');
		expect(options.url).toBe('https://api.nibo.com.br/empresas/v1/customers');
		expect(options.qs).toEqual({ $top: 5 });
		expect(options.json).toBe(true);
	});

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
