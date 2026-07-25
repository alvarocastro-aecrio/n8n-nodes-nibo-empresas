import type { IDataObject } from 'n8n-workflow';

/**
 * The merge behind every "Update" operation of this package.
 *
 * The API's `PUT` takes the whole record: **every field left out of the body
 * is zeroed**, silently and with HTTP 200. So an update that means "change the
 * phone" has to send the customer's name, document and address back as well,
 * exactly as they are stored. The node reads the record, merges the requested
 * change onto it here, and sends the result whole.
 *
 * Two rules make the merge honest:
 *
 * - **Only what is in `changes` changes.** A key absent from `changes` keeps
 *   the stored value, at any depth. That is what lets the UI say "the fields
 *   you do not add are not touched".
 * - **A value that is there wins, even when it is empty.** Adding a field and
 *   leaving it blank is how a stored value is erased on purpose; treating `''`
 *   as "not informed" would make erasing impossible.
 *
 * Arrays are replaced whole, never merged element by element: a partial array
 * has no meaning the caller could have intended.
 *
 * Pure by design — no `this`, no network — so the trap it defends against can
 * be tested without a node context. The 0.5.x resources need the same cycle.
 */
export function deepMerge(current: IDataObject, changes: IDataObject): IDataObject {
	const merged: IDataObject = { ...current };

	for (const [key, change] of Object.entries(changes)) {
		const stored = merged[key];

		merged[key] =
			isPlainObject(stored) && isPlainObject(change)
				? deepMerge(stored, change)
				: (change as IDataObject[keyof IDataObject]);
	}

	return merged;
}

function isPlainObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
