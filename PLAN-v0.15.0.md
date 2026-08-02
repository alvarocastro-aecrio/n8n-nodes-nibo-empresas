# PLANO DE IMPLEMENTAÇÃO — v0.15.0

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar fatia por fatia. Os passos usam
> caixinha (`- [ ]`) para marcação.

**Objetivo:** fazer o agendamento nascer já com boleto programado, com NFS-e programada, e
repetindo — por recorrência ou por parcelas — em uma única criação.

**Arquitetura:** os quatro blocos são campos a mais no mesmo `POST /schedules/credit` (e
`/schedules/debit`, onde só a repetição existe) que o node já faz. Nada de orquestração de
várias chamadas: a tela coleta, dois módulos novos traduzem para o corpo, e o handler existente
manda. O que muda depois da criação é só a leitura de volta.

**Stack:** TypeScript, n8n-workflow, Jest. **Zero dependência de runtime** — regra do projeto e
exigência do programa de verificação do n8n.

**Desenho aprovado:** `claude-n8n/docs/superpowers/specs/2026-08-01-agendamento-avancado-design.md`
(repo privado). Este plano é a execução dele.

---

## Restrições globais

Valem para **todas** as fatias, sem repetição em cada uma:

- **Rótulos da UI em inglês**, descrições em inglês. Documento interno em português. (Decisão 9)
- **Zero dependência de runtime.** Nada de `import` que não seja `n8n-workflow` ou tipo.
- **Nome de parâmetro é contrato.** Um campo publicado nunca some da tela e nunca troca de nome.
  Rótulos podem repetir entre blocos; nomes de parâmetro, nunca.
- **Escrita na API do Nibo só na empresa cobaia**, e só com OK explícito do Alvaro. A exceção
  desta versão está na fatia 9 e é declarada antes de rodar.
- **Token nunca em código, commit, plano ou log.** Ele vive em variável de ambiente.
- **Nenhum número de organização de produção neste arquivo** — este repo é público.
- **`displayOptions` nunca aponta para dentro de coleção.** `getNodeParameters` resolve a
  condição com `onlySimpleTypes`, o campo conta como escondido e **o valor é descartado**.
  Custou a 0.11.0. Todo `show` deste plano olha para campo simples.
- **Bloco em "não" não põe chave nenhuma no corpo.** Um agendamento criado sem tocar nos campos
  novos sai byte por byte igual ao da 0.14.2.
- **Lint e testes verdes antes de cada commit:** `npm run lint && npm test`.

---

## 1. O que já foi medido — 2026-08-01

### 1.1 As rotas de parcelamento existem; as de recorrência não existem

Sonda com GUID zerado, lendo o **tipo** do erro e não o texto — erro de negócio só nasce onde
há rota, que é o mesmo raciocínio que achou a rota de cancelar cobrança na 0.13.0:

| Rota | Resposta | Leitura |
|---|---|---|
| `GET /installments/{guid}` | **500** `validation_error` — *"Parcelamento não encontrado"* | **existe** |
| `GET /installments/{guid}/schedules` | **500**, mesma frase | **existe** |
| `GET /installments` | 404 *"Resource not found"* | não há coleção |
| `GET /recurrences` | 404 | **não existe** |
| `GET /recurrences/{guid}` | 404 | **não existe** |
| `GET /schedules/recurrences` | 404 | **não existe** |

**Consequência de desenho, e não é pequena:** as parcelas irmãs são legíveis; as ocorrências de
uma recorrência **não são**. O node não pode devolver a lista de uma recorrência porque não há
onde buscá-la.

### 1.2 A cobaia não emite boleto nem nota — e responde isso com lista vazia

`GET /public/collections-profiles` e `GET /nfse/serviceprofiles` respondem
`200 {"items":[],"count":0}` na cobaia. Não é erro: é uma empresa nova, sem provedor bancário
contratado e sem certificado digital homologado. **Boleto e nota só se provam numa organização
de produção**, que é a terceira exceção declarada deste projeto (0.13.0 e 0.14.0 foram as
outras duas).

### 1.3 O registro do agendamento já carrega as chaves da automação

Lendo um agendamento qualquer, o DTO traz — e ninguém tinha reparado:

```
hasInstallment · hasRecurrence · hasInvoice · hasPendingInvoice · hasScheduleInvoice
autoGenerateNFSeType · autoGenerateCollectionType · serviceProvisionLocationType
hasEntryPromise · hasOpenEntryPromise · lastEntryPromise · autoGenerateEntryPromise
isPaymentScheduled
```

Numa amostra **sem** parcelamento **não** há `installmentId`. Se ele existe, existe só quando há
parcelamento — que é o que a documentação afirma e o que a fatia 0 tem de confirmar.

Medido também: `$filter=hasRecurrence eq false` funciona e conta; `$filter=hasInstallment eq true`
responde **500** — esse não filtra.

### 1.4 O que a documentação promete, e **ainda não foi medido**

Fonte: <https://nibo.readme.io/reference/agendar-recebimento>, lida em 2026-08-01. **Nada abaixo
é medição deste projeto.**

**Objeto `collection`** — a automação do boleto:

| Chave | Valores |
|---|---|
| `AutoGenerateCollectionType` | **2** = X dias antes do vencimento · **3** = imediatamente |
| `DaysBeforeDueDateToGenerateCollection` | os X dias, quando o tipo é 2 |
| `CollectionProfileId` | o perfil de cobrança |
| `deliveryType` | **0** = e-mail · **1** = integração do contador |

**Campos de NFS-e, na raiz do corpo:** `autoGenerateNFSeType` (**2** dias antes · **3** quando a
baixa for realizada · **4** quando o boleto for criado · **5** imediatamente),
`daysBeforeDueDateToGenerateNFSe`, `serviceProfileId`, `additionalServiceDescription`,
`additionalRemarks`, `cityWhereServiceWasProvided`, `stateWhereServiceWasProvided`.

**Objeto `recurrence`:** `enabled`, `intervalType` (0 dia · 1 semana · 2 mês · 3 ano),
`interval`, `recurrenceEndType` (0 indeterminado · 1 por ocorrências · 2 por data),
`maxOccurrences`, `endDate`.

**Array `instalment`** — com um "l" só na documentação — uma entrada por parcela:
`installmentNumber`, `value`, `dueDate` obrigatórios; `description`, `scheduleDate`,
`accrualDate`, `reference` opcionais.

**A documentação diz que `recurrence` e `instalment` não vão juntos.** No débito existem os dois
e **não** existem `collection` nem os campos de NFS-e.

**Da central de ajuda:** a recorrência provisiona até **36 meses** à frente; o parcelamento vai
até **100** parcelas.

### 1.5 As respostas da sonda — 2026-08-02

Sonda rodada na cobaia em 2026-08-02, quatro passadas (`sonda-0.15.0.mjs` a `-d.mjs`, fora do
repo), cobaia zerada ao fim e conferida 10 segundos depois: 0 agendamentos, 0 clientes. As
perguntas 2.6 e 2.7 dependem de perfil e ficam para a fatia 9, como o plano já dizia.

**2.1 — A rota simples aceita os blocos.** `POST /schedules/credit` com `instalment` → 200;
com `recurrence` → 200. Nenhuma variante `/FormatType=json` foi necessária. Boleto e nota não
são prováveis na cobaia (perfis vazios) — ficam para a fatia 9.

**2.2 — O POST devolve um GUID puro: o do primeiro agendamento.** Com `instalment` de 3, o
corpo da resposta é `"21002295-…"`, que é exatamente o `firstScheduleId` que o grupo declara.
O read-back do `niboCreate` serve como está.

**2.3 — O `installmentId` existe, mas aninhado.** O registro criado com parcelas carrega
`installment: { installmentId, parcelNumber }` — **não** há `installmentId` na raiz, e
`parcelNumber` é a string `"1/3"`. As duas rotas do grupo respondem:

- `GET /installments/{id}` → `{ installmentId, divideTotalValue, totalOfInstallments,
  totalValue, sendNFSeActionType, firstScheduleId }`
- `GET /installments/{id}/schedules` → **array puro** (não `{items}`), cada irmã com
  `{ scheduleId, dueDate, scheduleDate, accrualDate, value, installmentNumber }` — sem descrição.

**Consequência, aplicada na fatia 6:** `withTheSiblings` lê `record.installment?.installmentId`
em vez de `record.installmentId`, e o merge preserva o `parcelNumber` que o registro já traz:
`installment: { ...record.installment, ...summary, schedules }`. O mock do teste muda junto.

**2.4 — O valor de cada parcela é soberano; a API aceita os dois modos.** Parcelas 300+300 com
categoria de 300 → 200, cada agendamento nasce com `value` 300 e o grupo declara
`totalValue: 600`. Parcelas 100/100/100 com categoria de 300 → cada agendamento nasce com 100 e
a **linha de categoria de cada parcela é reescrita pela API** para o valor da parcela. *Split*
e *Repeat* ficam ambos, como a tela desenha.

**2.5 — Grafia confirmada nas parcelas: `instalment`, um "l".** Com dois "l" a API respondeu
200, criou um agendamento simples de 300 e `hasInstallment` ficou `false` — aceitou-e-ignorou,
como previsto. As maiúsculas do objeto `collection` só se provam na fatia 9.

**2.8 — Uma recorrência cria UM agendamento.** `count` = 1 na hora e 12 segundos depois, com
`hasRecurrence: true` nele. As ocorrências futuras não existem como agendamentos legíveis pela
API no momento da criação — o provisionamento de 36 meses é do Nibo, não desta API.
**Consequência, aplicada na fatia 6:** o aviso `_niboRecurrenceNotListed` não diz "Nibo created
the occurrences"; diz que a criação devolve só o primeiro agendamento e que as ocorrências não
são listáveis por esta API.

**Medições que a sonda não previa, e que mudam desenho:**

- **A descrição da raiz é descartada quando há parcelas.** Cada parcela nasce com a descrição
  `"{descrição da linha} - X/Y"` — linha com "linha um" virou `"linha um - 1/2"`, linha sem
  descrição virou `" - 2/2"`, e a raiz `"raiz"` não sobreviveu em lugar nenhum.
  **Consequência, aplicada nas fatias 2, 3 e 6:** o node copia a descrição do agendamento para
  cada linha que não tem a sua — nas geradas sempre, nas digitadas como default do campo
  `Detail` vazio. Sem isso a descrição do usuário some em silêncio e as parcelas ficam
  inencontráveis por descrição.
