import type { IBinaryData, IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { executeFile } from '../resources/file/execute';
import { niboApiRequest, niboDownloadRequest, niboUploadRequest } from '../transport/request';

jest.mock('../transport/request');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const upload = niboUploadRequest as jest.MockedFunction<typeof niboUploadRequest>;
const download = niboDownloadRequest as jest.MockedFunction<typeof niboDownloadRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const FILE_ID = '5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1';

/**
 * The ceiling measured on 2026-07-28, and the reason it is not a round number:
 * the 10 485 760 bytes are the **whole request**, so the multipart envelope is
 * counted inside them. 10 MB − 1 KB went through and 10 MB did not, which puts
 * the margin comfortably inside a kilobyte.
 */
const REFUSED_AT = 10_484_736;

/** An item carrying one binary field, the way the editor hands it over */
function itemWithBinary(fields: Record<string, Partial<IBinaryData>>) {
	return {
		json: { invoice: 'NF 12' },
		binary: Object.fromEntries(
			Object.entries(fields).map(([name, data]) => [
				name,
				{ data: '', mimeType: 'application/pdf', ...data } as IBinaryData,
			]),
		),
	};
}

function context(
	parameters: IDataObject,
	items: Array<ReturnType<typeof itemWithBinary>> = [itemWithBinary({ data: {} })],
	buffers: Record<string, Buffer> = { data: Buffer.from('%PDF-1.4') },
) {
	return {
		getInputData: () => items,
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
		helpers: {
			getBinaryDataBuffer: jest.fn(async (_index: number, property: string) => {
				const buffer = buffers[property];
				if (buffer === undefined) {
					throw new Error(`no buffer for ${property}`);
				}
				return buffer;
			}),
			prepareBinaryData: jest.fn(async (data: Buffer, fileName?: string, mimeType?: string) => ({
				data: data.toString('base64'),
				fileName,
				mimeType: mimeType ?? 'application/octet-stream',
			})),
		},
	} as unknown as IExecuteFunctions;
}

beforeEach(() => {
	upload.mockReset();
	upload.mockResolvedValue([{ fileId: FILE_ID, fileName: 'invoice.pdf' }]);
	download.mockReset();
	download.mockResolvedValue({
		data: Buffer.from('the document'),
		mimeType: 'application/pdf',
		fileName: 'invoice.pdf',
	});
	apiRequest.mockReset();
	apiRequest.mockResolvedValue(undefined);
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The upload, which is the first operation of this node that carries something
 * other than JSON — and the first whose refusal has to happen **before** the
 * call, because the answer that comes back from the API for the one case it can
 * predict is useless to whoever reads it.
 */
describe('executeFile — Upload', () => {
	it('sends the bytes of the binary field the item was told to carry', async () => {
		await executeFile.call(
			context({ binaryProperty: 'attachment' }, [itemWithBinary({ attachment: {} })], {
				attachment: Buffer.from('the invoice'),
			}),
			'file',
			'upload',
		);

		const [, endpoint, file] = upload.mock.calls[0];
		expect(endpoint).toBe('/files');
		expect(file.data.toString('utf8')).toBe('the invoice');
	});

	/**
	 * The field name is a convention this package keeps, not a rule of the API:
	 * a part called `anexo` uploads exactly the same. It is `file` because that
	 * is what every workflow written by hand until now sends.
	 */
	it('names the multipart field file, which is what the workflows already send', async () => {
		await executeFile.call(context({}), 'file', 'upload');

		expect(upload.mock.calls[0][2].name).toBe('file');
	});

	it('takes the file name and the content type from the binary itself', async () => {
		await executeFile.call(
			context({}, [itemWithBinary({ data: { fileName: 'nota.pdf', mimeType: 'application/pdf' } })]),
			'file',
			'upload',
		);

		const [, , file] = upload.mock.calls[0];
		expect(file.fileName).toBe('nota.pdf');
		expect(file.mimeType).toBe('application/pdf');
	});

	it('stores it under the name that was typed, when one was', async () => {
		await executeFile.call(
			context({ fileName: 'NF-12.pdf' }, [itemWithBinary({ data: { fileName: 'tmp-8371.pdf' } })]),
			'file',
			'upload',
		);

		expect(upload.mock.calls[0][2].fileName).toBe('NF-12.pdf');
	});

	it('refuses an item that has no such binary field, before any call goes out', async () => {
		const failure = executeFile.call(
			context({ binaryProperty: 'invoice' }, [itemWithBinary({ data: {} })]),
			'file',
			'upload',
		);

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(/invoice/);
		expect(upload).not.toHaveBeenCalled();
	});

	// And it says what the item does carry, because the usual cause is a field
	// named by whatever produced it two nodes ago.
	it('names the binary fields the item does carry', async () => {
		const failure = executeFile.call(
			context({ binaryProperty: 'data' }, [itemWithBinary({ attachment_0: {}, attachment_1: {} })]),
			'file',
			'upload',
		);

		await expect(failure).rejects.toMatchObject({
			description: expect.stringContaining('attachment_0'),
		});
	});

	/**
	 * Decision 10 of the plan. The API's own answer at this size is HTTP 500
	 * *"O Nibo se comportou de forma inesperada."* — a sentence that names no
	 * size, no file and no limit. The buffer is in hand before the call, so
	 * there is no reason to find that out from the server.
	 */
	it('refuses a file at the measured ceiling without sending anything', async () => {
		const failure = executeFile.call(
			context({}, [itemWithBinary({ data: {} })], { data: Buffer.alloc(REFUSED_AT) }),
			'file',
			'upload',
		);

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(upload).not.toHaveBeenCalled();
	});

	it('says the limit in the refusal, since the API never would', async () => {
		const failure = executeFile.call(
			context({}, [itemWithBinary({ data: {} })], { data: Buffer.alloc(REFUSED_AT) }),
			'file',
			'upload',
		);

		await expect(failure).rejects.toThrow(/10,484,736 bytes/);
	});

	it('lets a file one byte below it through', async () => {
		await executeFile.call(
			context({}, [itemWithBinary({ data: {} })], { data: Buffer.alloc(REFUSED_AT - 1) }),
			'file',
			'upload',
		);

		expect(upload).toHaveBeenCalledTimes(1);
	});

	/**
	 * A fourth response shape, and the reason the transport had to learn it: this
	 * one is neither the bare GUID of `POST /accounts`, nor the `{items, count}`
	 * envelope, nor a `{data: …}` wrapper. It is an array, because the endpoint
	 * takes several files in one call — a capacity measured and deliberately not
	 * offered (decision 3).
	 */
	it('reads the fileId out of the array the upload answers', async () => {
		const items = await executeFile.call(context({}), 'file', 'upload');

		expect(items[0].json.fileId).toBe(FILE_ID);
	});

	it('fails legibly if that array comes back empty', async () => {
		upload.mockResolvedValue([]);

		const failure = executeFile.call(context({}), 'file', 'upload');

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		await expect(failure).rejects.toThrow(/no file/i);
	});
});

/**
 * One operation, two calls — and the reason it is one operation is that nobody
 * uploads a document in order to leave it lying in storage. The reason it is
 * still two calls is the API: nothing attaches and stores in one request.
 */
describe('executeFile — Upload and Attach', () => {
	const SCHEDULE = 'b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90';

	function uploadingAndAttaching(parameters: IDataObject = {}) {
		return executeFile.call(
			context({ scheduleId: SCHEDULE, ...parameters }),
			'file',
			'uploadAndAttach',
		);
	}

	beforeEach(() => {
		apiRequest.mockReset();
		apiRequest.mockImplementation(async (...args: unknown[]) =>
			(args[1] as string) === 'POST'
				? undefined
				: { items: [{ fileId: FILE_ID, name: 'invoice.pdf' }], count: 1 },
		);
	});

	it('stores the document first and attaches it second', async () => {
		await uploadingAndAttaching();

		expect(upload).toHaveBeenCalledTimes(1);
		expect(apiRequest.mock.calls[0][2]).toBe(`/schedules/credit/${SCHEDULE}/files/attach`);
		expect(apiRequest.mock.calls[0][4]).toEqual([FILE_ID]);
	});

	// The confirmation of Schedule - File applies here too: this API answers the
	// attach with 204 whether the schedule exists or not, so the schedule is read
	// back either way.
	it('reads the schedule back, exactly as Attach does on its own', async () => {
		const items = await uploadingAndAttaching();

		expect(apiRequest.mock.calls[1][1]).toBe('GET');
		expect(items[0].json).toMatchObject({ fileId: FILE_ID, scheduleId: SCHEDULE, attached: true });
	});

	it('refuses an empty schedule ID before the file is stored', async () => {
		const failure = uploadingAndAttaching({ scheduleId: '  ' });

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(upload).not.toHaveBeenCalled();
	});

	/**
	 * Decision 6 of the plan, and the lesson the 0.10.0 settlement paid for: the
	 * sentence a half-done operation ends with decides whether the workflow runs
	 * it again. The upload succeeded, so a retry would store the same document a
	 * second time — and there is no route that lists the files of an organization
	 * to find the first one afterwards.
	 */
	it('says the file did go up when it is the attaching that failed', async () => {
		apiRequest.mockImplementation(async (...args: unknown[]) =>
			(args[1] as string) === 'POST' ? undefined : { items: [], count: 0 },
		);

		const failure = uploadingAndAttaching();

		await expect(failure).rejects.toThrow(new RegExp(FILE_ID));
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/do not send it again|stored/i),
		});
	});
});

