import { resolveLocale } from './locale';
import type { Translations } from './localize';
import { ptBR } from './pt-BR';

export { localizeProperties } from './localize';
export type { Translations } from './localize';

/**
 * The dictionary for the language this n8n asked for, read at class-build time
 * — which is once per n8n start. Changing `NIBO_NODE_LOCALE` therefore takes a
 * restart, and English costs nothing: an empty dictionary makes the whole
 * translation pass an identity function.
 */
export function activeTranslations(): Translations {
	return resolveLocale(process.env.NIBO_NODE_LOCALE) === 'pt-BR' ? ptBR : {};
}
