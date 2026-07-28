import type { IDataObject, IExecuteFunctions, INode, INodeProperties } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeAnnotation } from '../resources/annotation/execute';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/request');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const SCHEDULE = 'b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90';
const ANNOTATION = 'ec8f1a54-2c7c-4d0e-9f31-51b8f4a7c2ee';

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

function callAt(index: number) {
	const [, method, endpoint, , body] = apiRequest.mock.calls[index];
	return { method, endpoint, body };
}

/** The schedule is there, and the write answers a bare GUID */
function scheduleIsThere() {
	apiRequest.mockImplementation(async (...args: unknown[]) =>
		(args[1] as string) === 'GET' ? { scheduleId: SCHEDULE, value: 100 } : ANNOTATION,
	);
}

/** The schedule is not there — which this API says with a 500, not a 404 */
function scheduleIsNotThere() {
	apiRequest.mockImplementation(async (...args: unknown[]) => {
		if ((args[1] as string) === 'GET') {
			throw new NodeApiError(
				NODE,
				{},
				{ httpCode: '500', message: 'The Nibo Empresas API failed' },
			);
		}
		return ANNOTATION;
	});
}

beforeEach(() => {
	apiRequest.mockReset();
	scheduleIsThere();
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The one operation of this node whose defense has to happen **before** the
 * write, and the reason is that afterwards there is nothing left to ask.
 *
 * Measured on 2026-07-28, hunting the way gotcha 14 asks: the `annotationId` the
 * write answers opens no door at all — `GET`, `PUT` and `DELETE` are 404 on
 * every path tried, ten of them, and the schedule record carries no annotation
 * among its 28 fields. So an annotation written onto a schedule ID that does not
 * exist — which this API accepts with **HTTP 200 and an ID** — can never be
 * found, read or removed. Not by this node, and not by anything else.
 */
describe('executeAnnotation — Create', () => {
	function creating(parameters: IDataObject = {}) {
		return executeAnnotation.call(
			context({ scheduleId: SCHEDULE, body: 'Paid by transfer', ...parameters }),
			'annotation',
			'create',
		);
	}

	it('reads the schedule before writing anything to it', async () => {
		await creating();

		expect(callAt(0)).toMatchObject({
			method: 'GET',
			endpoint: `/schedules/credit/${SCHEDULE}`,
		});
	});

	it('writes the text on the annotations route of that schedule', async () => {
		await creating();

		expect(callAt(1)).toMatchObject({
			method: 'POST',
			endpoint: `/schedules/credit/${SCHEDULE}/annotations`,
			body: { body: 'Paid by transfer' },
		});
	});

	/**
	 * The test of the whole slice. Attaching a file to a schedule that does not
	 * exist can at least be found out afterwards — the listing comes back empty.
	 * An annotation cannot: it answers 200 with an ID, and that ID opens nothing.
	 * So the only moment this can be caught is before it is sent.
	 */
	it('refuses a schedule that does not exist, with the write never leaving', async () => {
		scheduleIsNotThere();

		const failure = creating();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest.mock.calls.every((call) => call[1] === 'GET')).toBe(true);
	});

	it('says in that refusal that nothing was written', async () => {
		scheduleIsNotThere();

		await expect(creating()).rejects.toMatchObject({
			description: expect.stringMatching(/nothing was written/i),
		});
	});

	/**
	 * A 401 or a 429 on the check is not a missing schedule, and reading it as one
	 * would send somebody looking for a schedule that is right where they left it.
	 */
	it('keeps an authentication failure on the check as an authentication failure', async () => {
		apiRequest.mockImplementation(async () => {
			throw new NodeApiError(NODE, {}, { httpCode: '401', message: 'token rejected' });
		});

		await expect(creating()).rejects.toBeInstanceOf(NodeApiError);
	});

	it('reads the bare GUID the write answers', async () => {
		const items = await creating();

		expect(items[0].json).toMatchObject({ annotationId: ANNOTATION, scheduleId: SCHEDULE });
	});

	// The API refuses an empty annotation with HTTP 500 "Informe uma anotação.",
	// which is a round trip to be told what the node already knew.
	it('refuses an empty text without asking the API about it', async () => {
		const failure = creating({ body: '   ' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('refuses an empty schedule ID the same way', async () => {
		const failure = creating({ scheduleId: '' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	/**
	 * One route for both kinds, as everywhere else in this family: an annotation
	 * on a debit schedule is written through `/schedules/credit/...` too.
	 */
	it('uses the credit route whatever kind of schedule the ID belongs to', async () => {
		await creating();

		for (const call of apiRequest.mock.calls) {
			expect(call[2]).toContain('/schedules/credit/');
		}
	});
});

describe('NiboEmpresas — what Schedule - Annotation says before it is used', () => {
	const description = new NiboEmpresas().description;

	function field(name: string): INodeProperties | undefined {
		return description.properties.find(
			(property) =>
				property.name === name &&
				(property.displayOptions?.show?.resource ?? []).includes('annotation'),
		);
	}

	it('joins the Schedule family, ahead of the two schedules themselves', () => {
		const resources = description.properties.find((property) => property.name === 'resource');
		const names = (resources?.options ?? []).map((option) => (option as { name: string }).name);

		expect(names).toContain('Schedule - Annotation');
		expect(names.indexOf('Schedule - Annotation')).toBe(names.indexOf('Schedule - Credit') - 1);
	});

	/**
	 * There is no reading and therefore no idempotence to lean on: the same text
	 * posted twice answers two different IDs, and both are there for good. Attach
	 * next door is idempotent by the API's own doing; this one is not, and the
	 * difference has to be on the screen because nothing downstream can repair it.
	 */
	it('warns that running the same item twice writes the annotation twice', () => {
		const notice = field('createNotice');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/twice|again/i);
	});

	it('warns that an annotation cannot be read back, edited or removed', () => {
		expect(field('createNotice')?.displayName).toMatch(/cannot be|no way to/i);
	});

	it('offers Create and nothing else, since nothing else exists', () => {
		const operation = description.properties.find(
			(property) =>
				property.name === 'operation' &&
				(property.displayOptions?.show?.resource ?? []).includes('annotation'),
		);

		expect((operation?.options ?? []).map((option) => (option as { value: string }).value)).toEqual(
			['create'],
		);
	});
});
