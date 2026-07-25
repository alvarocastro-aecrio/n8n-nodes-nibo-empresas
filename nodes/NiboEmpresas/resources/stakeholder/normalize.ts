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
