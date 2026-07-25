import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { deepMerge } from './merge';
import { niboApiRequest } from './request';

/** A leaf of the change: where it goes and what should end up there */
interface IChangedPath {
	path: string[];
	value: unknown;
}

export interface INiboUpdateOptions {
	/**
	 * Applied to the record and to the change before the confirmation compares
	 * them. The API answers `Cnpj` on a read and takes `CNPJ` on a write, so
	 * without it every document change would be reported as having failed. The
	 * transport never imports a resource module: the resource hands its own
	 * normalizer in.
	 */
	normalize?: (record: IDataObject) => IDataObject;

	/**
	 * Turns the merged record into the body to send. What a read answers is not
	 * always a body a write can take: some collections mirror a field in more
	 * than one place, and the copy that arrives last wins. Which fields those
	 * are is knowledge of the resource, not of the transport.
	 */
	writeBody?: (record: IDataObject) => IDataObject;
}

export interface INiboCreateOptions {
	/**
	 * Whether this collection answers a create with the whole record when the
	 * `/FormatType=json` suffix is used.
	 *
	 * Measured per collection on 2026-07-25, and it is not uniform: `/customers`
	 * and `/suppliers` answer the suffixed POST with the complete record, while
	 * `/employees` and `/partners` answer **404 to the suffix itself**. Where it
	 * is missing the plain POST works and gives back a bare id.
	 *
	 * Off unless a collection was measured to support it: a suffix that is not
	 * there costs a failed write, while the plain path costs one extra read.
	 */
	answersWithTheRecord?: boolean;
}

/**
 * Creates a record and returns it as the API stored it.
 *
 * Two shapes, because the API has two. Where the `/FormatType=json` suffix
 * exists it answers the whole record — with `personType`, `isCompany` and
 * `document.type` already filled in — and one call is enough. Where it does
 * not, the plain POST answers a bare id and the record is read back, so that
 * Create hands a workflow the same thing either way. (The suffix is for
 * creation only: on a `PUT` it answers 404 everywhere.)
 *
 * The id fallbacks are the rearguard for the resources still to come: it
 * arrives as a raw string on some collections and wrapped in `{"data": …}` on
 * others, and no resource should have to know which.
 */
export async function niboCreate(
	this: IExecuteFunctions,
	itemIndex: number,
	endpoint: string,
	body: IDataObject,
	options: INiboCreateOptions = {},
): Promise<IDataObject> {
	const path = options.answersWithTheRecord === true ? `${endpoint}/FormatType=json` : endpoint;
	const response = await niboApiRequest.call(this, itemIndex, 'POST', path, {}, body);

	const record = asRecord(response);
	if (record !== undefined && typeof record.data !== 'string' && Object.keys(record).length > 0) {
		return record;
	}

	const id = createdId(response, record);
	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'Nibo did not say what it created', {
			itemIndex,
			description:
				'The record may or may not have been created: the API answered the creation with a body this node could not read as a record or as an id. Check the collection in Nibo before sending it again.',
		});
	}

	if (options.answersWithTheRecord === true) {
		return { id };
	}

	// The id alone would make Create answer one shape here and another there,
	// depending on which collection the workflow happened to write to.
	const created = asRecord(
		await niboApiRequest.call(this, itemIndex, 'GET', `${endpoint}/${encodeURIComponent(id)}`),
	);

	return created ?? { id };
}

/**
 * The safe update: `GET` → merge → `PUT` → `GET` to confirm.
 *
 * Three calls where one would do, on purpose. The API's `PUT` takes the whole
 * record and **zeroes every field left out of the body**, and a malformed
 * payload answers `{"Messages":[""]}` with HTTP 200 while applying nothing at
 * all. Either one is invisible at the moment it happens and shows up weeks
 * later, when someone notices a customer lost its address.
 *
 * So the record is read first and the change is merged onto it (nothing else
 * can be omitted), the answer to the `PUT` is treated as a failure whenever it
 * carries `Messages`, and the record is read once more to check that the paths
 * that were meant to change really did. Only then does the operation succeed.
 *
 * The interval between requests does not apply inside this cycle: the three
 * calls are one operation on one item.
 */
