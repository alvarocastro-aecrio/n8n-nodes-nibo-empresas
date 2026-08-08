// Gera um arquivo de dicionário por escopo, com todas as chaves corretas e o texto em
// inglês no valor. Roda sobre dist/, então exige `npm run build` antes.
//
// Chave inventada à mão é o erro silencioso desta arquitetura — não estoura, só deixa
// o rótulo em inglês. Por isso ninguém escreve chave: escreve-se tradução em cima de
// um esqueleto gerado.
//
//   npm run build && node scripts/i18n-skeleton.js
//
// Nunca sobrescreve um arquivo existente: o esqueleto é ponto de partida, não
// enxurrada por cima do que já foi traduzido. Use --force para regerar um escopo.
const fs = require('fs');
const path = require('path');

delete process.env.NIBO_NODE_LOCALE; // o inventário sai sempre do inglês

const { NiboEmpresas } = require('../dist/nodes/NiboEmpresas/NiboEmpresas.node.js');
const { collectTranslatableEntries } = require('../dist/nodes/NiboEmpresas/i18n/localize.js');

const OUT_DIR = path.join(__dirname, '..', 'nodes', 'NiboEmpresas', 'i18n', 'pt-BR');
const FORCE = process.argv.includes('--force');

/** `_` não dá nome de arquivo legível; o escopo compartilhado vira `shared`. */
const fileNameOf = (scope) => (scope === '_' ? 'shared' : scope);

const entries = collectTranslatableEntries(new NiboEmpresas().description.properties);

const byScope = {};
for (const [key, fields] of Object.entries(entries)) {
	const scope = key.split('.')[0];
	(byScope[scope] ??= {})[key] = fields;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const written = [];
for (const [scope, scopeEntries] of Object.entries(byScope)) {
	const name = fileNameOf(scope);
	const file = path.join(OUT_DIR, `${name}.ts`);

	if (fs.existsSync(file) && !FORCE) {
		console.log(`  = ${name}.ts (existe, mantido)`);
		continue;
	}

	const body = Object.entries(scopeEntries)
		.map(([key, fields]) => {
			const lines = Object.entries(fields)
				.map(([field, text]) => `\t\t${field}: ${JSON.stringify(text)},`)
				.join('\n');
			return `\t${JSON.stringify(key)}: {\n${lines}\n\t},`;
		})
		.join('\n');

	fs.writeFileSync(
		file,
		`import type { Translations } from '../localize';\n\n` +
			`/** Escopo \`${scope}\` — ${Object.keys(scopeEntries).length} entradas. */\n` +
			`export const ${name}: Translations = {\n${body}\n};\n`,
		'utf8',
	);

	written.push(name);
	console.log(`  + ${name}.ts (${Object.keys(scopeEntries).length} entradas)`);
}

const names = Object.keys(byScope).map(fileNameOf).sort();
const indexFile = path.join(OUT_DIR, 'index.ts');
fs.writeFileSync(
	indexFile,
	`import type { Translations } from '../localize';\n` +
		names.map((name) => `import { ${name} } from './${name}';`).join('\n') +
		`\n\n/** Os escopos, num dicionário só. As chaves já vêm prefixadas pelo escopo, ` +
		`então não há como um sobrescrever o outro. */\n` +
		`export const ptBR: Translations = {\n` +
		names.map((name) => `\t...${name},`).join('\n') +
		`\n};\n`,
	'utf8',
);

console.log(`\n${Object.keys(entries).length} entradas em ${names.length} escopos.`);
console.log(written.length ? `Gerados: ${written.join(', ')}` : 'Nenhum arquivo novo.');
