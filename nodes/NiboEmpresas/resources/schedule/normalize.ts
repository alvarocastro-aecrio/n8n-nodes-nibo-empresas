import type { IDataObject } from 'n8n-workflow';

/**
 * The contact the API forgets at the root.
 *
 * Every read of a schedule answers a root `stakeholderId` made of nothing but
 * zeroes and keeps the real one one level down, in `stakeholder.id`. It is a
 * defect of the API, not a convention: there is no read where the zeroed GUID
 * is the right answer, and a workflow chaining `stakeholderId` from one node
 * into the next gets a contact that does not exist.
 *
 * So it is repaired on every read, in one place. What is **not** touched is the
 * sign of the amount: a debit answers negative and is written positive, and a
 * node that flipped it on the way out would add up differently from the API it
 * wraps — every reconciliation built on it wrong in a way nobody could see.
 */
const ZEROED = '00000000-0000-0000-0000-000000000000';

export function normalizeSchedule(record: IDataObject): IDataObject {
	const stakeholder = record.stakeholder;
	if (typeof stakeholder !== 'object' || stakeholder === null || Array.isArray(stakeholder)) {
		return record;
	}

	const real = (stakeholder as IDataObject).id;
	if (typeof real !== 'string' || real.trim() === '' || real === ZEROED) {
		return record;
	}

	// A root that already carries something real is the root of a write, where
	// it is the field that says which contact this is — and it is right.
	if (!isMissing(record.stakeholderId)) {
		return record;
	}

	return { ...record, stakeholderId: real };
}

function isMissing(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === 'string' && (value.trim() === '' || value === ZEROED))
	);
}

/** The fields the API answers as a full timestamp and takes as a plain day */
const DATE_FIELDS = ['accrualDate', 'dueDate', 'scheduleDate'];

/**
 * The same record, written so that what was asked for and what came back can be
 * compared — and nothing else.
 *
 * Used only by the Update confirmation, which reads the record again and checks
 * that the paths meant to change really did. Two differences would otherwise
 * make every schedule update report a failure it did not have:
 *
 * - **A date goes in as a day and comes back as a moment.** Ask for the 20th and
 *   the API answers `2026-09-20T00:00:00Z`.
 * - **The sign of a line belongs to the collection, not to the number.** Ask a
 *   debit for a line of 300 and it answers -300, having recomputed the total
 *   from the lines itself. Measured on the cobaia on 2026-07-26: the amount at
 *   the root of the body is ignored, the lines decide, and the collection signs.
 *
 * The line ID is dropped for a third reason: every `PUT` recreates the lines
 * with new IDs, so it is never the ID that was read a moment earlier.
 *
 * And since 0.9.0 the cost centre lines need the same treatment for a fourth
 * reason: a **read answers both numbers** — `{costCenterId, percent, value,
 * costCenterDescription}` — where the update asked for one of them. Comparing
 * those two shapes as they stand can only ever say "not applied".
 *
 * What a workflow receives is never this — it is the record as the API answered
 * it, `normalizeSchedule` and nothing more.
 */
export function scheduleComparable(record: IDataObject): IDataObject {
	const comparable: IDataObject = { ...record };

	for (const field of DATE_FIELDS) {
		const value = comparable[field];
		if (typeof value === 'string' && value.trim() !== '') {
			comparable[field] = onlyTheDay(value);
		}
	}

	if (Array.isArray(comparable.categories)) {
		comparable.categories = comparable.categories.map((line) => {
			const { categoryId, value } = (line ?? {}) as IDataObject;
			const amount = Number(value);

			return { categoryId, value: Number.isFinite(amount) ? Math.abs(amount) : value };
		});
	}

	if (Array.isArray(comparable.costCenters)) {
		// The cost centres, and deliberately **not** the shares. Both numbers a
		// read answers were measured on the test company on 2026-07-26, while
		// accepting v0.9.0 against it, and neither can be compared with what was
		// asked for:
		//
		// - **`value` comes back as the percentage applied twice.** A 60% line of
		//   a schedule of 1000 answers `value` 360, and a line asked for as
		//   `value` 300 answers `percent` 30 with `value` 90 — `percent × percent
		//   × total`, every time. The percentage is stored correctly in both; the
		//   amount is not the number anybody sent.
		// - **`percent` is right, and is still not what was asked** when the
		//   apportionment is by value: the node sends 300 and the API answers 30.
		//
		// So the shares are left out of the comparison rather than compared
		// wrongly, and the list is compared as a **set** — two lines sent A then B
		// came back B then A in the same measurement.
		//
		// What the confirmation exists to catch survives all of that: an
		// apportionment that did not take at all, or took with the wrong centres.
		comparable.costCenters = comparable.costCenters
			.map((line) => String(((line ?? {}) as IDataObject).costCenterId ?? ''))
			.sort();
	}

	return comparable;
}

/**
 * The day of a date, as the API takes one on a write.
 *
 * Cut rather than converted, on purpose: the editor hands over the moment it was
 * picked with the offset it was picked in, and `2026-08-10T00:00:00.000-03:00`
 * is the 9th in UTC. A schedule that falls due one day early is a schedule that
 * is overdue one day early, so the day that was chosen is the day that travels.
 * Anything that is not a date is passed through for the API to refuse.
 */
export function onlyTheDay(value: string): string {
	const day = value.trim().slice(0, 10);

	return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : value.trim();
}