/**
 * The way back, and the operation that closes the circle: up, attached, listed,
 * and back down again.
 */
describe('executeFile — Download', () => {
	it('asks the file service for the ID it was given', async () => {
		await executeFile.call(context({ fileId: FILE_ID }), 'file', 'download');

		expect(download.mock.calls[0][0]).toBe(FILE_ID);
	});

	it('refuses an empty ID rather than asking for a file with no name', async () => {
		const failure = executeFile.call(context({ fileId: '  ' }), 'file', 'download');

		await expect(failure).rejects.toBeInstanceOf(NodeOperationError);
		expect(download).not.toHaveBeenCalled();
	});

	it('puts the document in the binary field, with the name and type it came with', async () => {
		const items = await executeFile.call(
			context({ fileId: FILE_ID, outputBinaryProperty: 'invoice' }),
			'file',
			'download',
		);

		const binary = items[0].binary?.invoice as IBinaryData;
		expect(Buffer.from(binary.data, 'base64').toString('utf8')).toBe('the document');
		expect(binary.fileName).toBe('invoice.pdf');
		expect(binary.mimeType).toBe('application/pdf');
	});

	it('keeps the json of the item it came in on, so the download can be chained', async () => {
		const items = await executeFile.call(context({ fileId: FILE_ID }), 'file', 'download');

		expect(items[0].json.invoice).toBe('NF 12');
	});

	it('uses the name that was typed over the one the service reported', async () => {
		const items = await executeFile.call(
			context({ fileId: FILE_ID, fileName: 'NF-12.pdf' }),
			'file',
			'download',
		);

		expect((items[0].binary?.data as IBinaryData).fileName).toBe('NF-12.pdf');
	});

	/**
	 * `GET /files/{id}` on the API is a 404, so there is no way to ask whether a
	 * file exists before asking for it. What comes back from the file service is
	 * a 404 in `application/problem+json`, which the node reads back as a
	 * sentence naming the ID that was asked for.
	 */
	it('says which file was not found when the service answers 404', async () => {
		download.mockRejectedValue(
			new NodeApiError(NODE, {}, { httpCode: '404', message: 'Request failed' }),
		);

		const failure = executeFile.call(context({ fileId: FILE_ID }), 'file', 'download');

		await expect(failure).rejects.toThrow(new RegExp(FILE_ID));
	});
});
