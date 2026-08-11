import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { niboReadBack } from '../transport/save';
import { niboListRequest } from '../transport/paginate';

jest.mock('../transport/paginate');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const waited = sleep as jest.MockedFunction<typeof sleep>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function context() {
	return { getNode: () => NODE } as unknown as IExecuteFunctions;
}

beforeEach(() => {
	listRequest.mockReset();
	waited.mockClear();
});

/**
 * Reading back what was just written, on a collection that has not caught up.
 *
 * Measured on the test company on 2026-07-27: after a settlement,
 * `GET /receipts` answered `count: 0, items: 0` for about three seconds and only
 * then showed the record. The same list, in another run, answered `items` with
 * a record and `count: 0` at the same time — and after a `DELETE` answered
 * `count: 3` over an empty collection. The two fields lag independently.
 *
 * A read-back that asked once would therefore fail on a write that had worked,
 * which is the single worst failure this node can have: it reports a problem
 * where there is none, and a workflow written around that retries the write.
 */
describe('niboReadBack — the collection that has not caught up yet', () => {
	it('hands back the record when the collection already has it', async () => {
		listRequest.mockResolvedValue({ records: [{ entryId: 'a' }], count: 1 });

		const record = await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		expect(record).toEqual({ entryId: 'a' });
		expect(listRequest).toHaveBeenCalledTimes(1);
	});

	/**
	 * The first ask used to go out the instant the write returned, and it could
	 * not succeed: the fastest this collection has ever produced a record is
	 * **1.162 ms**, measured over thirteen readings on 2026-08-11, and in
	 * production it has taken more than seven seconds. So that request was never
	 * an answer — it was a request spent to be told no, against an API that rate
	 * limits by the hour of the day.
	 */
	it('breathes before the very first ask, which no record has ever beaten', async () => {
		listRequest.mockResolvedValue({ records: [{ entryId: 'a' }], count: 1 });

		await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		expect(waited).toHaveBeenCalledTimes(1);
		expect(waited.mock.invocationCallOrder[0]).toBeLessThan(
			listRequest.mock.invocationCallOrder[0],
		);
	});

	it('never breathes for less than a second, at any point in the window', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		expect(waited.mock.calls.length).toBeGreaterThan(0);
		for (const [ms] of waited.mock.calls) {
			expect(ms).toBeGreaterThanOrEqual(1000);
		}
	});

	it('asks again when the collection is still empty, and waits between tries', async () => {
		listRequest
			.mockResolvedValueOnce({ records: [], count: 0 })
			.mockResolvedValueOnce({ records: [], count: 0 })
			.mockResolvedValue({ records: [{ entryId: 'a' }], count: 1 });

		const record = await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		expect(record).toEqual({ entryId: 'a' });
		expect(listRequest).toHaveBeenCalledTimes(3);
		expect(waited).toHaveBeenCalledTimes(3);
	});

	// Every try asks the same question — the filter is what identifies the record.
	it('asks the same question every time', async () => {
		listRequest
			.mockResolvedValueOnce({ records: [], count: 0 })
			.mockResolvedValue({ records: [{ entryId: 'a' }], count: 1 });

		await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		for (const [, endpoint, orderBy, options] of listRequest.mock.calls) {
			expect(endpoint).toBe('/payments');
			expect(orderBy).toBe('entryId');
			expect((options as unknown as { filter: string }).filter).toBe('entryId eq a');
		}
	});

	/**
	 * A scan of one record by ID cannot be an incomplete scan of a collection —
	 * and on this collection `count` is exactly the field that lies during the
	 * lag, so letting the transport compare it here would turn the lag into a
	 * hard failure of its own.
	 */
	it('never asks the incomplete-scan defense about a single record', async () => {
		listRequest.mockResolvedValue({ records: [{ entryId: 'a' }], count: 0 });

		await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		expect(listRequest.mock.calls[0][3]).toMatchObject({
			returnAll: false,
			limit: 1,
			failOnIncomplete: false,
		});
	});

	// The window is bounded: a record that never appears is not a lag, and
	// waiting forever would hang the whole run on one item.
	it('gives up after a bounded number of tries', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		const record = await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a');

		expect(record).toBeUndefined();
		expect(listRequest.mock.calls.length).toBeGreaterThan(1);
		expect(listRequest.mock.calls.length).toBeLessThanOrEqual(6);
	});

	it('takes a shorter window when the caller asks for one', async () => {
		listRequest.mockResolvedValue({ records: [], count: 0 });

		await niboReadBack.call(context(), 0, '/payments', 'entryId', 'entryId eq a', { tries: 1 });

		expect(listRequest).toHaveBeenCalledTimes(1);
		// One ask, and still the second of breathing before it.
		expect(waited).toHaveBeenCalledTimes(1);
	});
});
