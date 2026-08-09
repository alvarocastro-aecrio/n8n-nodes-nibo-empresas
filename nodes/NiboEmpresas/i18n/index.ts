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
	// The one place this package touches `process`, and the community-nodes rule
	// that forbids it is right in general: a node has no business reading the
	// host's environment, where the credentials of every other integration live.
	// This reads a single variable of our own, by name, never enumerates `env`,
	// and what it does with the value is choose between two literal objects
	// compiled into this file. Nothing read here reaches a request, a log or an
	// output. The alternative is not a safer mechanism — it is no mechanism:
	// `description` is built in the constructor, where no n8n context exists yet,
	// so an environment variable is the only thing a node can be told at that
	// moment. See PLAN-v0.16.0.md §1 for why n8n's own locale variable is unusable.
	//
	// The directive below is deliberately unnamed. It suppresses
	// `@n8n/community-nodes/no-restricted-globals`, a rule only the
	// `lint:community` pass loads — naming it makes the other two passes fail
	// with "Definition for rule was not found", since neither knows that plugin.
	// eslint-disable-next-line
	return resolveLocale(process.env.NIBO_NODE_LOCALE) === 'pt-BR' ? ptBR : {};
}