- **Apagar uma parcela apaga só ela.** `DELETE /schedules/credit/{id}` numa parcela do meio →
  204, o grupo continua com as outras. E a rota das irmãs mostra a parcela apagada por alguns
  segundos — o atraso de lista desta API vale para ela também.

---

## 2. As oito perguntas que a Fatia 0 tem de responder

Nenhuma linha de código antes destas respostas. Cada uma tem uma consequência escrita ao lado,
porque medição sem consequência é curiosidade.

| # | Pergunta | Se a resposta for outra |
|---|---|---|
| 2.1 | A rota simples `POST /schedules/credit` aceita os quatro blocos? | Se só a `/FormatType=json` aceitar, `niboCreate` ganha a variante e a fatia 6 muda |
| 2.2 | O que o POST devolve quando cria vários? | Se não devolver GUID, o read-back de `niboCreate` não serve e a fatia 6 lê por filtro |
| 2.3 | O agendamento com parcelas carrega `installmentId`? | Sem ele não há como ler as irmãs, e a promessa da seção 6 da spec cai |
| 2.4 | As parcelas somam as categorias, ou cada uma repete o valor delas? | Decide o que *Split* e *Repeat* fazem — se a API só aceitar um dos dois, a opção some da tela |
| 2.5 | `instalment` ou `installment`? `AutoGenerateCollectionType` ou minúscula? | Esta API **aceita-e-ignora** o que não reconhece: a grafia errada passa e não faz nada |
| 2.6 | Um `PUT` mexe na automação de um agendamento que a carrega? | Se mexer, o update precisa de `writeBody` tirando as chaves — vira fatia própria |
| 2.7 | "X dias antes" com vencimento longe **não** dispara na hora? | Se disparar, metade do aceite da fatia 9 sai, e o campo ganha aviso na tela |
| 2.8 | Quantos agendamentos uma recorrência cria, e `hasRecurrence` fica em todos? | Muda o texto do aviso `_niboRecurrenceNotListed` |

**Regra da sonda, que já custou caro a este projeto:** o que a sonda criar, ela **anota o ID na
hora**. Há coleção nesta API sem `GET` nenhum, e quem não guarda o ID perde o registro para
sempre. Em 2026-07-28 quatro arquivos ficaram de resíduo permanente na cobaia por causa disso.

---

## 3. Decisões de recorte — tomadas com o Alvaro em 2026-08-01

| # | Decisão |
|---|---|
| 1 | **Os quatro blocos** entram nesta versão, parcelamento incluído |
| 2 | **A tela pergunta**: gatilho simples na tela, e os campos daquela resposta nascem sozinhos — o jeito do `Return All` → `Limit`, e não caixa de `+ Add Field` |
| 3 | **Um item por criação**, com as parcelas irmãs listadas dentro dele |
| 4 | **Boleto real e nota real** no aceite, numa organização de produção, sob exceção declarada |
| 5 | **O node calcula** as parcelas a partir de quantidade e intervalo, **e** existe o modo de digitar linha a linha |

E o que **não** entra, com o motivo: **Update com esses blocos** (a API só aceita na criação),
**encerrar ou alterar recorrência** (não há rota), **ler as ocorrências de uma recorrência**
(não há rota — vira aviso), e **um recurso `Installment` próprio** (as duas rotas ficam medidas
aqui; virar recurso é conversa da 0.16.0).

---

## 4. Arquitetura — onde cada comportamento mora

`schedule/description.ts` tem 739 linhas e é o maior arquivo do pacote. Com os três blocos
dentro, dobrava. Então os blocos saem dele, e cada módulo novo carrega **a tela e a tradução
para o corpo do mesmo assunto** — juntas, porque mudam juntas.

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `resources/schedule/repeat.ts` | O campo `Repeat`, a recorrência, as parcelas, e o gerador de datas e valores | **novo** |
| `resources/schedule/automation.ts` | Os gatilhos de boleto e de nota, e o pedaço de corpo dos dois | **novo** |
| `resources/schedule/description.ts` | Monta a tela chamando os dois | modificado |
| `resources/schedule/execute.ts` | Junta os pedaços ao corpo, lê as irmãs, põe o aviso da recorrência | modificado |
| `__tests__/scheduleRepeat.test.ts` | Recorrência, parcelas, e a aritmética do gerador | **novo** |
| `__tests__/scheduleAutomation.test.ts` | Boleto e nota | **novo** |
| `__tests__/schedule.test.ts` | Ganha os casos de integração das duas pontas | modificado |

**A interface entre os módulos e o handler**, para que ninguém precise ler o outro:

```ts
// repeat.ts
export function repeatProperties(resources: string[]): INodeProperties[];
export function repeatPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	total: number,
): IDataObject;

// automation.ts
export function automationProperties(resources: string[]): INodeProperties[];
export function automationPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
): IDataObject;
```

Os dois `*Payload` devolvem **`{}`** quando o bloco está em "não". `total` é a soma das linhas de
`Categories`, que é como esta API declara o valor de um agendamento — ela não guarda total.

---

## 5. Fatias, com teste antes do código

### Fatia 0 — A sonda: responder as oito perguntas

**Arquivos:**
- Criar: `<scratchpad>/sonda-0.15.0.mjs` (fora do repo — sonda não é código do pacote)

**Interfaces:** produz as respostas de 2.1 a 2.8, que as fatias seguintes consomem como fato.

- [x] **Passo 1: escrever a sonda**

```js
// <scratchpad>/sonda-0.15.0.mjs — roda com: node sonda-0.15.0.mjs
// Token pela env, nunca no arquivo:  set -a; . ~/.config/nibo/cobaia.env; set +a
const BASE = 'https://api.nibo.com.br/empresas/v1';
const TOKEN = process.env.NIBO_COBAIA_TOKEN;
if (!TOKEN) throw new Error('sem NIBO_COBAIA_TOKEN no ambiente');

/** Tudo que a sonda criar entra aqui NA HORA — há coleção nesta API sem GET nenhum */
const criados = [];

async function call(method, path, body) {
	const response = await fetch(`${BASE}${path}`, {
		method,
		headers: { ApiToken: TOKEN, Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	let parsed;
	try { parsed = JSON.parse(text); } catch { parsed = text; }
	return { status: response.status, body: parsed };
}

const categoria = process.env.SONDA_CATEGORIA;   // id de categoria de receita da cobaia
const contato = process.env.SONDA_CONTATO;       // id de um cliente da cobaia

const base = (descricao) => ({
	stakeholderId: contato,
	dueDate: '2027-03-10',
	scheduleDate: '2027-03-10',
	description: descricao,
	categories: [{ categoryId: categoria, value: 300 }],
});

async function main() {
	// 2.5 + 2.1 + 2.2 — parcelamento pela grafia da doc, um "l"
	const tresParcelas = {
		...base('sonda 0.15.0 — instalment um l'),
		instalment: [
			{ installmentNumber: 1, value: 100, dueDate: '2027-03-10' },
			{ installmentNumber: 2, value: 100, dueDate: '2027-04-10' },
			{ installmentNumber: 3, value: 100, dueDate: '2027-05-10' },
		],
	};
	const criacao = await call('POST', '/schedules/credit', tresParcelas);
	console.log('2.1/2.2 POST com instalment →', criacao.status, JSON.stringify(criacao.body).slice(0, 300));

	const id = typeof criacao.body === 'string' ? criacao.body.trim().replace(/^"|"$/g, '') : '';
	if (id) criados.push(id);

	// 2.3 — o registro criado carrega installmentId?
	const lido = await call('GET', `/schedules/credit/${id}`);
	console.log('2.3 installmentId →', lido.body?.installmentId, '· hasInstallment →', lido.body?.hasInstallment);

	// 2.3 — e as irmãs?
	if (lido.body?.installmentId) {
		console.log('2.3 grupo →', JSON.stringify((await call('GET', `/installments/${lido.body.installmentId}`)).body));
		const irmas = await call('GET', `/installments/${lido.body.installmentId}/schedules`);
		console.log('2.3 irmãs →', irmas.status, JSON.stringify(irmas.body).slice(0, 600));
		for (const irma of (Array.isArray(irmas.body) ? irmas.body : irmas.body?.items ?? [])) {
			if (irma.scheduleId && irma.scheduleId !== id) criados.push(irma.scheduleId);
		}
	}

	// 2.4 — parcelas que NÃO somam as categorias
	const naoSoma = await call('POST', '/schedules/credit', {
		...base('sonda 0.15.0 — parcelas nao somam'),
		instalment: [
			{ installmentNumber: 1, value: 300, dueDate: '2027-03-10' },
			{ installmentNumber: 2, value: 300, dueDate: '2027-04-10' },
		],
	});
	console.log('2.4 parcelas repetindo o valor →', naoSoma.status, JSON.stringify(naoSoma.body).slice(0, 300));
	if (naoSoma.status < 300 && typeof naoSoma.body === 'string') criados.push(naoSoma.body.trim().replace(/^"|"$/g, ''));

	// 2.5 — a grafia errada, dois "l": aceita-e-ignora?
	const doisEles = await call('POST', '/schedules/credit', {
		...base('sonda 0.15.0 — installment dois l'),
		installment: [
			{ installmentNumber: 1, value: 150, dueDate: '2027-03-10' },
			{ installmentNumber: 2, value: 150, dueDate: '2027-04-10' },
		],
	});
	console.log('2.5 grafia com dois l →', doisEles.status);
	if (doisEles.status < 300 && typeof doisEles.body === 'string') {
		const outro = doisEles.body.trim().replace(/^"|"$/g, '');
		criados.push(outro);
		console.log('2.5 hasInstallment →', (await call('GET', `/schedules/credit/${outro}`)).body?.hasInstallment);
	}

	// 2.8 — recorrência mensal, 3 ocorrências
	const rec = await call('POST', '/schedules/credit', {
		...base('sonda 0.15.0 — recorrencia'),
		recurrence: { enabled: true, intervalType: 2, interval: 1, recurrenceEndType: 1, maxOccurrences: 3 },
	});
	console.log('2.8 POST com recurrence →', rec.status, JSON.stringify(rec.body).slice(0, 200));
	if (rec.status < 300 && typeof rec.body === 'string') criados.push(rec.body.trim().replace(/^"|"$/g, ''));

	const doDescricao = await call(
		'GET',
		`/schedules/credit?%24top=50&%24orderby=scheduleId&%24filter=${encodeURIComponent("description eq 'sonda 0.15.0 — recorrencia'")}`,
	);
	console.log('2.8 quantos nasceram →', doDescricao.body?.count);
	for (const r of doDescricao.body?.items ?? []) if (!criados.includes(r.scheduleId)) criados.push(r.scheduleId);
	console.log('2.8 hasRecurrence de cada →', (doDescricao.body?.items ?? []).map((r) => r.hasRecurrence));

	console.log('\nIDs criados, para a limpeza:', JSON.stringify(criados, null, 1));
}

main().catch((error) => { console.error(error); console.log('IDs criados:', JSON.stringify(criados)); });
```

