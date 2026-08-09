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
		// This pass and the official scanner do NOT look at the same files, and
		// the difference is deliberate. Measured against v0.16.0's scan:
		//
		//   - the scanner analyses TWO trees, not one: a checkout of this repo
		//     (`{nodes,credentials}/**/*.{js,ts,json}` — `__tests__` included)
		//     AND the published tarball (`**/*.js`, i.e. dist);
		//   - it runs with `allowInlineConfig: false`, so every `eslint-disable`
		//     in this repo is invisible to it. A suppression can never make the
		//     scanner pass — only removing the code can.
		//
		// Tests are ignored here because a finding in a test file cannot reach a
		// user, and because this pass has one job: stop a bad PUBLISH, which the
		// scanner cannot do (it runs after). Findings the scanner reports about
		// test files are read, not gated on.
		ignores: ['**/__tests__/**'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				extraFileExtensions: ['.json'],
			},
		},
	},
];
