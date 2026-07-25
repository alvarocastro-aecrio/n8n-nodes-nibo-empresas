// Flat config for `npm run lint:community` — the pre-publish gate.
//
// Runs ONLY @n8n/eslint-plugin-community-nodes: the same rules the official
// post-publish scanner (@n8n/scan-community-package) checks. The scanner
// exits 0 even when these rules fail, so this pass is what actually blocks
// a bad publish. The legacy .eslintrc.js (npm run lint) stays untouched —
// two independent invocations, two config formats, no conflict.
//
// NOT named eslint.config.mjs on purpose: ESLint 8 silently switches to
// flat-config mode when a file with that name exists, which breaks the two
// legacy lint passes (npm run lint and the prepublishOnly one). This name
// is only ever loaded explicitly via --config.
import { n8nCommunityNodesPlugin } from '@n8n/eslint-plugin-community-nodes';
import tsParser from '@typescript-eslint/parser';

export default [
	{
		...n8nCommunityNodesPlugin.configs.recommended,
		files: ['package.json', 'nodes/**/*.ts', 'credentials/**/*.ts'],
		// Tests never reach the published tarball, which is what the official
		// scanner actually inspects — keep the two passes looking at the same
		// set of files.
		ignores: ['**/__tests__/**'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				extraFileExtensions: ['.json'],
			},
		},
	},
];
