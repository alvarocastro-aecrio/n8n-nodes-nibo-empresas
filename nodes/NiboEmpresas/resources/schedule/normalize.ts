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
