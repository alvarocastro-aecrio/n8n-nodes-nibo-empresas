import type { IDataObject } from 'n8n-workflow';

/**
 * What a swallowed failure hands the workflow.
 *
 * `Continue On Fail` exists so one bad item does not cost the rest of the batch,
 * and until 0.17.0 it kept the message and threw the description away. That is
 * the wrong half to lose: this node puts the message on the screen and the
 * **facts** in the description — the ID of what was written, and whether sending
 * it again would record the money twice.
 *
 * Measured on 2026-08-10: a rajada of 66 receipts stopped on the third because
 * the entry could not be read back. The error said *"the receipt was created,
 * do not send it again"* and named the schedule ID — in the description. An
 * operator who had turned this option on precisely to save the batch would have
 * received the warning without the ID it was about.
 *
 * `error` keeps its name and its exact content: a workflow has been reading
 * `$json.error` since 0.1.0, and this adds a field rather than changing one.
 */
export function failedItem(error: unknown): IDataObject {
	const json: IDataObject = { error: (error as Error).message };

	// Only when there is one — an empty key is noise in every item that has no
	// description to give, and this shape is read by expressions.
	const description = (error as { description?: unknown })?.description;
	if (typeof description === 'string' && description.trim() !== '') {
		json.errorDescription = description.trim();
	}

	return json;
}