export async function niboSafeUpdate(
	this: IExecuteFunctions,
	itemIndex: number,
	endpoint: string,
	id: string,
	changes: IDataObject,
	options: INiboUpdateOptions = {},
): Promise<IDataObject> {
	const normalize = options.normalize ?? ((record: IDataObject) => record);
	const expected = changedPaths(normalize(changes));

	if (expected.length === 0) {
		throw new NodeOperationError(this.getNode(), 'This update was given no field to change', {
			itemIndex,
			description:
				'Add at least one field under Update Fields. The node will not send an update that rewrites the record with itself — in this API that is a write like any other.',
		});
	}

	const resource = `${endpoint}/${encodeURIComponent(id)}`;

	const current = asRecord(await niboApiRequest.call(this, itemIndex, 'GET', resource));
	if (current === undefined) {
		throw new NodeOperationError(this.getNode(), `Nibo returned no record for the ID "${id}"`, {
			itemIndex,
			description: 'The update was not sent: without the stored record there is nothing to merge onto.',
		});
	}

	const writeBody = options.writeBody ?? ((record: IDataObject) => record);

	const answer = await niboApiRequest.call(
		this,
		itemIndex,
		'PUT',
		resource,
		{},
		writeBody(deepMerge(current, changes)),
	);

	const messages = silentFailure(answer);
	if (messages !== undefined) {
		throw new NodeOperationError(this.getNode(), `Nibo rejected the update: ${messages}`, {
			itemIndex,
			description:
				'The API answered HTTP 200 with a Messages body, which is how it reports a payload it could not apply. Nothing was written.',
		});
	}

	const confirmed = asRecord(await niboApiRequest.call(this, itemIndex, 'GET', resource));
	if (confirmed === undefined) {
		throw new NodeOperationError(this.getNode(), 'The update could not be confirmed', {
			itemIndex,
			description: `Nibo answered the update but returned no record when it was read back. Check the record "${id}" in Nibo.`,
		});
	}

	const applied = normalize(confirmed);
	const missing = expected.filter(({ path, value }) => !sameValue(valueAt(applied, path), value));
	if (missing.length > 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Nibo did not apply the update to: ${missing.map(({ path }) => path.join('.')).join(', ')}`,
			{
				itemIndex,
				description:
					'The API answered the update without an error, but reading the record back shows those fields unchanged. Nothing else in the record was touched.',
			},
		);
	}

	return confirmed;
}

function asRecord(value: unknown): IDataObject | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as IDataObject;
}

function createdId(response: unknown, record: IDataObject | undefined): string {
	if (typeof record?.data === 'string') {
		return record.data.trim();
	}
	return typeof response === 'string' ? response.trim() : '';
}

/** The text of a `{"Messages": […]}` answer, or undefined when there is none */
function silentFailure(answer: unknown): string | undefined {
	const record = asRecord(answer);
	const messages = record?.Messages ?? record?.messages;
	if (messages === undefined) {
		return undefined;
	}

	const text = (Array.isArray(messages) ? messages : [messages])
		.map((message) => String(message).trim())
		.filter((message) => message !== '')
		.join('; ');

	return text === '' ? 'the API gave no reason' : text;
}

/** Every leaf of the change, as a path and the value that should end up there */
function changedPaths(changes: IDataObject, prefix: string[] = []): IChangedPath[] {
	return Object.entries(changes).flatMap(([key, value]) => {
		const path = [...prefix, key];
		const branch = asRecord(value);

		return branch !== undefined && Object.keys(branch).length > 0
			? changedPaths(branch, path)
			: [{ path, value }];
	});
}

function valueAt(record: IDataObject, path: string[]): unknown {
	return path.reduce<unknown>((value, key) => asRecord(value)?.[key], record);
}

/**
 * Whether the API's answer means the same as what was asked for.
 *
 * Deliberately tolerant on three counts, all measured: a field erased on
 * purpose comes back as `null` rather than `''`; numbers may arrive as text;
 * and some values come back padded — ask for a `zipCode` of "22000000" and
 * every later read answers "22000000 ". None of those is the API refusing the
 * change, and reporting them as one would make the confirmation cry wolf.
 */
function sameValue(applied: unknown, asked: unknown): boolean {
	if (isEmpty(applied) || isEmpty(asked)) {
		return isEmpty(applied) && isEmpty(asked);
	}
	if (typeof applied === 'object' || typeof asked === 'object') {
		return JSON.stringify(applied) === JSON.stringify(asked);
	}
	return String(applied).trim() === String(asked).trim();
}

function isEmpty(value: unknown): boolean {
	// A blank the API padded is still a blank — see the note on sameValue.
	return value === undefined || value === null || String(value).trim() === '';
}