- [x] **Passo 2: rodar**

Os dois IDs saem da própria cobaia, e uma empresa nova já tem as 22 categorias que o Nibo cria
sozinho — o cliente é que costuma faltar, e aí se cria um com Contact - Customer antes:

```bash
set -a; . ~/.config/nibo/cobaia.env; set +a
API=https://api.nibo.com.br/empresas/v1

# uma categoria de RECEITA — categoria de custo num recebível é recusada falando do valor
curl -s -H "ApiToken: $NIBO_COBAIA_TOKEN" \
  "$API/categories?%24top=5&%24orderby=id&%24filter=type%20eq%20'In'" | head -c 400

# um cliente
curl -s -H "ApiToken: $NIBO_COBAIA_TOKEN" \
  "$API/customers?%24top=3&%24orderby=id" | head -c 400

export SONDA_CATEGORIA=<o id que saiu acima>
export SONDA_CONTATO=<o id que saiu acima>
node <scratchpad>/sonda-0.15.0.mjs 2>&1 | tee <scratchpad>/sonda-0.15.0.log
```

`<scratchpad>` é qualquer pasta **fora do repo** — a sonda não é código do pacote e não entra no
`git`.

Esperado: um número e um corpo para cada uma das perguntas 2.1 a 2.5 e 2.8. **Nenhuma delas tem
resposta esperada** — é medição, não teste.

- [x] **Passo 3: limpar a cobaia**

Apagar **todos** os IDs que a sonda imprimiu: `DELETE /schedules/credit/{id}` para cada um.
Conferir a limpeza **alguns segundos depois** — a lista desta API atrasa depois de um DELETE, e
conferir na hora mostra fantasma.

- [x] **Passo 4: escrever as respostas na seção 1 deste arquivo**

Cada pergunta de 2.1 a 2.8 vira uma subseção de 1.5 em diante, com o número e o corpo que a API
respondeu. Onde a resposta contrariar a coluna "se a resposta for outra", **parar e ajustar o
plano antes de continuar**.

- [x] **Passo 5: commit**

```bash
git add PLAN-v0.15.0.md
git commit -m "medicao: a sonda da 0.15.0 respondeu as oito perguntas"
```

> As perguntas **2.6** e **2.7** dependem de perfil e ficam para a fatia 9, na organização de
> produção. Até lá, o código assume "não mexe" e "não dispara" — e a fatia 9 é quem prova.

---

### Fatia 1 — `Repeat` e a recorrência

**Arquivos:**
- Criar: `nodes/NiboEmpresas/resources/schedule/repeat.ts`
- Criar: `nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts`
- Modificar: `nodes/NiboEmpresas/resources/schedule/description.ts`

**Interfaces:**
- Consome: nada.
- Produz: `repeatProperties(resources: string[]): INodeProperties[]` e
  `repeatPayload(this: IExecuteFunctions, itemIndex: number, collected: IDataObject, total: number): IDataObject`.
  Nomes de parâmetro: `repeat`, `recurrenceInterval`, `recurrenceIntervalType`, `recurrenceEnds`,
  `recurrenceOccurrences`, `recurrenceEndDate`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts
import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { repeatPayload, repeatProperties } from '../resources/schedule/repeat';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const context = { getNode: () => NODE } as unknown as IExecuteFunctions;

function payload(collected: IDataObject, total = 300): IDataObject {
	return repeatPayload.call(context, 0, collected, total);
}

describe('repeat — a recorrência', () => {
	it('não põe chave nenhuma quando ninguém pediu repetição', () => {
		expect(payload({ repeat: 'no' })).toEqual({});
		expect(payload({})).toEqual({});
	});

	it('manda a recorrência mensal por ocorrências', () => {
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 1,
				recurrenceIntervalType: 'month',
				recurrenceEnds: 'occurrences',
				recurrenceOccurrences: 12,
			}),
		).toEqual({
			recurrence: {
				enabled: true,
				intervalType: 2,
				interval: 1,
				recurrenceEndType: 1,
				maxOccurrences: 12,
			},
		});
	});

	it('manda a recorrência por data, e só o dia da data', () => {
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 2,
				recurrenceIntervalType: 'week',
				recurrenceEnds: 'date',
				recurrenceEndDate: '2027-06-30T00:00:00.000-03:00',
			}),
		).toEqual({
			recurrence: {
				enabled: true,
				intervalType: 1,
				interval: 2,
				recurrenceEndType: 2,
				endDate: '2027-06-30',
			},
		});
	});

	it('manda a recorrência indeterminada sem número nem data', () => {
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 1,
				recurrenceIntervalType: 'year',
				recurrenceEnds: 'never',
			}),
		).toEqual({
			recurrence: { enabled: true, intervalType: 3, interval: 1, recurrenceEndType: 0 },
		});
	});

	it('recusa a recorrência por data sem data', () => {
		expect(() =>
			payload({ repeat: 'recurrence', recurrenceEnds: 'date', recurrenceEndDate: '' }),
		).toThrow(NodeOperationError);
	});

	it('recusa ocorrências zero ou negativas, e aceita uma só', () => {
		expect(() =>
			payload({ repeat: 'recurrence', recurrenceEnds: 'occurrences', recurrenceOccurrences: 0 }),
		).toThrow(NodeOperationError);
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 1,
				recurrenceIntervalType: 'month',
				recurrenceEnds: 'occurrences',
				recurrenceOccurrences: 1,
			}).recurrence,
		).toMatchObject({ maxOccurrences: 1 });
	});
});

