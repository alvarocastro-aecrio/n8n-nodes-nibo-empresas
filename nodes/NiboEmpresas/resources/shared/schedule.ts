import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { niboApiRequest } from '../../transport/request';

/**
 * Where a schedule is read by ID, for both kinds. `GET /schedules/debit/{id}`
 * and `GET /schedules/{id}` are 404 always — not "not found for this id", but
 * the route itself. Asymmetry 11 of this project's API contract.
 */
export function schedulePath(scheduleId: string): string {
	return `/schedules/credit/${encodeURIComponent(scheduleId)}`;
}

/**
 * The two answers on the check that are about the caller rather than about the
 * schedule. A rejected token and a rate limit have to keep their own sentence:
 * reading either as "there is no such schedule" would send somebody looking for
 * a record that is exactly where they left it.
 */
const NOT_ABOUT_THE_SCHEDULE = ['401', '429'];

/**
 * Refuses to go on unless the schedule is really there — the one guard two
 * different operations of this version needed, for two different reasons that
 * turn out to be the same reason.
 *
 * **This API validates what is written and never validates what it is written
 * onto.** An annotation on a schedule ID that does not exist is accepted with
 * 200 and an ID; a file attached to one is accepted with 204. Neither can be
 * found out afterwards:
 *
 * - the annotation because nothing reads it back, ever — ten paths tried on
 *   2026-07-28, ten 404s;
 * - the attachment because `attach` **sets the one `referenceId` a file has**,
 *   and the listing of a schedule is every file carrying that `referenceId`. So
 *   reading back the invented schedule hands the file straight over. The
 *   read-back confirms itself. That one was found in the acceptance of this
 *   version, after the plan had built the defense on it.
 *
 * What does work is this: an ID that is not a schedule answers **HTTP 500**
 * *"Agendamento não encontrado"* here. A 500 rather than a 404, which is why the
 * status alone cannot carry the meaning — but the direction that can be trusted
 * is the other one, and it is the two codes above.
 */
export async function requireSchedule(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
	whatWasNotDone: string,
): Promise<void> {
	await readSchedule.call(this, itemIndex, scheduleId, whatWasNotDone);
}

/**
 * The same guard, handing the record over.
 *
 * The check and the reading are one call, so an operation that needs something
 * *out* of the schedule — the contact a note is issued to, since 0.14.1 — pays
 * for the guard rather than for a second round trip. `requireSchedule` is this
 * with the answer thrown away, which is what its two callers want.
 *
 * ⚠️ Read the contact from **`stakeholder.id`**, never from the `stakeholderId`
 * at the root: on the **listing** of schedules that root field comes back as a
 * GUID of noughts, which is the tenth gotcha of this project. On this get-by-id
 * it was measured filled in — so the two disagree by route, and the nested one
 * is the one that is right on both.
 */
export async function readSchedule(
	this: IExecuteFunctions,
	itemIndex: number,
	scheduleId: string,
	whatWasNotDone: string,
): Promise<IDataObject> {
	try {
		return (await niboApiRequest.call(
			this,
			itemIndex,
			'GET',
			schedulePath(scheduleId),
		)) as IDataObject;
	} catch (error) {
		const httpCode = (error as NodeApiError).httpCode ?? '';

		if (NOT_ABOUT_THE_SCHEDULE.includes(httpCode)) {
			// Rethrown as an expression rather than as a bare `throw error`, which
			// the official scanner reads as losing the node context.
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex });
		}

		throw new NodeOperationError(
			this.getNode(),
			`Nibo has no schedule with the ID ${scheduleId}`,
			{
				itemIndex,
				description: `**${whatWasNotDone}** The schedule is read first because this API accepts writing onto a schedule that does not exist and says nothing about it — and neither an annotation nor an attachment can be found again afterwards. A schedule that is not there answers this read with HTTP 500 rather than 404, which is why the sentence below is a server one. Nibo said: ${(error as Error).message}`,
			},
		);
	}
}
