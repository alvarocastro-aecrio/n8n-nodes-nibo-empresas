# PLANO DE IMPLEMENTAÇÃO — v0.16.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> **Para quem executa em sessão limpa:** as fatias estão em passos com caixa (`- [ ]`),
> cada uma com teste antes do código e commit ao fim. Nenhum passo depende de contexto
> desta conversa — tudo que foi medido está na seção 1.
>
> 🔒 Seguro para repositório público: nenhum token, nenhum ID de cliente.

**Escopo da v0.16.0:** **o node fala português.** Uma camada de idioma dentro do próprio
pacote, ligada por `NIBO_NODE_LOCALE=pt-BR`, que troca os rótulos que o editor mostra —
892 textos, em 429 caminhos — sem tocar em nada que um workflow salvo guarde.

**Por que agora.** O node foi escrito inteiro em inglês, e quem o usa é brasileiro: a API
é da Nibo, os dados voltam em português, e o operador que monta o fluxo lê "Get Many"
onde pensa "buscar". O mecanismo de tradução do próprio n8n existiria para isso e **não
serve** — está quebrado, medido na 2.33.7, seção 1.1. A camada é nossa.

**Fora de escopo:** traduzir a interface do n8n (não é nosso pacote, e exigiria
recompilar o editor a cada versão); traduzir as mensagens de erro de execução
(`transport/errors.ts`) e o README — ambos valem, ambos ficam para a 0.16.1; suporte a um
terceiro idioma; qualquer mudança em `name` de parâmetro, `value` de opção ou formato de
saída.

---

## 1. Medições — o que o spike provou

Tudo medido em 2026-08-08, em instância descartável (imagem `n8nio/n8n:2.33.7`, a mesma
da produção), com o pacote 0.15.2 instalado como um usuário instalaria.

### 1.1 🔴 O mecanismo de tradução do n8n está quebrado — para todo node

A documentação do n8n descreve um arquivo `translations/<locale>/<node>.json` dentro do
pacote do node, ligado por `N8N_DEFAULT_LOCALE`. Medição da rota que entrega as
descrições ao editor:

| Chamada | Resposta |
|---|---|
| `POST /rest/node-types`, sem locale | **200**, descrição completa, 186 propriedades |
| idem, com `N8N_DEFAULT_LOCALE=pt-BR` | **500** — `ENOENT: scandir 'dist/nodes/NiboEmpresas'` |
| idem, no node **nativo** `set` | **500** — `ENOENT: scandir 'dist/nodes/Set'` |

`getNodeTranslationPath` (em `dist/node-types.js`) monta o diretório do node com
`dirname(sourcePath)`, e `sourcePath` é **relativo**; o `readdir` que vem depois roda
fora de qualquer `try/catch`. Qualquer idioma diferente de `en` derruba a rota inteira,
para node nativo e de comunidade igualmente. O editor não parece quebrado porque cai na
lista montada na inicialização — só as traduções somem.

**Consequência para este plano:** `NIBO_NODE_LOCALE` é variável **nossa**. Ler
`N8N_DEFAULT_LOCALE` traduziria os rótulos e derrubaria a rota de descrições ao mesmo
tempo.

### 1.2 🔴 E, corrigido o crash, a chave ainda não casa para community node

Com aquela linha remendada na instância isolada (caminho tornado absoluto), a resposta
volta **200** e traz o campo `translation` preenchido — o arquivo é lido. Mas:

- o `name` na resposta é **`niboEmpresas`**, sem prefixo de pacote (medido);
- o editor arquiva a tradução sob `name.replace('n8n-nodes-base.','')` → `niboEmpresas`;
- e a procura por `shortNodeType(tipo)` → **`n8n-nodes-nibo-empresas.niboEmpresas`**.

Duas chaves diferentes. Para node nativo elas coincidem por acidente (o prefixo removido
é justamente `n8n-nodes-base.`). São dois defeitos empilhados, ambos no n8n.

### 1.3 O caminho de fora também não serve

