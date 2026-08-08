/**
 * Which language the node speaks, decided once when n8n loads the class.
 *
 * The variable is OURS on purpose. n8n's own `N8N_DEFAULT_LOCALE` is not an
 * option: on 2.33.7 any value other than `en` makes `POST /rest/node-types`
 * answer HTTP 500, because the node directory is resolved from a relative path
 * and read outside a try/catch. Reading that variable here would translate the
 * labels and break the editor's description fetch at the same time.
 */
export type Locale = 'en' | 'pt-BR';

/** Anything that starts with `pt` is Portuguese; everything else is English. */
export function resolveLocale(raw: string | undefined): Locale {
	if (!raw) return 'en';

	return raw.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}
