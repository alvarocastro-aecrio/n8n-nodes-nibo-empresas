import type { IDataObject, IExecuteFunctions, INode, INodeProperties } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeScheduleFile } from '../resources/scheduleFile/execute';
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
const FILE_ID = '5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1';

const AN_ATTACHMENT = {
	fileId: FILE_ID,
	name: 'invoice.pdf',
	size: 12_345,
	createDate: '2026-07-28T01:00:00',
	referenceDate: '2026-07-28T01:02:00',
	url: `https://arquivos.nibo.com.br/download/${FILE_ID}?fileName=invoice.pdf`,
};

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
		logger: { warn: jest.fn() },
	} as unknown as IExecuteFunctions;
}

/** The call the handler made, as (method, endpoint, qs, body) */
function callAt(index: number) {
	const [, method, endpoint, qs, body] = apiRequest.mock.calls[index];
	return { method, endpoint, qs, body };
}

beforeEach(() => {
	apiRequest.mockReset();
	apiRequest.mockResolvedValue({ items: [], count: 0 });
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The attachments of one schedule — a collection that turned out to be a
 * storage of its own rather than a part of the schedule.
 *
 * Three things measured on 2026-07-28 shaped every operation here:
 *
 * 1. **The route is `/schedules/credit/...` for a debit schedule too.**
 *    `/schedules/debit/{id}/files` is a 404. It is the same universality as
 *    `GET /schedules/credit/{id}`.
 * 2. **Attaching to a schedule that does not exist answers 204 and does
 *    nothing** — the API checks the file and never checks the schedule. And the
 *    listing of a schedule that does not exist answers 200 with an empty
 *    collection, so "no file" and "no such schedule" are the same sentence.
 * 3. **The delete is not a detach.** The `scheduleId` in its path is ignored,
 *    and the file goes from every schedule it was on.
 */
describe('executeScheduleFile — Get Many', () => {
	it('reads the attachments of the schedule, through the credit route', async () => {
		apiRequest.mockResolvedValue({ items: [AN_ATTACHMENT], count: 1 });

		await executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, returnAll: true }),
			'scheduleFile',
			'listFiles',
		);

		expect(callAt(0).method).toBe('GET');
		expect(callAt(0).endpoint).toBe(`/schedules/credit/${SCHEDULE}/files`);
	});

	it('hands back the record whole, url included', async () => {
		apiRequest.mockResolvedValue({ items: [AN_ATTACHMENT], count: 1 });

		const items = await executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, returnAll: true }),
			'scheduleFile',
			'listFiles',
		);

		expect(items[0].json).toMatchObject({ fileId: FILE_ID, size: 12_345, url: AN_ATTACHMENT.url });
	});

	/**
	 * Decision 4 of the plan. `$orderby` on this collection answers 200 and was
	 * never shown to order — and a paging key that does not order reads one record
	 * twice and loses another with no error at all. A schedule has attachments by
	 * the unit, so there is nothing to page: one call, and the limit is applied
	 * here.
	 */
	it('reads it in one call, with no paging key and no skip', async () => {
		apiRequest.mockResolvedValue({ items: [AN_ATTACHMENT], count: 1 });

		await executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, returnAll: true }),
			'scheduleFile',
			'listFiles',
		);

		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(callAt(0).qs).not.toHaveProperty('$orderby');
		expect(callAt(0).qs).not.toHaveProperty('$skip');
	});

	it('applies the limit itself, since the reading is not paged', async () => {
		apiRequest.mockResolvedValue({
			items: [AN_ATTACHMENT, { ...AN_ATTACHMENT, fileId: 'second' }],
			count: 2,
		});

		const items = await executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, returnAll: false, limit: 1 }),
			'scheduleFile',
			'listFiles',
		);

		expect(items).toHaveLength(1);
	});

	// The same defense every other scan has, using the one number the envelope
	// gives: what the server says it holds against what actually arrived.
	it('refuses a reading that came back short of what the server reported', async () => {
		apiRequest.mockResolvedValue({ items: [AN_ATTACHMENT], count: 4 });

		const failure = executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, returnAll: true }),
			'scheduleFile',
			'listFiles',
		);

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
	});

	it('refuses an empty schedule ID rather than reading the collection endpoint', async () => {
		const failure = executeScheduleFile.call(
			context({ scheduleId: '   ', returnAll: true }),
			'scheduleFile',
			'listFiles',
		);

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

describe('executeScheduleFile — Attach', () => {
	function attaching(parameters: IDataObject = {}) {
		return executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, fileId: FILE_ID, ...parameters }),
			'scheduleFile',
			'attach',
		);
	}

	/** The attach answers 204, and then the list is asked whether it happened */
	function attachThenList(items: IDataObject[]) {
		apiRequest.mockImplementation(async (...args: unknown[]) => {
			const method = args[1] as string;
			return method === 'POST' ? undefined : { items, count: items.length };
		});
	}

	it('posts the file ID as an array, on the attach route of the schedule', async () => {
		attachThenList([AN_ATTACHMENT]);

		await attaching();

		expect(callAt(0)).toMatchObject({
			method: 'POST',
			endpoint: `/schedules/credit/${SCHEDULE}/files/attach`,
			body: [FILE_ID],
		});
	});

	/**
	 * The whole reason this operation costs two calls. A schedule ID that does
	 * not exist is answered **204, with not one word** — the API checks the file
	 * and never checks the schedule — so the only way to know whether anything
	 * was attached is to go and look.
	 */
	it('reads the schedule back and confirms the file is on it', async () => {
		attachThenList([AN_ATTACHMENT]);

		const items = await attaching();

		expect(callAt(1)).toMatchObject({
			method: 'GET',
			endpoint: `/schedules/credit/${SCHEDULE}/files`,
		});
		expect(items[0].json).toMatchObject({ fileId: FILE_ID, attached: true });
	});

	it('fails when the file is not there afterwards, which is how a missing schedule shows', async () => {
		attachThenList([]);

		const failure = attaching();

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(new RegExp(SCHEDULE));
	});

	it('says in that failure that the schedule may not exist at all', async () => {
		attachThenList([]);

		await expect(attaching()).rejects.toMatchObject({
			description: expect.stringMatching(/does not exist/i),
		});
	});

	/**
	 * Measured: attaching the same file twice leaves the listing at `count: 1`.
	 * The API is idempotent here of its own accord, unlike the annotation next
	 * door, so a workflow that re-runs an item does not have to guard against it.
	 */
	it('takes a file that is already attached as a success, not as an error', async () => {
		attachThenList([AN_ATTACHMENT]);

		const first = await attaching();
		const second = await attaching();

		expect(first[0].json.attached).toBe(true);
		expect(second[0].json.attached).toBe(true);
	});

	/**
	 * There is one route, and it is called "credit". A debit schedule attaches
	 * through it exactly the same, and `/schedules/debit/{id}/files` is a 404 —
	 * so the node never has to be told which kind of schedule it was handed.
	 */
	it('uses the credit route whatever kind of schedule the ID belongs to', async () => {
		attachThenList([AN_ATTACHMENT]);

		await attaching();

		for (const call of apiRequest.mock.calls) {
			expect(call[2]).toContain('/schedules/credit/');
		}
	});

	it('refuses an empty file ID before anything is written', async () => {
		const failure = attaching({ fileId: '' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

describe('executeScheduleFile — Delete', () => {
	it('calls the route that is in no documentation, with both IDs', async () => {
		apiRequest.mockResolvedValue(undefined);

		await executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, fileId: FILE_ID }),
			'scheduleFile',
			'delete',
		);

		expect(callAt(0)).toMatchObject({
			method: 'DELETE',
			endpoint: `/schedules/credit/${SCHEDULE}/files/${FILE_ID}`,
		});
	});

	it('confirms what it did, since the API answers 204 with no body', async () => {
		apiRequest.mockResolvedValue(undefined);

		const items = await executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, fileId: FILE_ID }),
			'scheduleFile',
			'delete',
		);

		expect(items[0].json).toEqual({ scheduleId: SCHEDULE, fileId: FILE_ID, deleted: true });
	});

	it('refuses an empty file ID rather than sending a delete at the collection', async () => {
		const failure = executeScheduleFile.call(
			context({ scheduleId: SCHEDULE, fileId: '  ' }),
			'scheduleFile',
			'delete',
		);

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

/**
 * The screen, and the one notice on it that has to say what the route does
 * rather than what its name suggests.
 */
describe('NiboEmpresas — what Schedule - File says before it is used', () => {
	const description = new NiboEmpresas().description;

	function field(name: string): INodeProperties | undefined {
		return description.properties.find(
			(property) =>
				property.name === name &&
				(property.displayOptions?.show?.resource ?? []).includes('scheduleFile'),
		);
	}

	it('joins the Schedule family on the menu instead of starting one of its own', () => {
		const resources = description.properties.find((property) => property.name === 'resource');
		const names = (resources?.options ?? []).map((option) => (option as { name: string }).name);

		expect(names).toContain('Schedule - File');
		expect(names.indexOf('Schedule - File')).toBe(names.indexOf('Schedule - Debit') + 1);
	});

	/**
	 * `DELETE /schedules/credit/{scheduleId}/files/{fileId}` reads like a detach
	 * and is not one: the `scheduleId` in the path is ignored — a GUID of zeros
	 * works — and the file goes from every schedule it was ever on. Calling it
	 * Detach on the screen would be a lie; leaving the notice off would be the
	 * same lie in silence.
	 */
	it('warns that the delete takes the file off every schedule, not just this one', () => {
		const notice = field('deleteNotice');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/every schedule/i);
	});

	// And the other half of the same measurement: the stored object stays where
	// it is, so a link handed out before the delete keeps serving the document.
	it('warns that a link given out before still works afterwards', () => {
		expect(field('deleteNotice')?.displayName).toMatch(/link/i);
	});

	it('says on the listing that the url it returns needs no token', () => {
		expect(field('scheduleId')?.description).toBeDefined();
		const notice = field('listNotice');

		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toMatch(/without a token|no token/i);
	});
});