describe('repeat — a tela', () => {
	it('mostra Repeat nas duas famílias e esconde os filhos até haver resposta', () => {
		const fields = repeatProperties(['creditSchedule', 'debitSchedule']);
		const repeat = fields.find((field) => field.name === 'repeat');

		expect(repeat?.default).toBe('no');
		expect(repeat?.displayOptions?.show?.resource).toEqual(['creditSchedule', 'debitSchedule']);
		expect(repeat?.displayOptions?.show?.operation).toEqual(['create']);

		const ends = fields.find((field) => field.name === 'recurrenceEnds');
		expect(ends?.displayOptions?.show?.repeat).toEqual(['recurrence']);
	});

	it('nenhuma condição da tela olha para dentro de uma coleção', () => {
		for (const field of repeatProperties(['creditSchedule'])) {
			for (const path of Object.keys(field.displayOptions?.show ?? {})) {
				expect(path).not.toContain('.');
				expect(path).not.toContain('/');
			}
		}
	});
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx jest scheduleRepeat -t 'recorrência'`
Esperado: **FALHA** — `Cannot find module '../resources/schedule/repeat'`.

- [ ] **Passo 3: escrever o mínimo que passa**

```ts
// nodes/NiboEmpresas/resources/schedule/repeat.ts
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { onlyTheDay } from './normalize';

/**
 * Como um agendamento se repete — e é **uma pergunta com três respostas**, não duas
 * caixas. A API recusa recorrência e parcelamento no mesmo pedido, e uma pergunta
 * só é o que torna essa combinação inalcançável pela tela. É o mesmo raciocínio do
 * `Apportion By`, que é uma caixa e não duas.
 */
const REPEAT = 'repeat';

/** O que a API chama de `intervalType`: 0 dia, 1 semana, 2 mês, 3 ano */
const INTERVAL_TYPE: Record<string, number> = { day: 0, week: 1, month: 2, year: 3 };

/** O que a API chama de `recurrenceEndType`: 0 indeterminado, 1 por ocorrências, 2 por data */
const END_TYPE: Record<string, number> = { never: 0, occurrences: 1, date: 2 };

const INTERVAL_OPTIONS = [
	{ name: 'Day', value: 'day' },
	{ name: 'Month', value: 'month' },
	{ name: 'Week', value: 'week' },
	{ name: 'Year', value: 'year' },
];

export function repeatProperties(resources: string[]): INodeProperties[] {
	const onCreate = { resource: resources, operation: ['create'] };
	const onRecurrence = { ...onCreate, [REPEAT]: ['recurrence'] };

	return [
		{
			displayName: 'Repeat',
			name: REPEAT,
			type: 'options',
			options: [
				{
					name: "Don't Repeat",
					value: 'no',
					description: 'One schedule, on the due date above — which is what every schedule written before this field existed does',
				},
				{
					name: 'Installments',
					value: 'installments',
					description: 'One amount split into parcels, each with its own due date. Nibo tags them "Parcelado — X/Y".',
				},
				{
					name: 'Recurrence',
					value: 'recurrence',
					description: 'The same amount again and again. Nibo provisions the occurrences up to 36 months ahead.',
				},
			],
			default: 'no',
			description:
				'How this schedule repeats. It is one question with three answers because the API refuses recurrence and installments in the same request — and neither can be turned into the other afterwards.',
			displayOptions: { show: onCreate },
		},
		{
			displayName: 'Repeat Every',
			name: 'recurrenceInterval',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
			description: 'How many of the units below go by between one occurrence and the next',
			displayOptions: { show: onRecurrence },
		},
		{
			displayName: 'Interval',
			name: 'recurrenceIntervalType',
			type: 'options',
			options: INTERVAL_OPTIONS,
			default: 'month',
			description: 'The unit the interval above counts in',
			displayOptions: { show: onRecurrence },
		},
		{
			displayName: 'Ends',
			name: 'recurrenceEnds',
			type: 'options',
			options: [
				{ name: 'After a Number of Occurrences', value: 'occurrences' },
				{ name: 'Never', value: 'never' },
				{ name: 'On a Date', value: 'date' },
			],
			default: 'occurrences',
			description:
				'When the repetition stops. Ending it later is done in Nibo, not here: this API has no route that reads or changes a recurrence once it exists.',
			displayOptions: { show: onRecurrence },
		},
		{
			displayName: 'Occurrences',
			name: 'recurrenceOccurrences',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 12,
			description: 'How many times in total, counting the first one',
			displayOptions: { show: { ...onRecurrence, recurrenceEnds: ['occurrences'] } },
		},
		{
			displayName: 'End Date',
			name: 'recurrenceEndDate',
			type: 'dateTime',
			// Um dia, não um instante: a API toma YYYY-MM-DD, e meia-noite em Brasília
			// é o dia anterior em UTC.
			typeOptions: { dateOnly: true },
			default: '',
			description: 'The last day the repetition may fall on',
			displayOptions: { show: { ...onRecurrence, recurrenceEnds: ['date'] } },
		},
	];
}

export function repeatPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	_total: number,
): IDataObject {
	const chosen = String(collected[REPEAT] ?? 'no');

	if (chosen === 'recurrence') {
		return { recurrence: recurrence.call(this, itemIndex, collected) };
	}

	return {};
}

function recurrence(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
): IDataObject {
	const ends = String(collected.recurrenceEnds ?? 'occurrences');
	const endType = END_TYPE[ends] ?? 1;

	const body: IDataObject = {
		enabled: true,
		intervalType: INTERVAL_TYPE[String(collected.recurrenceIntervalType ?? 'month')] ?? 2,
		interval: Number(collected.recurrenceInterval ?? 1),
		recurrenceEndType: endType,
	};

	if (ends === 'occurrences') {
		const times = Number(collected.recurrenceOccurrences ?? 0);
		if (!Number.isFinite(times) || times < 1) {
			throw new NodeOperationError(this.getNode(), 'This recurrence says how it ends but not when', {
				itemIndex,
				description:
					'Ends is set to "After a number of occurrences", so Occurrences needs a number of 1 or more. One occurrence is allowed and means the same as not repeating at all.',
			});
		}
		body.maxOccurrences = times;
	}

	if (ends === 'date') {
		const day = onlyTheDay(String(collected.recurrenceEndDate ?? ''));
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			throw new NodeOperationError(this.getNode(), 'This recurrence ends on a date it does not give', {
				itemIndex,
				description:
					'Ends is set to "On a date", so End Date has to carry one. Left empty, the API would be told to repeat until a day that does not exist.',
			});
		}
		body.endDate = day;
	}

	return body;
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx jest scheduleRepeat`
Esperado: **PASSA**, todos os casos da recorrência e da tela.

- [ ] **Passo 5: ligar na tela**

Em `resources/schedule/description.ts`, importar e espalhar dentro de `scheduleFields`, logo
depois do bloco de `COST_CENTERS`/`APPORTION_BY` e **antes** de `Additional Fields`:

```ts
import { repeatProperties } from './repeat';
// …
	...repeatProperties(EVERY_TYPE),
```

- [ ] **Passo 6: rodar o pacote inteiro**

Rodar: `npm run lint && npm test`
Esperado: verde. `description.test.ts` já varre a tela inteira contra as regras do linter do n8n
— se ele reclamar de ordem alfabética das opções, a ordem das opções é que muda, nunca o `value`.

- [ ] **Passo 7: commit**

```bash
git add nodes/NiboEmpresas/resources/schedule/repeat.ts \
        nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts \
        nodes/NiboEmpresas/resources/schedule/description.ts
git commit -m "feat: o agendamento aprende a se repetir — a recorrencia"
```

> **A recusa que a spec pedia e que este código não escreve.** A seção 7 do desenho previa
> recusar recorrência **e** parcelamento no mesmo pedido, "inalcançável pela tela, alcançável por
> expressão". Com `repeat` sendo **um** parâmetro de três valores, os dois blocos leem a mesma
> caixa: uma expressão só consegue pôr um valor nela, e a combinação deixa de existir mesmo por
> expressão. Uma guarda para um estado inalcançável é código que nenhum teste pode provar — então
> a decisão é não escrevê-la, e é esta nota que registra que a ausência é escolha e não esquecimento.

---

### Fatia 2 — Parcelamento linha a linha

**Arquivos:**
- Modificar: `nodes/NiboEmpresas/resources/schedule/repeat.ts`
- Modificar: `nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts`

**Interfaces:**
- Consome: `repeatPayload` da fatia 1.
- Produz: os parâmetros `installmentsAre` e `installments` (fixedCollection cujas linhas se
  chamam `installment`, com `installmentNumber`, `dueDate`, `value`, `description`).

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('repeat — as parcelas digitadas', () => {
	it('manda o array na grafia da API, uma entrada por linha', () => {
		expect(
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: {
					installment: [
						{ installmentNumber: 1, dueDate: '2027-03-10T00:00:00.000-03:00', value: 100 },
						{ installmentNumber: 2, dueDate: '2027-04-10T00:00:00.000-03:00', value: 200, description: 'segunda' },
					],
				},
			}),
		).toEqual({
			instalment: [
				{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
				{ installmentNumber: 2, dueDate: '2027-04-10', value: 200, description: 'segunda' },
			],
		});
	});

	it('recusa linha sem vencimento', () => {
		expect(() =>
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: { installment: [{ installmentNumber: 1, dueDate: '', value: 100 }] },
			}),
		).toThrow(NodeOperationError);
	});

	it('recusa números de parcela repetidos', () => {
		expect(() =>
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: {
					installment: [
						{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
						{ installmentNumber: 1, dueDate: '2027-04-10', value: 100 },
					],
				},
			}),
		).toThrow(NodeOperationError);
	});

	it('recusa linha sem valor', () => {
		expect(() =>
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: { installment: [{ installmentNumber: 1, dueDate: '2027-03-10', value: 0 }] },
			}),
		).toThrow(NodeOperationError);
	});

	it('recusa a lista vazia — parcelar em nada não é parcelar', () => {
		expect(() =>
			payload({ repeat: 'installments', installmentsAre: 'listed', installments: {} }),
		).toThrow(NodeOperationError);
	});
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx jest scheduleRepeat -t 'parcelas digitadas'`
Esperado: **FALHA** — o payload volta `{}`, porque `installments` ainda não é tratado.

- [ ] **Passo 3: escrever o mínimo que passa**

Em `repeat.ts`, o quarto parâmetro de `repeatPayload` deixa de ser ignorado: renomear `_total`
para `total` na assinatura, e acrescentar o ramo novo:

```ts
	if (chosen === 'installments') {
		return { instalment: instalments.call(this, itemIndex, collected, total) };
	}
```

e, abaixo:

```ts
/**
 * As parcelas, na grafia da API — **`instalment`, com um "l" só**. Não é engano
 * deste arquivo: é como a documentação da Nibo escreve a chave, e esta API
 * aceita-e-ignora o que não reconhece, então a grafia errada passaria em silêncio
 * criando um agendamento sem parcela nenhuma.
 */
function instalments(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	total: number,
): IDataObject[] {
	if (String(collected.installmentsAre ?? 'generated') === 'listed') {
		return listed.call(this, itemIndex, collected);
	}

	return generated.call(this, itemIndex, collected, total);
}

function listed(this: IExecuteFunctions, itemIndex: number, collected: IDataObject): IDataObject[] {
	const rows = (collected.installments as IDataObject | undefined)?.installment;

	if (!Array.isArray(rows) || rows.length === 0) {
		throw new NodeOperationError(this.getNode(), 'This installment plan has no installment', {
			itemIndex,
			description:
				'Add at least one line under Installments, with its number, its due date and its amount — or switch Installments Are to "Generated" and say how many.',
		});
	}

	const seen = new Set<number>();

	return rows.map((row) => {
		const { installmentNumber, dueDate, value, description } = (row ?? {}) as IDataObject;
		const day = onlyTheDay(String(dueDate ?? ''));
		const number = Number(installmentNumber);

		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			throw new NodeOperationError(this.getNode(), 'An installment line has no due date', {
				itemIndex,
				description: 'Every line under Installments needs the day it falls due. The API refuses the plan without it.',
			});
		}

		if (!Number.isFinite(number) || seen.has(number)) {
			throw new NodeOperationError(this.getNode(), `Installment number ${String(installmentNumber)} is missing or repeated`, {
				itemIndex,
				description:
					'Each line needs its own number, and the numbers are what tell the parcels apart in Nibo — where they are shown as "Parcelado — X/Y".',
			});
		}
		seen.add(number);

		const amount = Number(value);
		if (!Number.isFinite(amount) || amount <= 0) {
			throw new NodeOperationError(this.getNode(), `Installment ${number} has no amount`, {
				itemIndex,
				description:
					'Every line under Installments needs a positive amount. A parcel worth nothing is not a parcel, and the API refuses the plan rather than the line.',
			});
		}

		const line: IDataObject = { installmentNumber: number, dueDate: day, value: amount };
		const detail = String(description ?? '').trim();

		return detail === '' ? line : { ...line, description: detail };
	});
}
```

E a tela, acrescentada a `repeatProperties`, com `onInstallments = { ...onCreate, [REPEAT]: ['installments'] }`:

```ts
		{
			displayName: 'Installments Are',
			name: 'installmentsAre',
			type: 'options',
			options: [
				{
					name: 'Generated',
					value: 'generated',
					description: 'Say how many and how far apart, and the node writes the parcels — the first one falling on the Due Date above',
				},
				{
					name: 'Listed One by One',
					value: 'listed',
					description: 'Type every parcel, for a plan that is not regular — a bigger first parcel, a broken due date',
				},
			],
			default: 'generated',
			description: 'How the parcels are told to the node. The API always wants them one by one; this is only who writes them out.',
			displayOptions: { show: onInstallments },
		},
		{
			displayName: 'Installments',
			name: 'installments',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Installment',
			default: {},
			description: 'The parcels, as the API takes them. Up to 100.',
			displayOptions: { show: { ...onInstallments, installmentsAre: ['listed'] } },
			options: [
				{
					displayName: 'Installment',
					name: 'installment',
					values: [
						{
							displayName: 'Number',
							name: 'installmentNumber',
							type: 'number',
							typeOptions: { minValue: 1 },
							default: 1,
							description: 'Which parcel this is — 1 for the first. Nibo shows it as "Parcelado — X/Y".',
						},
						{
							displayName: 'Due Date',
							name: 'dueDate',
							type: 'dateTime',
							typeOptions: { dateOnly: true },
							default: '',
							description: 'The day this parcel falls due',
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'number',
							default: 0,
							description: 'The amount of this parcel, always typed as a positive number',
						},
						{
							displayName: 'Detail',
							name: 'description',
							type: 'string',
							default: '',
							description: 'What this parcel is about. Left empty it is not sent at all.',
						},
					],
				},
			],
		},
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx jest scheduleRepeat`
Esperado: **PASSA**. `generated` ainda não existe — o teste da fatia 3 é quem a cobra.

- [ ] **Passo 5: commit**

```bash
git add nodes/NiboEmpresas/resources/schedule/repeat.ts nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts
git commit -m "feat: as parcelas digitadas linha a linha"
```

---

### Fatia 3 — Parcelamento calculado, e a aritmética que dói

**Arquivos:**
- Modificar: `nodes/NiboEmpresas/resources/schedule/repeat.ts`
- Modificar: `nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts`

**Interfaces:**
- Produz: os parâmetros `installmentCount`, `installmentInterval`, `installmentIntervalType`,
  `installmentAmount`, e a função interna `generated`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('repeat — as parcelas calculadas', () => {
	const plano = (extra: IDataObject, total = 300) =>
		payload(
			{
				repeat: 'installments',
				installmentsAre: 'generated',
				dueDate: '2027-03-10',
				installmentInterval: 1,
				installmentIntervalType: 'month',
				installmentAmount: 'split',
				...extra,
			},
			total,
		).instalment as IDataObject[];

	it('divide o total e anda de mês em mês', () => {
		expect(plano({ installmentCount: 3 })).toEqual([
			{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
			{ installmentNumber: 2, dueDate: '2027-04-10', value: 100 },
			{ installmentNumber: 3, dueDate: '2027-05-10', value: 100 },
		]);
	});

	it('repete o valor em cada parcela quando é o que se pediu', () => {
		expect(plano({ installmentCount: 2, installmentAmount: 'repeat' })).toEqual([
			{ installmentNumber: 1, dueDate: '2027-03-10', value: 300 },
			{ installmentNumber: 2, dueDate: '2027-04-10', value: 300 },
		]);
	});

	it('fecha a soma em centavos, distribuindo a sobra nas primeiras', () => {
		const parcelas = plano({ installmentCount: 3 }, 100);
		expect(parcelas.map((p) => p.value)).toEqual([33.34, 33.33, 33.33]);
		expect(parcelas.reduce((sum, p) => sum + (p.value as number), 0)).toBeCloseTo(100, 10);
	});

	it('mês curto: 31/01 vira o último dia de fevereiro e VOLTA para 31 em março', () => {
		expect(
			plano({ installmentCount: 4, dueDate: '2027-01-31' }, 400).map((p) => p.dueDate),
		).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
	});

	it('ano bissexto: 31/12/2027 mais dois meses cai em 29/02/2028', () => {
		expect(
			plano({ installmentCount: 3, dueDate: '2027-12-31' }, 300).map((p) => p.dueDate),
		).toEqual(['2027-12-31', '2028-01-31', '2028-02-29']);
	});

	it('anda em dias, semanas e anos também', () => {
		expect(plano({ installmentCount: 2, installmentIntervalType: 'day', installmentInterval: 15 }).map((p) => p.dueDate))
			.toEqual(['2027-03-10', '2027-03-25']);
		expect(plano({ installmentCount: 2, installmentIntervalType: 'week', installmentInterval: 2 }).map((p) => p.dueDate))
			.toEqual(['2027-03-10', '2027-03-24']);
		expect(plano({ installmentCount: 2, installmentIntervalType: 'year', installmentInterval: 1 }).map((p) => p.dueDate))
			.toEqual(['2027-03-10', '2028-03-10']);
	});

	it('recusa menos de duas e mais de cem parcelas', () => {
		expect(() => plano({ installmentCount: 1 })).toThrow(NodeOperationError);
		expect(() => plano({ installmentCount: 101 })).toThrow(NodeOperationError);
	});

	it('recusa dividir um total que não existe', () => {
		expect(() => plano({ installmentCount: 3 }, 0)).toThrow(NodeOperationError);
	});
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx jest scheduleRepeat -t 'parcelas calculadas'`
Esperado: **FALHA** — `generated` não existe.

- [ ] **Passo 3: escrever o mínimo que passa**

```ts
/** O teto do parcelamento, declarado pela central de ajuda da Nibo */
const MAX_INSTALLMENTS = 100;

function generated(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	total: number,
): IDataObject[] {
	const count = Number(collected.installmentCount ?? 0);

	if (!Number.isInteger(count) || count < 2 || count > MAX_INSTALLMENTS) {
		throw new NodeOperationError(this.getNode(), `${String(collected.installmentCount ?? '')} is not a number of installments`, {
			itemIndex,
			description: `Number of Installments goes from 2 to ${MAX_INSTALLMENTS}. Splitting an amount into one part is not a split — leave Repeat on "Don't repeat" for that.`,
		});
	}

	const split = String(collected.installmentAmount ?? 'split') === 'split';
	const first = onlyTheDay(String(collected.dueDate ?? ''));

	if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) {
		throw new NodeOperationError(this.getNode(), 'The installments have no first due date', {
			itemIndex,
			description: 'The first parcel falls on the Due Date of the schedule, and that field is empty.',
		});
	}

	if (!Number.isFinite(total) || total <= 0) {
		throw new NodeOperationError(this.getNode(), 'There is no amount to split into installments', {
			itemIndex,
			description:
				'The amount of a schedule is the sum of its lines under Categories — this API keeps no total of its own — and that sum is zero.',
		});
	}

	const every = Number(collected.installmentInterval ?? 1);
	const unit = String(collected.installmentIntervalType ?? 'month');
	const amounts = split ? shareOut(total, count) : new Array(count).fill(total);

	return amounts.map((value, index) => ({
		installmentNumber: index + 1,
		dueDate: addInterval(first, unit, every * index),
		value,
	}));
}

/**
 * O total repartido em centavos, e a sobra distribuída nas primeiras parcelas —
 * um centavo em cada, não todos no primeiro. 100 em três é 33,34 / 33,33 / 33,33,
 * e a soma fecha. Feito em inteiros porque `100 / 3` em ponto flutuante não fecha
 * nunca, e uma parcela a mais ou a menos é a API recusando o plano inteiro.
 */
function shareOut(total: number, count: number): number[] {
	const cents = Math.round(total * 100);
	const base = Math.floor(cents / count);
	const left = cents - base * count;

	return Array.from({ length: count }, (_, index) => (base + (index < left ? 1 : 0)) / 100);
}

/**
 * A data da parcela, andando pelo calendário e não por milissegundos.
 *
 * Mês é a parte que dói: 31/01 mais um mês não existe, e o que se faz é **grudar no
 * último dia do mês de destino** — 28 ou 29 de fevereiro. E a parcela seguinte volta
 * a ser 31, porque a conta é sempre feita a partir do **primeiro** vencimento, nunca
 * do anterior: encadear encolheria o dia para sempre depois do primeiro fevereiro.
 */
function addInterval(first: string, unit: string, amount: number): string {
	const [year, month, day] = first.split('-').map(Number);

	if (unit === 'day' || unit === 'week') {
		const moved = new Date(Date.UTC(year, month - 1, day + amount * (unit === 'week' ? 7 : 1)));
		return iso(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
	}

	const months = amount * (unit === 'year' ? 12 : 1);
	const target = new Date(Date.UTC(year, month - 1 + months, 1));
	const targetYear = target.getUTCFullYear();
	const targetMonth = target.getUTCMonth() + 1;
	const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();

	return iso(targetYear, targetMonth, Math.min(day, lastDay));
}

function iso(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
```

E os quatro campos na tela, com
`onGenerated = { ...onCreate, [REPEAT]: ['installments'], installmentsAre: ['generated'] }`:

```ts
		{
			displayName: 'Number of Installments',
			name: 'installmentCount',
			type: 'number',
			typeOptions: { minValue: 2, maxValue: 100 },
			default: 2,
			description: 'How many parcels, counting the first. Nibo allows up to 100.',
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Repeat Every',
			name: 'installmentInterval',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
			description: 'How far apart the parcels fall',
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Interval',
			name: 'installmentIntervalType',
			type: 'options',
			options: INTERVAL_OPTIONS,
			default: 'month',
			description:
				'The unit the interval above counts in. On months the day is kept and clamped to the end of a short month — a plan starting on the 31st falls on the 28th in February and back on the 31st in March.',
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Amount',
			name: 'installmentAmount',
			type: 'options',
			options: [
				{
					name: 'Repeat the Amount on Every Installment',
					value: 'repeat',
					description: 'Each parcel is worth the whole sum of the lines under Categories',
				},
				{
					name: 'Split the Total Across the Installments',
					value: 'split',
					description: 'The sum of the lines under Categories is divided, and the leftover cents go on the first parcels so the total closes',
				},
			],
			default: 'split',
			description:
				'What the amount of each parcel is. "The total" is the sum of the lines under Categories: this API keeps no total of its own.',
			displayOptions: { show: onGenerated },
		},
```

> ⚠️ `dueDate` entra em `collected` pelo handler (fatia 6) e **não** é um campo declarado aqui:
> ele já está na tela desde a 0.1.0, e declarar de novo seria dois campos com um nome só.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx jest scheduleRepeat`
Esperado: **PASSA**, incluindo os casos de 31/01, de bissexto e do centavo.

- [ ] **Passo 5: rodar o pacote e commitar**

```bash
npm run lint && npm test
git add nodes/NiboEmpresas/resources/schedule/repeat.ts nodes/NiboEmpresas/__tests__/scheduleRepeat.test.ts
git commit -m "feat: o node calcula as parcelas — datas grudadas no fim do mes e centavo que fecha"
```

---

### Fatia 4 — O boleto

**Arquivos:**
- Criar: `nodes/NiboEmpresas/resources/schedule/automation.ts`
- Criar: `nodes/NiboEmpresas/__tests__/scheduleAutomation.test.ts`
- Modificar: `nodes/NiboEmpresas/resources/schedule/description.ts`

**Interfaces:**
- Produz: `automationProperties(resources: string[])` e
  `automationPayload(this, itemIndex, collected)`. Parâmetros: `generateBoleto`,
  `boletoDaysBefore`, `boletoCollectionProfileId`, `boletoDeliveryType`.

> **Nomes com prefixo, de propósito.** `collectionProfileId` e `serviceProfileId` já existem no
> node, nos recursos Collection e Service Invoice. Parâmetro é guardado **por nome dentro do
> node**, então repetir o nome seria dividir o valor entre duas telas diferentes.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// nodes/NiboEmpresas/__tests__/scheduleAutomation.test.ts
import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { automationPayload, automationProperties } from '../resources/schedule/automation';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const context = { getNode: () => NODE } as unknown as IExecuteFunctions;
const payload = (collected: IDataObject) => automationPayload.call(context, 0, collected);

describe('automation — o boleto', () => {
	it('não põe chave nenhuma quando ninguém pediu boleto', () => {
		expect(payload({ generateBoleto: 'no' })).toEqual({});
		expect(payload({})).toEqual({});
	});

	it('manda o boleto imediato sem falar em dias', () => {
		expect(
			payload({ generateBoleto: 'now', boletoCollectionProfileId: 'perfil-1', boletoDeliveryType: 'default' }),
		).toEqual({ collection: { AutoGenerateCollectionType: 3, CollectionProfileId: 'perfil-1' } });
	});

	it('manda o boleto de dias antes com os dias', () => {
		expect(
			payload({
				generateBoleto: 'before',
				boletoDaysBefore: 5,
				boletoCollectionProfileId: 'perfil-1',
				boletoDeliveryType: 1,
			}),
		).toEqual({
			collection: {
				AutoGenerateCollectionType: 2,
				DaysBeforeDueDateToGenerateCollection: 5,
				CollectionProfileId: 'perfil-1',
				deliveryType: 1,
			},
		});
	});

	it('recusa boleto sem perfil', () => {
		expect(() => payload({ generateBoleto: 'now', boletoCollectionProfileId: '  ' })).toThrow(NodeOperationError);
	});

	it('recusa dias antes vazio ou zero', () => {
		expect(() =>
			payload({ generateBoleto: 'before', boletoDaysBefore: 0, boletoCollectionProfileId: 'perfil-1' }),
		).toThrow(NodeOperationError);
	});
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx jest scheduleAutomation`
Esperado: **FALHA** — módulo não encontrado.

- [ ] **Passo 3: escrever o mínimo que passa**

```ts
// nodes/NiboEmpresas/resources/schedule/automation.ts
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * As duas automações que só existem no **crédito**: o boleto e a nota.
 *
 * A API as coloca no mesmo corpo da criação do agendamento — o boleto dentro de um
 * objeto `collection`, a nota espalhada na raiz — e é a única hora em que as aceita.
 * Num `PUT` não há campo para nenhuma das duas.
 *
 * ⚠️ **A grafia do objeto do boleto é a da documentação da Nibo**, três chaves em
 * maiúscula e uma em minúscula. Não é engano deste arquivo: o corpo de criação de
 * cobrança do recurso Collection é o único desta API escrito assim, e esta é a
 * segunda ocorrência. Confirmada pela sonda da fatia 0.
 */
const AUTO_COLLECTION: Record<string, number> = { before: 2, now: 3 };

export function automationProperties(resources: string[]): INodeProperties[] {
	const onCreate = { resource: resources, operation: ['create'] };
	const onBoleto = { ...onCreate, generateBoleto: ['before', 'now'] };

	return [
		{
			displayName: 'Generate Boleto',
			name: 'generateBoleto',
			type: 'options',
			options: [
				{
					name: 'A Number of Days Before the Due Date',
					value: 'before',
					description: 'Nibo issues the charge that many days ahead of the due date',
				},
				{
					name: "Don't Generate",
					value: 'no',
					description: 'No charge — which is what every schedule written before this field existed does',
				},
				{
					name: 'Immediately',
					value: 'now',
					description: 'The charge is issued as the schedule is created. There is a boleto at the end of this.',
				},
			],
			default: 'no',
			description:
				'Whether this receivable is born with a charge — a boleto, with the Pix QR printed on it. A schedule carries at most one charge, and cancelling it later is done with the Collection resource. ⚠️ Its public link is the charge itself: whoever holds it opens the payment page with no token.',
			displayOptions: { show: onCreate },
		},
		{
			displayName: 'Days Before Due Date',
			name: 'boletoDaysBefore',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 5,
			description: 'How many days before the due date Nibo issues the charge',
			displayOptions: { show: { ...onCreate, generateBoleto: ['before'] } },
		},
		{
			displayName: 'Collection Profile Name or ID',
			name: 'boletoCollectionProfileId',
			type: 'options',
			typeOptions: {
				loadOptionsMethod: 'loadCollectionProfiles',
				loadOptionsDependsOn: ['authMode'],
			},
			default: '',
			description:
				'Which profile issues the charge — it ties the bank provider to it, and the API refuses without one. An organization with no profile cannot issue charges at all. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: { show: onBoleto },
		},
		{
			displayName: 'Delivery',
			name: 'boletoDeliveryType',
			type: 'options',
			options: [
				{ name: 'By E-Mail', value: 0, description: "Nibo sends it from the financial side" },
				{ name: 'Leave It to Nibo', value: 'default', description: 'The key is not sent at all' },
				{
					name: 'Through the Accountant',
					value: 1,
					description: "The charge is handed to Nibo's accountant module and reaches the payer in the client portal there",
				},
			],
			default: 'default',
			description:
				'Which way the charge leaves. **Both deliver** — the choice is the route, not whether. Through the Accountant only makes sense for an organization whose Nibo is integrated with that module.',
			displayOptions: { show: onBoleto },
		},
	];
}

export function automationPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
): IDataObject {
	const payload: IDataObject = {};
	const boleto = String(collected.generateBoleto ?? 'no');

	if (boleto === 'no') {
		return payload;
	}

	const profile = String(collected.boletoCollectionProfileId ?? '').trim();
	if (profile === '') {
		throw new NodeOperationError(this.getNode(), 'This boleto names no collection profile', {
			itemIndex,
			description:
				'Pick a Collection Profile, which is what ties a bank provider to the charge. An empty list there means the organization cannot issue charges at all — that is set up in Nibo, with the provider contracted.',
		});
	}

	const collection: IDataObject = {
		AutoGenerateCollectionType: AUTO_COLLECTION[boleto],
		CollectionProfileId: profile,
	};

	if (boleto === 'before') {
		const days = Number(collected.boletoDaysBefore ?? 0);
		if (!Number.isFinite(days) || days < 1) {
			throw new NodeOperationError(this.getNode(), 'This boleto is due before a number of days it does not give', {
				itemIndex,
				description: 'Days Before Due Date needs a number of 1 or more. For a charge issued at once, choose Immediately instead.',
			});
		}
		collection.DaysBeforeDueDateToGenerateCollection = days;
	}

	const delivery = collected.boletoDeliveryType;
	if (delivery !== 'default' && delivery !== '' && delivery !== undefined) {
		collection.deliveryType = Number(delivery);
	}

	payload.collection = collection;

	return payload;
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx jest scheduleAutomation`
Esperado: **PASSA**.

- [ ] **Passo 5: ligar na tela — só no crédito**

Em `description.ts`, **antes** de `repeatProperties(EVERY_TYPE)`:

```ts
import { automationProperties } from './automation';
// …
	...automationProperties(['creditSchedule']),
```

- [ ] **Passo 6: rodar tudo e commitar**

```bash
npm run lint && npm test
git add nodes/NiboEmpresas/resources/schedule/automation.ts \
        nodes/NiboEmpresas/__tests__/scheduleAutomation.test.ts \
        nodes/NiboEmpresas/resources/schedule/description.ts
git commit -m "feat: o recebivel nasce com o boleto programado"
```

---

### Fatia 5 — A nota fiscal

**Arquivos:**
- Modificar: `nodes/NiboEmpresas/resources/schedule/automation.ts`
- Modificar: `nodes/NiboEmpresas/__tests__/scheduleAutomation.test.ts`

**Interfaces:** parâmetros `issueInvoice`, `invoiceDaysBefore`, `invoiceServiceProfileId`,
`invoiceFields` (coleção com `additionalServiceDescription`, `additionalRemarks`,
`cityWhereServiceWasProvided`, `stateWhereServiceWasProvided`).

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('automation — a nota', () => {
	it('não põe chave nenhuma quando ninguém pediu nota', () => {
		expect(payload({ issueInvoice: 'no' })).toEqual({});
	});

	it('manda cada gatilho com o número que a API usa', () => {
		const numero = (escolha: string) =>
			payload({ issueInvoice: escolha, invoiceServiceProfileId: 'perfil-nfse', invoiceDaysBefore: 3 })
				.autoGenerateNFSeType;

		expect(numero('before')).toBe(2);
		expect(numero('settled')).toBe(3);
		expect(numero('boleto')).toBe(4);
		expect(numero('now')).toBe(5);
	});

	it('manda os dias só no gatilho que os usa', () => {
		expect(
			payload({ issueInvoice: 'before', invoiceDaysBefore: 3, invoiceServiceProfileId: 'perfil-nfse' }),
		).toEqual({ autoGenerateNFSeType: 2, daysBeforeDueDateToGenerateNFSe: 3, serviceProfileId: 'perfil-nfse' });

		expect(payload({ issueInvoice: 'settled', invoiceServiceProfileId: 'perfil-nfse' })).toEqual({
			autoGenerateNFSeType: 3,
			serviceProfileId: 'perfil-nfse',
		});
	});

	it('leva os campos opcionais só quando estão preenchidos', () => {
		expect(
			payload({
				issueInvoice: 'now',
				invoiceServiceProfileId: 'perfil-nfse',
				invoiceFields: { additionalServiceDescription: 'Assinatura mensal', cityWhereServiceWasProvided: '' },
			}),
		).toEqual({
			autoGenerateNFSeType: 5,
			serviceProfileId: 'perfil-nfse',
			additionalServiceDescription: 'Assinatura mensal',
		});
	});

	it('recusa nota sem perfil de serviço', () => {
		expect(() => payload({ issueInvoice: 'now', invoiceServiceProfileId: '' })).toThrow(NodeOperationError);
	});

	it('boleto e nota convivem no mesmo corpo', () => {
		const corpo = payload({
			generateBoleto: 'now',
			boletoCollectionProfileId: 'perfil-1',
			boletoDeliveryType: 'default',
			issueInvoice: 'boleto',
			invoiceServiceProfileId: 'perfil-nfse',
		});

		expect(corpo.collection).toMatchObject({ AutoGenerateCollectionType: 3 });
		expect(corpo.autoGenerateNFSeType).toBe(4);
	});
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx jest scheduleAutomation -t 'a nota'`
Esperado: **FALHA** — `autoGenerateNFSeType` não sai no corpo.

- [ ] **Passo 3: escrever o mínimo que passa**

Em `automation.ts`:

```ts
/** O que a API chama de `autoGenerateNFSeType` */
const AUTO_NFSE: Record<string, number> = { before: 2, settled: 3, boleto: 4, now: 5 };

/** Os opcionais da nota, que viajam com o nome que a operação Issue já usa */
const INVOICE_EXTRAS = [
	'additionalServiceDescription',
	'additionalRemarks',
	'cityWhereServiceWasProvided',
	'stateWhereServiceWasProvided',
];
```

e, ao fim de `automationPayload`, antes do `return`:

```ts
	const invoice = String(collected.issueInvoice ?? 'no');
	if (invoice !== 'no') {
		const profile = String(collected.invoiceServiceProfileId ?? '').trim();
		if (profile === '') {
			throw new NodeOperationError(this.getNode(), 'This invoice names no service profile', {
				itemIndex,
				description:
					'Pick a Service Profile. It decides which service the note declares, how much tax it charges and the remarks printed on it, and the API refuses without one. An empty list there means the organization does not issue NFS-e — that needs a digital certificate and a profile approved by the city hall.',
			});
		}

		payload.autoGenerateNFSeType = AUTO_NFSE[invoice];
		payload.serviceProfileId = profile;

		if (invoice === 'before') {
			const days = Number(collected.invoiceDaysBefore ?? 0);
			if (!Number.isFinite(days) || days < 1) {
				throw new NodeOperationError(this.getNode(), 'This invoice is due before a number of days it does not give', {
					itemIndex,
					description: 'Days Before Due Date needs a number of 1 or more. For a note issued at once, choose Immediately instead.',
				});
			}
			payload.daysBeforeDueDateToGenerateNFSe = days;
		}

		const extras = (collected.invoiceFields ?? {}) as IDataObject;
		for (const key of INVOICE_EXTRAS) {
			const value = String(extras[key] ?? '').trim();
			if (value !== '') {
				payload[key] = value;
			}
		}
	}
```

E a tela, com `onInvoice = { ...onCreate, issueInvoice: ['before', 'boleto', 'now', 'settled'] }`:

```ts
		{
			displayName: 'Issue Invoice (NFS-e)',
			name: 'issueInvoice',
			type: 'options',
			options: [
				{ name: 'A Number of Days Before the Due Date', value: 'before' },
				{ name: "Don't Issue", value: 'no', description: 'No note, which is what every schedule written before this field existed does' },
				{ name: 'Immediately', value: 'now', description: 'The note is issued as the schedule is created. This reaches a city hall, and there is no undo.' },
				{
					name: 'When the Boleto Is Generated',
					value: 'boleto',
					description: 'Waits for a charge on this schedule — one asked for above, or one made by hand in Nibo later',
				},
				{ name: 'When the Receipt Is Settled', value: 'settled', description: 'Waits for the money to be marked as received' },
			],
			default: 'no',
			description:
				'Whether this receivable is born with a service invoice programmed. ⚠️ Issuing reaches a city hall and there is no undo: a note can only be cancelled afterwards, which leaves it in the company\'s fiscal history for good and keeps its public PDF and XML answering. The amount and the taker come from this schedule.',
			displayOptions: { show: onCreate },
		},
		{
			displayName: 'Days Before Due Date',
			name: 'invoiceDaysBefore',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 3,
			description: 'How many days before the due date Nibo issues the note',
			displayOptions: { show: { ...onCreate, issueInvoice: ['before'] } },
		},
		{
			displayName: 'Service Profile Name or ID',
			name: 'invoiceServiceProfileId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'loadServiceProfiles', loadOptionsDependsOn: ['authMode'] },
			default: '',
			description:
				'Which profile the note is declared under. It decides the service, the tax and the remarks printed on it. ⚠️ A wrong profile is not fixed afterwards: undoing it is a cancellation at the city hall. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: { show: onInvoice },
		},
		{
			displayName: 'Invoice Fields',
			name: 'invoiceFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			description: 'What the note carries beyond the profile. A field left out is not sent, and the profile resolves it on its own.',
			displayOptions: { show: onInvoice },
			options: [
				{
					displayName: 'Additional Remarks',
					name: 'additionalRemarks',
					type: 'string',
					default: '',
					description: 'Supplementary information printed on the note',
				},
				{
					displayName: 'City Where Service Was Provided',
					name: 'cityWhereServiceWasProvided',
					type: 'string',
					default: '',
					placeholder: 'Rio de Janeiro',
					description: 'Where the service was provided, when it was not where the company is',
				},
				{
					displayName: 'Service Description',
					name: 'additionalServiceDescription',
					type: 'string',
					default: '',
					description: 'The text that fills the {{Descricao}} template the profile carries',
				},
				{
					displayName: 'State Where Service Was Provided',
					name: 'stateWhereServiceWasProvided',
					type: 'string',
					default: '',
					placeholder: 'RJ',
					description: 'The state of the city above, as the two-letter abbreviation',
				},
			],
		},
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx jest scheduleAutomation && npm run lint && npm test`
Esperado: tudo verde.

- [ ] **Passo 5: commit**

```bash
git add nodes/NiboEmpresas/resources/schedule/automation.ts nodes/NiboEmpresas/__tests__/scheduleAutomation.test.ts
git commit -m "feat: o recebivel nasce com a NFS-e programada"
```

---

### Fatia 6 — Juntar no handler, ler as irmãs, avisar da recorrência

**Arquivos:**
- Modificar: `nodes/NiboEmpresas/resources/schedule/execute.ts`
- Modificar: `nodes/NiboEmpresas/__tests__/schedule.test.ts`

**Interfaces:**
- Consome: `automationPayload`, `repeatPayload`.
- Produz: o item de saída com `installment` (quando há parcelas) ou `_niboRecurrenceNotListed`
  (quando há recorrência).

- [ ] **Passo 1: escrever o teste que falha**

```ts
describe('create — os blocos novos', () => {
	it('não muda o corpo de uma criação que não tocou em nada', async () => {
		await executeSchedule.call(context({ ...CREATE_FORM }), 'creditSchedule', 'create');
		const body = create.mock.calls[0][3] as IDataObject;

		expect(body.collection).toBeUndefined();
		expect(body.recurrence).toBeUndefined();
		expect(body.instalment).toBeUndefined();
		expect(body.autoGenerateNFSeType).toBeUndefined();
	});

	it('lê as parcelas irmãs e as devolve dentro do item', async () => {
		create.mockResolvedValue({ scheduleId: 'pai', installmentId: 'grupo-1' });
		apiRequest.mockImplementation(async (_i, _method, endpoint) =>
			String(endpoint).endsWith('/schedules')
				? [{ scheduleId: 'pai', installmentNumber: 1, value: 100, dueDate: '2027-03-10T00:00:00Z' }]
				: { installmentId: 'grupo-1', totalOfInstallments: 3, totalValue: 300, divideTotalValue: true },
		);

		const out = await executeSchedule.call(
			context({ ...CREATE_FORM, repeat: 'installments', installmentsAre: 'generated', installmentCount: 3 }),
			'creditSchedule',
			'create',
		);

		expect((out[0].json.installment as IDataObject).totalOfInstallments).toBe(3);
		expect(((out[0].json.installment as IDataObject).schedules as IDataObject[])).toHaveLength(1);
	});

	it('a leitura das irmãs falhando não reprova a criação', async () => {
		create.mockResolvedValue({ scheduleId: 'pai', installmentId: 'grupo-1' });
		apiRequest.mockRejectedValue(new Error('500'));

		const out = await executeSchedule.call(
			context({ ...CREATE_FORM, repeat: 'installments', installmentsAre: 'generated', installmentCount: 2 }),
			'creditSchedule',
			'create',
		);

		expect(out[0].json.scheduleId).toBe('pai');
		expect(out[0].json.installment).toBeUndefined();
	});

	it('avisa que as ocorrências da recorrência não são listáveis', async () => {
		create.mockResolvedValue({ scheduleId: 'pai', hasRecurrence: true });

		const out = await executeSchedule.call(
			context({ ...CREATE_FORM, repeat: 'recurrence', recurrenceEnds: 'occurrences', recurrenceOccurrences: 3 }),
			'creditSchedule',
			'create',
		);

		expect(String(out[0].json._niboRecurrenceNotListed)).toContain('no route');
	});
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx jest schedule.test -t 'os blocos novos'`
Esperado: **FALHA** — nem `installment` nem `_niboRecurrenceNotListed` existem.

- [ ] **Passo 3: escrever o mínimo que passa**

Em `execute.ts`, no ramo `create`, o corpo passa a ser montado assim:

```ts
					const collected: IDataObject = {
						stakeholderId: this.getNodeParameter('stakeholderId', i, ''),
						dueDate: this.getNodeParameter('dueDate', i) as string,
						scheduleDate: this.getNodeParameter('scheduleDate', i) as string,
						accrualDate: this.getNodeParameter('accrualDate', i, '') as string,
						categories: this.getNodeParameter('categories', i, {}) as IDataObject,
						description: this.getNodeParameter('description', i, '') as string,
						isFlagged: this.getNodeParameter('isFlagged', i, false) as boolean,
						apportionBy: this.getNodeParameter('apportionBy', i, 'percent') as string,
						costCenters: this.getNodeParameter('costCenters', i, {}) as IDataObject,
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					};

					const body = writePayload.call(this, i, collected);

					// Os blocos da 0.15.0. Lidos sempre, e mudos quando o gatilho está em
					// "não" — um agendamento criado sem tocá-los sai igual ao da 0.14.2.
					const repeat = repeatPayload.call(
						this,
						i,
						{
							dueDate: collected.dueDate,
							repeat: this.getNodeParameter('repeat', i, 'no'),
							recurrenceInterval: this.getNodeParameter('recurrenceInterval', i, 1),
							recurrenceIntervalType: this.getNodeParameter('recurrenceIntervalType', i, 'month'),
							recurrenceEnds: this.getNodeParameter('recurrenceEnds', i, 'occurrences'),
							recurrenceOccurrences: this.getNodeParameter('recurrenceOccurrences', i, 0),
							recurrenceEndDate: this.getNodeParameter('recurrenceEndDate', i, ''),
							installmentsAre: this.getNodeParameter('installmentsAre', i, 'generated'),
							installmentCount: this.getNodeParameter('installmentCount', i, 0),
							installmentInterval: this.getNodeParameter('installmentInterval', i, 1),
							installmentIntervalType: this.getNodeParameter('installmentIntervalType', i, 'month'),
							installmentAmount: this.getNodeParameter('installmentAmount', i, 'split'),
							installments: this.getNodeParameter('installments', i, {}),
						},
						totalOfCategories(body.categories),
					);

					const automation =
						resource === 'creditSchedule'
							? automationPayload.call(this, i, {
									generateBoleto: this.getNodeParameter('generateBoleto', i, 'no'),
									boletoDaysBefore: this.getNodeParameter('boletoDaysBefore', i, 0),
									boletoCollectionProfileId: this.getNodeParameter('boletoCollectionProfileId', i, ''),
									boletoDeliveryType: this.getNodeParameter('boletoDeliveryType', i, 'default'),
									issueInvoice: this.getNodeParameter('issueInvoice', i, 'no'),
									invoiceDaysBefore: this.getNodeParameter('invoiceDaysBefore', i, 0),
									invoiceServiceProfileId: this.getNodeParameter('invoiceServiceProfileId', i, ''),
									invoiceFields: this.getNodeParameter('invoiceFields', i, {}),
								})
							: {};

					const created = await niboCreate.call(
						this,
						i,
						endpoint,
						{ ...body, ...automation, ...repeat },
						{ readEndpoint: READ_BY_ID },
					);

					returnData.push({
						json: await withTheSiblings.call(this, i, normalizeSchedule(created)),
						pairedItem: { item: i },
					});
```

e, no fim do arquivo:

```ts
/** O valor de um agendamento é a soma das suas linhas: esta API não guarda total */
function totalOfCategories(lines: unknown): number {
	return Array.isArray(lines)
		? lines.reduce((sum, line) => sum + Math.abs(Number((line as IDataObject)?.value ?? 0)), 0)
		: 0;
}

/**
 * O que a criação devolve, mais o que só existe depois dela.
 *
 * **As parcelas irmãs são lidas; as ocorrências de uma recorrência não.** Medido em
 * 2026-08-01: `/installments/{id}` e `/installments/{id}/schedules` existem e
 * `/recurrences` é 404 em toda forma. Então uma é lista e a outra é frase.
 *
 * A leitura é **enriquecimento, não confirmação** — se falhar, a criação continua
 * tendo dado certo e o item sai sem a lista. Reprovar aqui mandaria o fluxo tentar
 * de novo, e tentar de novo abre outro parcelamento.
 */
async function withTheSiblings(
	this: IExecuteFunctions,
	itemIndex: number,
	record: IDataObject,
): Promise<IDataObject> {
	if (record.hasRecurrence === true) {
		return {
			...record,
			_niboRecurrenceNotListed:
				'Nibo created the occurrences of this recurrence — it provisions them up to 36 months ahead — and this API has no route that lists them: /recurrences answers 404 in every form. Read them with Schedule - Get Many, filtering by description or by due date.',
		};
	}

	const group = String(record.installmentId ?? '').trim();
	if (group === '') {
		return record;
	}

	try {
		const summary = (await niboApiRequest.call(
			this,
			itemIndex,
			'GET',
			`/installments/${encodeURIComponent(group)}`,
		)) as IDataObject;

		const answer = await niboApiRequest.call(
			this,
			itemIndex,
			'GET',
			`/installments/${encodeURIComponent(group)}/schedules`,
		);
		const schedules = Array.isArray(answer) ? answer : ((answer as IDataObject)?.items ?? []);

		return { ...record, installment: { ...summary, schedules } };
	} catch {
		// A criação deu certo. Uma leitura que falhou não pode transformá-la em erro.
		return record;
	}
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx jest schedule.test && npm run lint && npm test`
Esperado: verde, e **os testes antigos de `create` continuam passando sem alteração** — é o que
prova a compatibilidade.

- [ ] **Passo 5: compilar e commitar**

```bash
npm run build
git add nodes/NiboEmpresas/resources/schedule/execute.ts nodes/NiboEmpresas/__tests__/schedule.test.ts
git commit -m "feat: a criacao junta os blocos, le as parcelas irmas e avisa da recorrencia"
```

---

### Fatia 7 — README, catálogo e o bump

**Arquivos:**
- Modificar: `README.md`, `package.json`

- [ ] **Passo 1: README — a seção Schedules**

Acrescentar depois de *Apportionment across cost centers*, com este texto:

````markdown
#### Creating with a boleto, a note or a repetition

A schedule does not have to be a bare line. **Create** takes three more questions, each of them
answered *no* until you say otherwise — a workflow that ignores them writes exactly the schedule
it wrote before.

| Question | Answers | Where |
|---|---|---|
| **Generate Boleto** | *Don't generate* · *Immediately* · *A number of days before the due date* | Credit only |
| **Issue Invoice (NFS-e)** | *Don't issue* · *Immediately* · *A number of days before the due date* · *When the receipt is settled* · *When the boleto is generated* | Credit only |
| **Repeat** | *Don't repeat* · *Recurrence* · *Installments* | Both |

Boleto and note exist on the receivable only, because that is where the API puts them: a payable
has neither.

> 🔴 **Immediately means immediately.** The charge is issued and the note is sent to the city
> hall as the schedule is created. A note cannot be undone — only cancelled, which leaves it in
> the company's fiscal history for good and keeps its public PDF and XML answering. See
> [Collections](#collections) and [Service invoices](#service-invoices) for what each one is.

**Repeat is one question with three answers, not two checkboxes.** The API refuses a request
carrying a recurrence *and* an installment plan, and neither can be turned into the other
afterwards, so the screen makes the pair unreachable instead of reporting it later.

**A recurrence is written and then it is gone.** Nibo provisions the occurrences up to 36 months
ahead, and this API has no route that reads, lists or ends one — `/recurrences` answers 404 in
every form. The item that comes out of Create says so in `_niboRecurrenceNotListed`; to see the
occurrences, read them with **Get Many**, filtering by description or by due date. Ending a
recurrence is done in Nibo.

**An installment plan is readable, and comes back with the item.** Say how many parcels and how
far apart and the node writes them out — the first one falling on the **Due Date** already on
the screen, the total being the sum of the lines under **Categories**, and the leftover cents
going on the first parcels so the sum closes. On months the day is kept and clamped to the end
of a short month: a plan starting on the 31st falls on the 28th in February and back on the 31st
in March. For a plan that is not regular — a bigger first parcel, a broken due date — switch
**Installments Are** to *Listed one by one*. Either way the created item carries `installment`,
with the plan and every sibling parcel in it.
````

- [ ] **Passo 2: README — Version history**

Uma linha `0.15.0`, no formato das anteriores, dizendo o que entrou e o que ficou de fora.

- [ ] **Passo 3: bump**

```bash
npm version 0.15.0 --no-git-tag-version
```

- [ ] **Passo 4: gate completo**

```bash
npm run lint && npm run lint:community && npm test && npm run build
```
Esperado: verde nos quatro. O `lint:community` é o scanner oficial — se ele sair zero **sem
analisar nada**, conferir o `.npmrc` do repo antes de comemorar.

- [ ] **Passo 5: commit**

```bash
git add README.md package.json package-lock.json
git commit -m "docs: README e o bump para 0.15.0"
```

---

## 6. Regras invioláveis — onde cada uma continua atendida

| Regra | Onde |
|---|---|
| Zero dependência de runtime | Nenhum `import` novo fora de `n8n-workflow`. A aritmética de datas é `Date.UTC`, do próprio JS |
| Escrita só na cobaia | Fatias 0 e 8. A fatia 9 é exceção declarada, com protocolo escrito antes |
| Token nunca no repo | A sonda lê `process.env`; o plano não cita valor nenhum |
| Campo publicado não some | Nada é removido. Os três gatilhos nascem em "não" |
| `displayOptions` só em campo simples | Testado explicitamente na fatia 1, passo 1 |
| Nome de parâmetro é contrato | `boletoCollectionProfileId` e `invoiceServiceProfileId` levam prefixo justamente por isso |
| UI em inglês | Todos os rótulos e descrições deste plano |
| Nada de produção no repo público | Este arquivo diz "uma organização de produção" e nada mais |

---

## 7. Teste e aceite

### Fatia 8 — Aceite na cobaia

Dirigindo os handlers de `dist/`, **nunca com `curl`** — foi assim que a 0.9.0 achou o defeito
que 830 testes verdes não acharam, e a 0.12.0 achou que `attach` move em vez de adicionar.

- [ ] Recorrência mensal, 3 ocorrências, no crédito → conferir quantos agendamentos nasceram
- [ ] Recorrência semanal por data, no débito
- [ ] Parcelamento calculado, 3× dividindo o total → conferir os valores e as datas no Nibo
- [ ] Parcelamento calculado começando em 31/01 → conferir 28/02 e a volta ao 31/03
- [ ] Parcelamento digitado, 2 linhas desiguais
- [ ] O item de saída traz `installment` com as irmãs
- [ ] O item de saída da recorrência traz `_niboRecurrenceNotListed`
- [ ] Boleto pedido na cobaia → a recusa é a frase do node sobre organização sem perfil
- [ ] Nota pedida na cobaia → idem
- [ ] Todas as recusas da seção 7 da spec, uma a uma
- [ ] **Cobaia zerada ao fim**, conferida alguns segundos depois do último DELETE

### Fatia 9 — Aceite em produção — exceção declarada

**Não rodar sem OK explícito do Alvaro na hora, com o contato e o valor combinados.**

Protocolo, escrito antes de qualquer requisição:

- [ ] Valor **R$ 1,00**, contato combinado, descrição `aceite 0.15.0 — apagar`
- [ ] **2.7** — agendamento com boleto "5 dias antes" e vencimento a 6 meses → ler o registro e
      conferir `autoGenerateCollectionType` → **apagar o agendamento** → conferir que nenhuma
      cobrança nasceu (`GET /public/collections` filtrando por `scheduleId`)
- [ ] **2.7** — o mesmo para a nota "quando a baixa for realizada" → nunca dar baixa → apagar
- [ ] **2.6** — num desses, antes de apagar, rodar um **Update** de descrição e reler
      `autoGenerateNFSeType` e `autoGenerateCollectionType`. Se mudaram, **parar e abrir fatia
      para o `writeBody`**
- [ ] Boleto **imediato** → conferir o registro e a URL → **cancelar** com Collection - Cancel →
      conferir status `-1`
- [ ] Nota **imediata** → esperar a autorização → conferir número e PDF → **cancelar** →
      conferir que passa por `-2`/`-3` e chega em `-4`
- [ ] Apagar os agendamentos de teste
- [ ] Escrever o resultado numa seção 8 deste arquivo, com o que foi gasto e o que ficou

> **O custo, aceito e escrito:** a NFS-e emitida fica **para sempre** no histórico fiscal da
> organização, marcada Cancelada. Nota fiscal não se apaga, e cancelar não tira o PDF do ar.

---

## 8. O que fica em aberto

- **Encerrar ou alterar uma recorrência pela API.** Não há rota. Quem precisa, faz no Nibo.
- **Ler as ocorrências de uma recorrência.** Mesma razão — vira o aviso da fatia 6.
- **Um recurso `Installment` próprio**, com Get e Get Many das parcelas. As duas rotas ficam
  medidas aqui; virar recurso é decisão da 0.16.0, se fizer falta.
- **Se um agendamento com automação aceita `PUT`** — a 2.6 responde na fatia 9, e a resposta pode
  abrir uma fatia nova nesta mesma versão.
- **O que acontece quando o gatilho da nota é "quando o boleto for criado" e nunca há boleto.**
  Provavelmente nada, e "provavelmente" não é medição: fica dito na tela e não no código.
