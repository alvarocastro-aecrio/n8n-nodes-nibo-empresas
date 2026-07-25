import type { IDataObject } from 'n8n-workflow';

/**
 * The one asymmetry of the stakeholder contract, settled in a single place.
 *
 * The API **takes** `CNPJ`/`CPF` on a write and **answers** `Cnpj`/`Cpf` on a
 * read. Left alone, that difference leaks into every workflow: one comparison
 * for what was written, another for what comes back.
 *
 * So the node hands out one spelling — the one the API itself accepts — for
 * every operation, reads included. Applied to a change on its way in, the same
 * function is what lets the Update confirmation compare like for like.
 *
 * A type it does not recognize is passed through untouched: guessing would be
 * worse than the asymmetry.
 */
const DOCUMENT_TYPES: Record<string, string> = {
	cnpj: 'CNPJ',
	cpf: 'CPF',
};

export function normalizeStakeholder(record: IDataObject): IDataObject {
	const document = record.document;
	if (typeof document !== 'object' || document === null || Array.isArray(document)) {
		return record;
	}

	const { type } = document as IDataObject;
	if (typeof type !== 'string') {
		return record;
	}

	const normalized = DOCUMENT_TYPES[type.trim().toLowerCase()];
	if (normalized === undefined) {
		return record;
	}

	return { ...record, document: { ...(document as IDataObject), type: normalized } };
}

/**
 * The other asymmetry, and a costlier one: what a read answers is **not** a
 * body a write can send back.
 *
 * A `GET` mirrors `communication.phone` and `communication.email` at the root
 * of the record. Send those mirrors back in a `PUT` and the API answers HTTP
 * 200 and writes **nothing at all** — the mirror, which still carries the old
 * value, overrides the branch that carries the new one. Measured on the cobaia
 * on 2026-07-25, during the v0.4.0 acceptance: the very same `PUT` applies as
 * soon as the two fields are dropped, and the API fills the mirrors back in
 * from `communication`.
 *
 * Only these two are dropped. Everything else a read answers — `id`,
 * `personType`, `isCompany`, `initialsName`, `updateDate` — was measured to
 * travel back harmlessly, and dropping a field is never free: the API's `PUT`
 * zeroes whatever the body leaves out.
 */
const MIRRORED_AT_THE_ROOT = ['phone', 'email'];

export function stakeholderWriteBody(record: IDataObject): IDataObject {
	const body = { ...record };

	for (const field of MIRRORED_AT_THE_ROOT) {
		delete body[field];
	}

	return body;
}
