import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { resolveLocale } from '../i18n/locale';
import { collectTranslatableEntries, localizeProperties } from '../i18n/localize';
import type { Translations } from '../i18n/localize';

/**
 * The language layer, and what it is NOT.
 *
 * n8n has a translation mechanism of its own — a JSON file inside the node
 * package, switched by `N8N_DEFAULT_LOCALE`. It is unusable: measured against
 * n8n 2.33.7, any locale other than `en` makes `POST /rest/node-types` answer
 * HTTP 500 (`ENOENT: scandir 'dist/nodes/NiboEmpresas'` — the node directory is
 * resolved from a relative path and read outside any try/catch), and even with
 * that patched the editor files the translation under the node's short name
 * while looking it up by the full package-prefixed type. Two defects, both
 * upstream, neither reachable from a published package.
 *
 * So the labels are ours to swap, before n8n ever sees them. `NIBO_NODE_LOCALE`
 * is deliberately OUR variable and not n8n's: setting `N8N_DEFAULT_LOCALE`
 * triggers the crash above.
 */
describe('resolveLocale — which language the node speaks', () => {
	it('speaks English when nothing asks otherwise', () => {
		expect(resolveLocale(undefined)).toBe('en');
		expect(resolveLocale('')).toBe('en');
	});

	it('speaks Portuguese when asked, however the variable is spelled', () => {
		expect(resolveLocale('pt-BR')).toBe('pt-BR');
		expect(resolveLocale('pt_BR')).toBe('pt-BR');
		expect(resolveLocale('PT-br')).toBe('pt-BR');
		expect(resolveLocale('pt')).toBe('pt-BR');
	});

	it('falls back to English for a language it does not have', () => {
		expect(resolveLocale('de')).toBe('en');
		expect(resolveLocale('es-AR')).toBe('en');
	});
});

describe('localizeProperties — swapping labels without touching what is stored', () => {
	const properties: INodeProperties[] = [
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: ['bankAccount'] } },
			options: [
				{
					name: 'Get Many',
					value: 'list',
					action: 'Get many bank accounts',
					description: 'Retrieve the bank accounts of the organization',
				},
				{
					name: 'Create',
					value: 'create',
					action: 'Create a bank account',
					description: 'Open a new account in the organization',
				},
			],
			default: 'list',
		},
	];

	const dictionary: Translations = {
		'bankAccount.operation.list': {
			name: 'Buscar Várias',
			action: 'Buscar contas bancárias',
			description: 'Recupera as contas bancárias da organização',
		},
	};

	function optionOf(props: INodeProperties[], value: string) {
		return (props[0].options as INodePropertyOptions[]).find((option) => option.value === value);
	}

	it('translates the labels of the entry it knows', () => {
		const translated = localizeProperties(properties, dictionary);
		const list = optionOf(translated, 'list');

		expect(list?.name).toBe('Buscar Várias');
		expect(list?.action).toBe('Buscar contas bancárias');
		expect(list?.description).toBe('Recupera as contas bancárias da organização');
	});

	/**
	 * The whole safety of this design rests here: `value` is what a workflow
	 * stores and what the router dispatches on. A translation that reached it
	 * would break every saved workflow at once.
	 */
	it('never touches the stored value', () => {
		const translated = localizeProperties(properties, dictionary);

		expect(optionOf(translated, 'list')?.value).toBe('list');
		expect((translated[0].options as INodePropertyOptions[]).map((o) => o.value)).toEqual([
			'list',
			'create',
		]);
	});

	it('leaves in English what the dictionary does not carry', () => {
		const translated = localizeProperties(properties, dictionary);
		const create = optionOf(translated, 'create');

		expect(create?.name).toBe('Create');
		expect(create?.action).toBe('Create a bank account');
	});

	it('leaves the original properties untouched, so English stays English', () => {
		localizeProperties(properties, dictionary);

		expect(optionOf(properties, 'list')?.name).toBe('Get Many');
	});

	it('is a no-op with an empty dictionary', () => {
		const translated = localizeProperties(properties, {});

		expect(optionOf(translated, 'list')?.name).toBe('Get Many');
	});
});

/**
 * The wiring: the node reads the variable when the class is built, which is
 * once per n8n start. Changing the language is therefore a restart, and that is
 * the whole cost of this design.
 */
describe('NiboEmpresas — the node as the editor receives it', () => {
	function operationOptions(resource: string): INodePropertyOptions[] {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { NiboEmpresas } = require('../NiboEmpresas.node');
		const description = new NiboEmpresas().description;
		const operation = description.properties.find(
			(prop: INodeProperties) =>
				prop.name === 'operation' && prop.displayOptions?.show?.resource?.includes(resource),
		);

		return (operation?.options ?? []) as INodePropertyOptions[];
	}

	const original = process.env.NIBO_NODE_LOCALE;

	afterEach(() => {
		if (original === undefined) delete process.env.NIBO_NODE_LOCALE;
		else process.env.NIBO_NODE_LOCALE = original;
		jest.resetModules();
	});

	it('speaks English by default', () => {
		delete process.env.NIBO_NODE_LOCALE;
		jest.resetModules();

		const list = operationOptions('bankAccount').find((option) => option.value === 'list');

		expect(list?.name).toBe('Get Many');
		expect(list?.action).toBe('Get many bank accounts');
	});

	it('speaks Portuguese when NIBO_NODE_LOCALE asks for it', () => {
		process.env.NIBO_NODE_LOCALE = 'pt-BR';
		jest.resetModules();

		const list = operationOptions('bankAccount').find((option) => option.value === 'list');

		expect(list?.name).toBe('Buscar Várias');
		expect(list?.action).toBe('Buscar várias contas bancárias');
		expect(list?.value).toBe('list');
	});
});

describe('collectTranslatableEntries — o inventário do que dá para traduzir', () => {
	const properties: INodeProperties[] = [
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			displayOptions: { show: { resource: ['bankAccount'] } },
			options: [{ name: 'Get Many', value: 'list', action: 'Get many bank accounts' }],
			default: 'list',
		},
	];

	it('devolve o caminho de cada rótulo, com o inglês no valor', () => {
		expect(collectTranslatableEntries(properties)).toEqual({
			'bankAccount.operation': { displayName: 'Operation' },
			'bankAccount.operation.list': { name: 'Get Many', action: 'Get many bank accounts' },
		});
	});

	it('aceita o mesmo caminho duas vezes quando o texto é o mesmo', () => {
		const repeated = [properties[0], { ...properties[0] }];

		expect(() => collectTranslatableEntries(repeated)).not.toThrow();
		expect(Object.keys(collectTranslatableEntries(repeated))).toHaveLength(2);
	});

	it('estoura quando o mesmo caminho carrega textos diferentes', () => {
		const ambiguous = [properties[0], { ...properties[0], displayName: 'Operação' }];

		expect(() => collectTranslatableEntries(ambiguous)).toThrow(/ambíguo/);
	});

	it('usa exatamente as chaves que localizeProperties consulta', () => {
		const inventory = collectTranslatableEntries(properties);
		const dictionary = Object.fromEntries(
			Object.entries(inventory).map(([key, fields]) => [
				key,
				Object.fromEntries(Object.keys(fields).map((field) => [field, `PT:${field}`])),
			]),
		);
		const translated = localizeProperties(properties, dictionary);
		const option = (translated[0].options as INodePropertyOptions[])[0];

		expect(translated[0].displayName).toBe('PT:displayName');
		expect(option.name).toBe('PT:name');
		expect(option.action).toBe('PT:action');
	});
});