O projeto [`other-blowsnow/n8n-i18n-chinese`](https://github.com/other-blowsnow/n8n-i18n-chinese)
(2.174 estrelas, ativo) traduz nodes **contornando** esse mecanismo: extrai os textos e
os injeta no arquivo de idioma do editor, distribuindo um `editor-ui` recompilado por
versão do n8n. Funciona, e não cabe num pacote npm — quem instalasse o nosso node
continuaria vendo inglês. Os PRs de idioma no n8n (russo #21752, coreano #17018, chinês
#16467) foram todos fechados **sem merge**: o subsistema está abandonado, não com bug
pontual.

### 1.4 ✅ A camada própria funciona, ponta a ponta

Já implementada e medida na mesma instância descartável, com o pacote compilado e
instalado:

```
COM  NIBO_NODE_LOCALE=pt-BR:   value=list  name=Buscar Várias  action=Buscar contas bancárias
SEM  a variável:               value=list  name=Get Many       action=Get many bank accounts
```

`HTTP 200` nos dois casos — nada do i18n do n8n é tocado. Mesma build, mesma instância,
só a variável mudando.

### 1.5 O tamanho do serviço, contado na build

Varredura das `properties` reais (`dist/nodes/NiboEmpresas/NiboEmpresas.node.js`):

| escopo | caminhos | textos |
|---|---:|---:|
| creditSchedule | 97 | 190 |
| customer | 54 | 97 |
| bankAccount | 29 | 64 |
| payment | 27 | 60 |
| `_` (compartilhados + Options) | 29 | 53 |
| category | 24 | 53 |
| serviceInvoice | 24 | 53 |
| collection | 24 | 52 |
| employee | 28 | 51 |
| costCenter | 20 | 47 |
| bankTransfer | 18 | 39 |
| file | 10 | 24 |
| scheduleFile | 11 | 24 |
| receipt | 8 | 21 |
| partner | 7 | 18 |
| supplier | 7 | 18 |
| debitSchedule | 7 | 18 |
| annotation | 5 | 10 |
| **total** | **429** | **892** |

O escopo `_` recolhe o que não pertence a um recurso: Authentication, API Token,
Resource, e os campos de dentro da coleção Options (que se escondem por `/resource`, com
barra, e por isso não entram num escopo de recurso).

### 1.6 Cinco caminhos aparecem duas vezes — e são idênticos

Medido na varredura: `bankAccount.filters`, `bankAccount.filters.conditions`,
`bankAccount.filterCombine` e as duas opções deste último surgem **duas vezes** na
árvore, porque `filterProperties()` é uma fábrica compartilhada e o recurso a usa em mais
de uma operação. Os textos são **byte a byte iguais** nas duas ocorrências, e **nenhum**
caminho tem texto divergente.

Portanto: caminho repetido com o mesmo texto é normal e desejável — uma entrada de
dicionário traduz todas as ocorrências. O que **não** pode passar é o mesmo caminho com
textos diferentes: aí a entrada seria ambígua, traduziria uma e estragaria a outra. O
gerador estoura só nesse caso (Fatia 1).

---

## 2. Decisões de recorte

**1. A variável é nossa: `NIBO_NODE_LOCALE`.** Motivo em 1.1. Qualquer valor começando
com `pt` (maiúsculo, minúsculo, com hífen ou sublinhado) é português; o resto é inglês.

**2. Inglês é o padrão e custa zero.** Sem a variável, o dicionário é vazio e a passagem
de tradução é a função identidade — mesma referência de objeto, nenhuma cópia.

**3. Chave por caminho, nunca pelo texto.** `<escopo>.<parâmetro>[.<value da opção>]`.
Chavear pelo texto colapsaria todos os "Name" e "Description" do node numa entrada só, e
eles se leem diferente em cada recurso.

**4. Chave nunca é escrita à mão.** O esqueleto é gerado por script a partir das
`properties` reais. Chave inventada é o erro silencioso desta arquitetura: não estoura,
só deixa o rótulo em inglês. O gerador elimina a classe inteira, e um teste barra o que
escapar.

**5. `name` de parâmetro e `value` de opção nunca são tocados.** É o que o workflow
grava e o que o roteador despacha. Um teste trava isso.

**6. Jargão fica em inglês.** `webhook`, `token`, `ID`, `OData`, `JSON`, `PDF`, `XML`,
`API`, `endpoint`, `timeout`, `base64`, `GUID`. "Gancho web" não é português, é ruído.

**7. Vocabulário de negócio é o da Nibo**, não a tradução literal do inglês: o usuário
reconhece a palavra que vê na tela do sistema dele. Glossário na seção 4.

**8. O sufixo "Name or ID" fica em inglês nos 14 campos que o têm.** A regra
`node-param-display-name-wrong-for-dynamic-options` exige aquele literal e roda no
`prepublishOnly` (o `.eslintrc.prepublish.js` estende o `.eslintrc.js`). Decisão do
Alvaro em 2026-08-08: híbrido, sem mexer na configuração do lint — é a opção que não
cria dívida de configuração.

**9. Um arquivo por escopo.** 18 arquivos em `i18n/pt-BR/`, com um índice que os junta.
Torna cada fatia de tradução independente e permite agentes em paralelo sem conflito de
escrita.

**10. Tradução em massa por agentes Sonnet, revisão por gente.** Um agente por lote,
todos com o mesmo glossário. Haiku fica de fora: o texto deste repo tem voz própria e
Haiku a achata. A revisão de vocabulário financeiro continua sendo humana — termo
errado é pior que inglês.

**11. Texto que continuar idêntico ao inglês tem que ser declarado.** Um teste lista as
entradas cujo português é igual ao inglês; cada uma precisa estar em `KEPT_IN_ENGLISH`
com motivo. É como a decisão 6 vira código verificável em vez de intenção.

---

## 3. Arquitetura — onde cada comportamento mora

```
nodes/NiboEmpresas/
├── NiboEmpresas.node.ts        constructor() aplica a tradução — 4 linhas, já escritas
├── i18n/
│   ├── index.ts                escolhe o dicionário conforme a variável
│   ├── locale.ts               resolveLocale() — o que conta como português
│   ├── localize.ts             a passagem sobre as properties + collectTranslatableEntries()
│   ├── glossario.md            o vocabulário, para gente e para agente
│   └── pt-BR/
│       ├── index.ts            junta os 18 escopos num Translations só
│       ├── shared.ts           escopo `_`
│       ├── bankAccount.ts      … um por escopo
│       └── (16 outros)
├── __tests__/
│   ├── i18n.test.ts            mecanismo (já escrito, 10 testes)
│   └── i18n-dictionary.test.ts chave órfã, campo inexistente, KEPT_IN_ENGLISH
scripts/
└── i18n-skeleton.js            gera os esqueletos a partir da build
```

`scripts/` fica fora do pacote publicado: o `files: ["dist"]` do `package.json` já
garante isso, e nenhuma dependência nova entra — o script é Node puro rodando sobre
`dist/`.

**Estado atual do repo:** a camada (`locale.ts`, `localize.ts`, `pt-BR.ts` com uma
entrada, `index.ts`), o `constructor()` e os 10 testes de `i18n.test.ts` **já existem** e
estão verdes (1.014 testes na suíte, lint limpo). A Fatia 0 confirma isso e faz o commit
se ainda não tiver sido feito.

---

## 4. Glossário — o vocabulário da Nibo

Vale para todos os lotes. Onde a Nibo tem palavra própria, é ela que manda.

| Inglês (no código) | Português | Observação |
|---|---|---|
| Stakeholder | Contato | guarda-chuva dos quatro abaixo |
| Customer | Cliente | |
| Supplier | Fornecedor | |
| Partner | Sócio | |
| Employee | Funcionário | |
| Schedule (credit) | Conta a Receber | |
| Schedule (debit) | Conta a Pagar | |
| Payment | Pagamento | baixa de conta a pagar |
| Receipt | Recebimento | baixa de conta a receber |
| Collection | Cobrança | boleto/Pix |
| Category | Categoria | |
| Cost Center | Centro de Custo | |
| Bank Account | Conta Bancária | |
| Bank Transfer | Transferência Bancária | |
| Transaction | Lançamento | |
| Service Invoice | Nota Fiscal de Serviço | "NFS-e" quando couber no rótulo |
| Annotation | Anotação | |
| File | Arquivo | |
| Schedule File | Anexo da Conta | anexo de conta a pagar/receber |
| Get Many | Buscar Várias | operação de listagem |
| Get | Buscar | |
| Create | Criar | |
| Update | Atualizar | |
| Delete | Excluir | |
| Return All | Retornar Tudo | |
| Additional Fields | Campos Adicionais | |
| Update Fields | Campos a Atualizar | |
| Options | Opções | |
| Filters | Filtros | |

**Intocáveis:** webhook, token, ID, OData, JSON, PDF, XML, API, endpoint, timeout,
base64, GUID, e o sufixo **"Name or ID"** (decisão 8).

**Registro (voz):** as descrições deste repo são frases inteiras, com julgamento e
travessão, não legenda de manual. `'Open a new account in the organization — an act this
API gives no way back from'` vira `'Abre uma conta nova na organização — um ato que esta
API não desfaz'`, e **não** `'Cria conta'`. Traduza a frase, preserve o tom.

---

## 5. Fatias, com teste antes do código

### Fatia 0: o mecanismo entra no branch

**Arquivos:**
- Já criados: `nodes/NiboEmpresas/i18n/{locale,localize,index,pt-BR}.ts`, `nodes/NiboEmpresas/__tests__/i18n.test.ts`
- Já modificado: `nodes/NiboEmpresas/NiboEmpresas.node.ts` (import + `constructor()`)

- [ ] **Passo 1: conferir o estado**

```bash
git status --short
npx jest && npm run lint
```
Esperado: 1.014 testes verdes, lint sem saída. Se `git status` vier vazio e o log já
tiver o commit do mecanismo, esta fatia está feita — siga para a 1.

- [ ] **Passo 2: branch e commit**

```bash
git checkout -b feat/i18n-pt-br
git add nodes/NiboEmpresas/i18n nodes/NiboEmpresas/__tests__/i18n.test.ts nodes/NiboEmpresas/NiboEmpresas.node.ts PLAN-v0.16.0.md
git commit -m "feat: o node ganha uma camada de idioma propria, com uma entrada de prova"
```

---

### Fatia 1: `collectTranslatableEntries` — a varredura que gera e que confere

O gerador e o teste de chave órfã precisam da **mesma** noção de "quais caminhos
existem". Uma função só, exportada de `localize.ts`, serve aos dois.

**Arquivos:**
- Modificar: `nodes/NiboEmpresas/i18n/localize.ts`
- Modificar: `nodes/NiboEmpresas/__tests__/i18n.test.ts`

**Interfaces:**
- Produz: `collectTranslatableEntries(properties: INodeProperties[]): Translations` —
  devolve, para cada caminho, os campos traduzíveis **com o texto em inglês como valor**.
  Chave idêntica à que `localizeProperties` consulta.

- [ ] **Passo 1: escrever o teste que falha**

Acrescentar ao fim de `nodes/NiboEmpresas/__tests__/i18n.test.ts`:

```ts
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
```

E acrescentar `collectTranslatableEntries` ao import do topo do arquivo.

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx jest nodes/NiboEmpresas/__tests__/i18n.test.ts
```
Esperado: FAIL — `collectTranslatableEntries` não existe.

- [ ] **Passo 3: implementar**

Em `nodes/NiboEmpresas/i18n/localize.ts`, ao fim do arquivo:

```ts
/**
 * Todo caminho traduzível da árvore, com o texto em inglês no valor — o inventário
 * de onde os esqueletos saem e contra o qual as chaves do dicionário são conferidas.
 * Anda pela mesma trilha de `localizeProperties`: uma divergência entre as duas
 * significaria chaves que ninguém consulta.
 */
export function collectTranslatableEntries(properties: INodeProperties[]): Translations {
	const entries: Translations = {};

	for (const property of properties) {
		collectProperty(property, `${scopeOf(property)}.${property.name}`, entries);
	}

	return entries;
}

function collectProperty(property: INodeProperties, path: string, entries: Translations): void {
	record(property, PROPERTY_FIELDS, path, entries);

	if (!Array.isArray(property.options)) return;

	for (const entry of property.options) {
		if (isDropdownEntry(entry)) {
			record(entry, OPTION_FIELDS, `${path}.${String(entry.value)}`, entries);
		} else {
			collectProperty(entry as INodeProperties, `${path}.${entry.name}`, entries);
		}
	}
}

function record(
	target: unknown,
	fields: readonly string[],
	path: string,
	entries: Translations,
): void {
	const source = target as Record<string, unknown>;
	const found: Record<string, string> = {};

	for (const field of fields) {
		if (typeof source[field] === 'string') found[field] = source[field] as string;
	}

	if (Object.keys(found).length === 0) return;

	const previous = entries[path];

	if (previous === undefined) {
		entries[path] = found;
		return;
	}

	// O mesmo caminho aparecer duas vezes é normal: os campos de filtro vêm de uma
	// fábrica compartilhada e o recurso a usa em mais de uma operação. Com o texto
	// igual nas duas, uma entrada de dicionário traduz ambas — que é o que se quer.
	// Texto DIFERENTE no mesmo caminho, esse sim, tornaria a entrada ambígua:
	// traduziria uma ocorrência e estragaria a outra. Só isso estoura.
	if (JSON.stringify(previous) !== JSON.stringify(found)) {
		throw new Error(`Caminho de tradução ambíguo, com textos diferentes: ${path}`);
	}
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx jest nodes/NiboEmpresas/__tests__/i18n.test.ts && npm run lint
```
Esperado: PASS, lint limpo.

- [ ] **Passo 5: commit**

```bash
git add nodes/NiboEmpresas/i18n/localize.ts nodes/NiboEmpresas/__tests__/i18n.test.ts
git commit -m "feat: o inventario de rotulos sai da mesma trilha que a traducao percorre"
```

---

### Fatia 2: o gerador de esqueletos

**Arquivos:**
- Criar: `scripts/i18n-skeleton.js`

- [ ] **Passo 1: escrever o gerador**

```js
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
```

- [ ] **Passo 2: apagar o dicionário de prova e gerar os esqueletos**

```bash
rm nodes/NiboEmpresas/i18n/pt-BR.ts
npm run build && node scripts/i18n-skeleton.js
```
Esperado: 18 arquivos criados mais o `index.ts`, e a linha final do script batendo com
**429 entradas em 18 escopos** — 892 campos de texto dentro delas (uma entrada carrega
de 1 a 4 campos).

O import em `i18n/index.ts` (`from './pt-BR'`) passa a resolver para `pt-BR/index.ts`
sozinho: nenhuma linha muda ali.

- [ ] **Passo 3: rodar a suíte**

```bash
npx jest
```
Esperado: **1 teste falha** — o `it('speaks Portuguese when NIBO_NODE_LOCALE asks for
it')` de `i18n.test.ts` espera `Buscar Várias`, e o esqueleto recém-gerado ainda está em
inglês. É o esperado: a entrada de prova foi substituída pelo esqueleto e a tradução de
verdade só chega na Fatia 4.

Não apague o teste — ele é o aceite da Fatia 4. Marque o vermelho como declarado,
trocando uma palavra:

```ts
	it.skip('speaks Portuguese when NIBO_NODE_LOCALE asks for it', () => {
```

A Fatia 4 desfaz o `.skip`. Assim o buraco fica visível na saída do jest em vez de
sumir.

- [ ] **Passo 4: commit**

```bash
git add scripts/i18n-skeleton.js nodes/NiboEmpresas/__tests__/i18n.test.ts
git add -A nodes/NiboEmpresas/i18n    # inclui a remoção do pt-BR.ts antigo
git commit -m "feat: os esqueletos de traducao nascem da build, com as chaves ja certas"
```

---

### Fatia 3: os testes que impedem o erro silencioso

**Arquivos:**
- Criar: `nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts`

- [ ] **Passo 1: escrever o teste que falha**

```ts
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
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx jest nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts
```
Esperado: os dois primeiros testes **passam** (o esqueleto veio do inventário, então as
chaves casam por construção) e o terceiro **falha**, listando as ~900 entradas ainda em
inglês. Esse vermelho é o placar do trabalho das fatias 4 a 11 — ele fica vermelho até a
última tradução entrar, e é assim que se sabe que acabou.

- [ ] **Passo 3: commit**

```bash
git add nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts
git commit -m "feat: chave orfa e texto nao traduzido viram vermelho, nao silencio"
```

---

### Fatia 4 a 11: a tradução, um lote por vez

**Oito lotes**, agrupados por afinidade de vocabulário — quem traduz "conta a receber"
deve traduzir "pagamento" na mesma cabeça. Cada lote é uma fatia idêntica em forma;
muda o arquivo e o glossário específico.

| Fatia | Lote | Arquivos em `i18n/pt-BR/` | textos |
|---|---|---|---:|
| 4 | Contas bancárias | `bankAccount.ts`, `bankTransfer.ts` | 103 |
| 5 | Contas a receber | `creditSchedule.ts` | 190 |
| 6 | Baixas e contas a pagar | `payment.ts`, `receipt.ts`, `debitSchedule.ts` | 99 |
| 7 | Contatos | `customer.ts`, `supplier.ts`, `partner.ts`, `employee.ts` | 184 |
| 8 | Classificação | `category.ts`, `costCenter.ts` | 100 |
| 9 | Cobrança e arquivos | `collection.ts`, `file.ts`, `scheduleFile.ts` | 100 |
| 10 | Nota fiscal e anotação | `serviceInvoice.ts`, `annotation.ts` | 63 |
| 11 | Compartilhados | `shared.ts` | 53 |

**Forma de cada fatia** (exemplo com a Fatia 4; as outras são iguais trocando os
arquivos):

- [ ] **Passo 1: despachar o agente**

Um agente por lote, modelo **sonnet**, `subagent_type: general-purpose`. Os oito podem
ir em paralelo — arquivos distintos, zero conflito. Prompt, literal:

```
Traduza para português do Brasil os textos do arquivo
nodes/NiboEmpresas/i18n/pt-BR/bankAccount.ts (e bankTransfer.ts) deste repositório.

REGRAS, todas obrigatórias:
1. NÃO altere nenhuma CHAVE do objeto (as strings à esquerda dos dois-pontos, como
   'bankAccount.operation.list'). Elas foram geradas a partir do código e qualquer
   mudança quebra a tradução em silêncio.
2. NÃO altere os NOMES DOS CAMPOS (displayName, description, name, action,
   placeholder, hint). Traduza apenas os VALORES entre aspas.
3. Leia nodes/NiboEmpresas/i18n/glossario.md e siga o vocabulário dele à risca.
4. Jargão fica em inglês: webhook, token, ID, OData, JSON, PDF, XML, API, endpoint,
   timeout, base64, GUID.
5. O sufixo "Name or ID" no fim de um displayName fica EM INGLÊS, exatamente assim.
   Traduza o resto do rótulo: 'Category Group Name or ID' vira
   'Grupo de Categoria Name or ID'.
6. Preserve o tom. As descrições deste repo são frases inteiras, com julgamento e
   travessão, não legenda de manual. Traduza a frase toda, não a resuma.
7. displayName e name de opção usam Maiúsculas Em Cada Palavra Principal, como o
   original ('Get Many' → 'Buscar Várias').
8. description NÃO termina com ponto final (é a convenção do n8n e o lint cobra).
9. Não mexa em nenhum outro arquivo.

Ao terminar, rode: npx jest nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts
Os testes 'não tem chave órfã' e 'não nomeia campo que a propriedade não tem' TÊM que
passar. O terceiro seguirá vermelho enquanto houver outros lotes por traduzir — ignore
as entradas que não sejam dos seus arquivos.
```

- [ ] **Passo 2: conferir o que voltou**

```bash
git diff --stat nodes/NiboEmpresas/i18n/pt-BR/
npx jest nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts
```
Esperado: só os arquivos do lote mudaram; chave órfã e campo inexistente verdes.

Leia o diff inteiro. O que procurar, em ordem de gravidade:
1. **Termo financeiro errado** — "baixa", "liquidação", "conciliação", "competência"
   têm significado exato na contabilidade e não aceitam sinônimo criativo.
2. **Chave alterada** (o diff mostraria a linha da esquerda mudando) — rejeite e refaça.
3. **Frase encurtada** — o agente resumiu em vez de traduzir; peça de novo.
4. **Jargão traduzido** — "gancho web", "ficha", "carimbo de tempo".

- [ ] **Passo 3: aceite do lote na build**

```bash
npm run build
NIBO_NODE_LOCALE=pt-BR node -e "
const { NiboEmpresas } = require('./dist/nodes/NiboEmpresas/NiboEmpresas.node.js');
const props = new NiboEmpresas().description.properties;
const op = props.find(p => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('bankAccount'));
for (const o of op.options) console.log(o.value.padEnd(20), o.name.padEnd(24), o.action ?? '');
"
```
Esperado: a coluna do meio inteira em português, a da esquerda (`value`) intacta.

- [ ] **Passo 4: suíte, lint e commit**

```bash
npx jest && npm run lint
git add nodes/NiboEmpresas/i18n/pt-BR
git commit -m "feat: contas bancarias falam portugues"
```

Na **Fatia 4**, desfaça também o `it.skip` deixado na Fatia 2 (o teste de `Buscar
Várias` volta a valer) — se o agente traduziu `bankAccount.operation.list` de outra
forma, é o teste que se ajusta ao vocabulário escolhido, não o contrário.

---

### Fatia 12: consistência entre os lotes

Oito agentes em paralelo divergem em tom por mais glossário que levem. Esta fatia é a
costura, e é humana.

**Arquivos:**
- Modificar: os que precisarem em `nodes/NiboEmpresas/i18n/pt-BR/`
- Modificar: `nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts` (`KEPT_IN_ENGLISH`)

- [ ] **Passo 1: levantar as divergências**

```bash
node -e "
const fs=require('fs'), path=require('path');
const dir='nodes/NiboEmpresas/i18n/pt-BR';
const counts={};
for (const f of fs.readdirSync(dir).filter(f=>f!=='index.ts')) {
  for (const m of fs.readFileSync(path.join(dir,f),'utf8').matchAll(/: \"(.*?)\",\$/gm)) {
    const t=m[1]; (counts[t] ??= new Set()).add(f);
  }
}
const termos=['Buscar','Criar','Atualizar','Excluir','Retornar','Campos Adicionais','Campos a Atualizar','Filtros','Opções','Limite'];
for (const t of Object.keys(counts).sort()) if (termos.some(x=>t.startsWith(x))) console.log(String([...counts[t]].length).padStart(3), t);
"
```
Leia a lista procurando o mesmo conceito escrito de dois jeitos ("Buscar Várias" vs
"Listar", "Campos a Atualizar" vs "Campos de Atualização"). Uniformize pelo glossário.

- [ ] **Passo 2: declarar o que ficou em inglês**

```bash
npx jest nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts
```
O terceiro teste lista o que sobrou em inglês. Para cada entrada: ou traduza, ou
acrescente a `KEPT_IN_ENGLISH` com o motivo em uma linha. Ao fim desta fatia os **três
testes ficam verdes** — é a definição de "acabou".

- [ ] **Passo 3: commit**

```bash
npx jest && npm run lint
git add nodes/NiboEmpresas/i18n nodes/NiboEmpresas/__tests__/i18n-dictionary.test.ts
git commit -m "feat: os oito lotes passam a falar a mesma lingua"
```

---

### Fatia 13: aceite em n8n de verdade, e a versão

**Arquivos:**
- Modificar: `package.json` (versão), `CHANGELOG.md`, `README.md`

- [ ] **Passo 1: instalar o pacote numa instância descartável**

```bash
npm run build && npm pack
docker compose -f docker-compose.dev.yml -p n8ndev up -d
docker cp n8n-nodes-nibo-empresas-0.16.0.tgz n8ndev-n8n-1:/tmp/node.tgz
docker exec -u node n8ndev-n8n-1 sh -c 'cd /home/node/.n8n/nodes && npm install /tmp/node.tgz --omit=dev'
```

Para ver em português, o container precisa da variável — acrescente
`- NIBO_NODE_LOCALE=pt-BR` ao `environment:` do `docker-compose.dev.yml` antes do `up`.
⚠️ **Nunca** use `N8N_DEFAULT_LOCALE`: derruba a rota de descrições (seção 1.1).

- [ ] **Passo 2: olhar a tela**

Túnel `ssh -L 5679:localhost:5679`, `http://localhost:5679`. Adicionar o node, percorrer
os 12 recursos, conferir: rótulos em português, nenhum campo com texto cortado, o
sufixo "Name or ID" onde deve estar. Anotar aqui o que foi verificado, como os planos
anteriores fazem na seção de aceite.

- [ ] **Passo 3: versão, changelog, README**

`package.json`: `0.15.2` → `0.16.0`. No `README.md`, uma seção curta:

```markdown
## Idioma

O node fala inglês por padrão. Para os rótulos em português, defina no seu n8n:

    NIBO_NODE_LOCALE=pt-BR

O idioma é lido quando o n8n carrega o node, então a mudança vale a partir do próximo
reinício. Nada do que um workflow guarda muda com o idioma — o mesmo fluxo roda igual
nos dois.

Não use `N8N_DEFAULT_LOCALE`: em n8n 2.33.7 qualquer valor diferente de `en` derruba a
rota que entrega as descrições dos nodes ao editor (`ENOENT: scandir`), para nodes
nativos e de comunidade igualmente.
```

- [ ] **Passo 4: fechar**

```bash
npx jest && npm run lint && npm run build
git add package.json CHANGELOG.md README.md
git commit -m "aceite: a 0.16.0 fala portugues — 892 rotulos, e o value intacto"
git tag v0.16.0
```

---

## 6. Regras invioláveis, e onde continuam atendidas

| Regra | Onde |
|---|---|
| `value` de opção e `name` de parâmetro nunca mudam | teste "never touches the stored value"; decisão 5; nenhum campo desses entra em `PROPERTY_FIELDS`/`OPTION_FIELDS` |
| Workflow salvo continua rodando igual | consequência da anterior — o roteador despacha por `value` |
| Inglês continua sendo o padrão e não custa nada | `activeTranslations()` devolve `{}`; `localizeProperties` vira identidade |
| Nenhuma dependência nova | o gerador é Node puro sobre `dist/`; `scripts/` fica fora do `files: ["dist"]` |
| Nada de `N8N_DEFAULT_LOCALE` | decisão 1, medição 1.1, aviso no README |
| Sem chave escrita à mão | Fatia 2 gera; Fatia 3 barra o que escapar |

## 7. Teste e aceite

```bash
npx jest          # suíte inteira — 1.014 testes na 0.15.2, mais os desta versão
npm run lint      # inclui as regras de texto do n8n que valem na publicação
npm run build     # tsc + ícones
node scripts/i18n-skeleton.js   # não deve gerar nada novo: os 18 escopos já existem
```

Aceite só se fecha com o node em tela, no n8n de verdade (Fatia 13). Contagem em teste
não prova rótulo legível.

## 8. O que fica decidido

1. A tradução mora no nosso pacote, não no mecanismo do n8n — que está quebrado em dois
   lugares independentes, ambos medidos.
2. A variável é `NIBO_NODE_LOCALE`, e nunca a do n8n.
3. Um arquivo por escopo, chave por caminho, esqueleto gerado por script.
4. Jargão em inglês, vocabulário de negócio em Nibo, "Name or ID" em inglês.
5. Agentes Sonnet traduzem em lotes; a consistência final e o vocabulário financeiro são
   revisados por gente.
6. Erros de execução e README traduzidos ficam para a 0.16.1.
