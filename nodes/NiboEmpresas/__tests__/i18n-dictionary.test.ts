import { NiboEmpresas } from '../NiboEmpresas.node';
import { collectTranslatableEntries } from '../i18n/localize';
import { ptBR } from '../i18n/pt-BR';

/**
 * O dicionário contra a árvore real. Chave que não existe não estoura em runtime — o
 * rótulo simplesmente fica em inglês, e o erro só apareceria olhando a tela campo a
 * campo. Estes três testes trocam esse silêncio por vermelho.
 */
const inventory = collectTranslatableEntries(new NiboEmpresas().description.properties);

/**
 * Entradas cujo português é, de propósito, igual ao inglês: jargão que ninguém traduz
 * e o sufixo "Name or ID", exigido em inglês pelo lint do n8n. Toda entrada listada
 * aqui é uma decisão registrada; toda entrada NÃO listada e ainda em inglês é serviço
 * por fazer.
 */
const KEPT_IN_ENGLISH: Record<string, string> = {
	// exemplo: '_.options.oDataFilter': 'jargão OData',
};

describe('o dicionário pt-BR contra a árvore real do node', () => {
	it('não tem chave órfã', () => {
		const orphans = Object.keys(ptBR).filter((key) => inventory[key] === undefined);

		expect(orphans).toEqual([]);
	});

	it('não nomeia campo que a propriedade não tem', () => {
		const unknown: string[] = [];

		for (const [key, fields] of Object.entries(ptBR)) {
			for (const field of Object.keys(fields)) {
				if (inventory[key]?.[field] === undefined) unknown.push(`${key}.${field}`);
			}
		}

		expect(unknown).toEqual([]);
	});

	it('declara todo texto que ficou em inglês', () => {
		const untranslated: string[] = [];

		for (const [key, fields] of Object.entries(ptBR)) {
			for (const [field, text] of Object.entries(fields)) {
				if (text === inventory[key]?.[field] && KEPT_IN_ENGLISH[key] === undefined) {
					untranslated.push(`${key}.${field}`);
				}
			}
		}

		expect(untranslated).toEqual([]);
	});
});
