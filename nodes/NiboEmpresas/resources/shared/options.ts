import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * The two operational adjustments every resource reads the same way, and the ID
 * guard every single-record operation needs.
 *
 * They were written for the stakeholders and are read identically by the
 * schedules — and both carry a fallback to the parameter name they had before
 * they became Options, which is what keeps a node saved under 0.4.x behaving as
 * its author meant. A compatibility fallback in two copies is a compatibility
 * fallback that will disagree with itself, so there is one copy.
 */

/**
 * How long to wait between two calls, in milliseconds.
 *
 * A second by default, and on purpose: one item per organization means a
 * portfolio loop fires hundreds of calls in a row, so the defense has to be
 * what happens when nobody chose anything.
 *
 * Until 0.4.1 it was a field of its own. A node saved back then still carries
 * it there and its author still means it, so that value is read when the option
 * was not set.
 */
export function requestInterval(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
): number {
	return typeof options.requestInterval === 'number'
		? options.requestInterval
		: (this.getNodeParameter('requestInterval', itemIndex, 1000) as number);
}

/**
 * Whether a scan that may have missed records fails instead of being handed
 * back with a warning.
 *
 * On unless someone says otherwise, for the same reason as the interval: the
 * defense has to be what happens by default. A list that quietly lost two
 * records is exactly what a workflow deletes by.
 *
 * Until 0.4.2 it was a field of its own, off by default — a node saved back
 * then made that choice, and keeps it.
 */
export function failOnIncomplete(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
): boolean {
	return typeof options.failOnIncomplete === 'boolean'
		? options.failOnIncomplete
		: (this.getNodeParameter('failOnIncomplete', itemIndex, true) as boolean);
}

/**
 * The ID this item works on, refused while it is still cheap to refuse.
 *
 * An empty ID would otherwise be sent as `/customers/` or `/schedules/credit/`
 * — the collection endpoint — which on a DELETE is a request no one wants to
 * find out the answer to.
 */
export function recordId(
	this: IExecuteFunctions,
	parameter: string,
	itemIndex: number,
): string {
	const id = String(this.getNodeParameter(parameter, itemIndex, '') ?? '').trim();

	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'This item carries no record ID', {
			itemIndex,
			description: `The ${parameter} field is empty. It is usually an expression reading the ID from the incoming item.`,
		});
	}

	return id;
}
