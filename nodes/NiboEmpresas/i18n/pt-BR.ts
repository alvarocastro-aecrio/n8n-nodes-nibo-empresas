import type { Translations } from './localize';

/**
 * The Portuguese dictionary. One entry for now, on purpose: it is the proof
 * that the mechanism reaches the editor before the other ~1.200 strings are
 * worth writing.
 *
 * The entry is the Bank Account "Get Many" operation, chosen because it shows
 * up in three different places in the editor — the Operation dropdown (`name`),
 * the node's action list (`action`) and the help text under it
 * (`description`) — so one look at the panel exercises all three fields.
 */
export const ptBR: Translations = {
	'bankAccount.operation.list': {
		name: 'Buscar Várias',
		action: 'Buscar contas bancárias',
		description: 'Recupera as contas bancárias da organização',
	},
};
