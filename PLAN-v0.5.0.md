# PLANO DE IMPLEMENTAÇÃO — v0.5.0

> **Não é spec.** A spec é o `DESIGN.md` (repo de planejamento) — aqui vale principalmente
> **§5, o comportamento transversal de consulta**. Convenção igual à dos planos anteriores.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da empresa cobaia.

**Escopo da v0.5.0:** **filtro assistido**. Quem monta o workflow escolhe campo, operador e
valor em três caixas, e o node monta a expressão OData. O campo OData cru continua existindo,
intacto, como saída para quem precisa de mais.

**Prova o quê:** que o node **constrói consulta**, não só a repassa. Hoje a expressão vai crua
para a API: um nome com apóstrofo (`D'ALESSANDRO`) produz expressão inválida, a API responde
500, e ninguém descobre que o problema era uma aspa. Isso é defeito, não falta de conforto.

**Por que agora e não depois de Schedules** (decidido com o Alvaro em 2026-07-25): o construtor
é peça do **núcleo**, e hoje ele tem um consumidor só — os quatro stakeholders dividem um único
arquivo de descrição. Schedules, Payments e NFS-e nascem usando o que existir quando forem
escritos. Construir agora custa um lugar; construir depois custa N.

**Fora de escopo:** grupos aninhados (`(A ou B) e C`), filtro em recursos que ainda não existem,
escolha de `$orderby`, filtros salvos/reutilizáveis, e qualquer mudança no campo `filter` já
publicado.

---

## 1. Medições de 2026-07-25 — o que a API aceita em `$filter`

Feitas **só com `GET`** (`$top=1`), contra a cobaia. Nenhuma escrita, em lugar nenhum.

| Expressão | Resposta |
|---|---|
| `contains(name,'A')` · `startswith` · `endswith` | ✅ 200 |
| `name eq '…'` · `name ne '…'` | ✅ 200 |
| `contains(document/number,'096')` · `document/number eq '…'` | ✅ 200 |
| `contains(email,'…')` · `contains(phone,'…')` · `contains(communication/email,'…')` | ✅ 200 |
| `contains(companyInformation/companyName,'…')` · `contains(address/city,'…')` · `address/state eq 'RJ'` | ✅ 200 |
| `isDeleted eq false` · `isArchived eq false` · `isCompany eq true` | ✅ 200 |
| `updateDate gt 2020-01-01` · `updateDate gt 2020-01-01T00:00:00Z` | ✅ 200 |
| `contains(tolower(name),'alvaro')` | ✅ 200 |
| `A and B` · `A or B` · `not A` | ✅ 200 |
| `id eq <guid sem aspas>` | ✅ 200 |
| **`document/type eq 'Cpf'`** | ❌ 500 `internal_server_error` |
| **`personType eq 1`** · **`type eq 'Customer'`** | ❌ 500 — enum não compara |
| **`id eq '<guid entre aspas>'`** | ❌ 500 `validation_error` — GUID é literal, sem aspas |
| **`updateDate gt datetime'2020-01-01'`** | ❌ 500 — a sintaxe OData v2 não vale aqui |
| **`contains(name,'D'ALESSANDRO')`** | ❌ 500 `validation_error`: *unterminated literal* |
| `contains(name,'D''ALESSANDRO')` | ✅ 200 — **apóstrofo se escapa dobrando** |

Valem igual nas quatro coleções de stakeholder (conferido em `/suppliers`, `/employees` e
`/partners` com três expressões cada).

**Três consequências diretas para o desenho:**

1. **O tipo de documento não é filtrável.** Nada de oferecer "Document Type" no cardápio —
   seria um 500 garantido. Quem precisa filtra por `document/number`.
2. **Cada tipo de dado tem seu literal:** texto entre aspas simples (com `''` para escapar),
   booleano e data **sem aspas**, GUID **sem aspas**. Um construtor que trate tudo como texto
   erra em três dos quatro casos.
3. **`tolower()` funciona**, então "contém, ignorando maiúsculas" é oferecível de graça — e é
   o que quase todo mundo quer de verdade ao procurar por nome.

---

## 2. Decisões de recorte — **propostas, aguardando OK do Alvaro**

1. **O construtor é o padrão; o OData cru continua existindo.** Um seletor **Filter Type**
   escolhe entre *Conditions* (padrão) e *OData Expression*. O campo `filter` **não muda de
   nome nem de comportamento** — é escape hatch permanente, sem depreciação, para `and`/`or`
   aninhado e tudo que o cardápio não cobre. Consequência: **zero breaking change**.
2. **Node já salvo continua filtrando.** Um node gravado antes desta versão tem `filter`
   preenchido e nenhum `filterType`. Se o tipo for *Conditions* e **não houver condição
   nenhuma**, o node usa o `filter` que estiver lá. Mesma regra que já vale para o intervalo
   (0.4.2) e para a varredura estrita (0.4.3).
3. **Condições combinam por um operador só — E ou OU — escolhido uma vez.** Grupo aninhado
   fica fora: quem precisa disso usa o OData cru. É a diferença entre um formulário que se
   explica sozinho e um construtor de consulta pela metade.
4. **O cardápio de campos é fechado e medido.** Só entra campo que respondeu 200 na seção 1.
   Nada de digitar nome de campo à mão: seria trocar um jeito de tomar 500 por outro.
5. **O operador depende do tipo do campo.** Texto oferece *contém / contém (ignorando
   maiúsculas) / é igual / é diferente / começa com / termina com*; sim-ou-não oferece *é /
   não é*; data oferece *depois de / em ou depois de / antes de / em ou antes de*.
6. **A montagem da expressão é função pura**, testável sem rede e sem contexto de node — como
   a `deepMerge` da 0.4.0. É ela que escapa o apóstrofo e escolhe o literal certo por tipo.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.5.0 |
|---|---|
| `transport/odata.ts` **(novo)** | `buildODataFilter(conditions, combine)`: escape de literal, operador por tipo, junção por `and`/`or`. Puro |
| `transport/paginate.ts` | **Nada** — continua recebendo uma string `$filter` pronta |
| `transport/request.ts` · `save.ts` · `merge.ts` | **Nada** |
| `resources/stakeholder/description.ts` | `filterType`, `filters` (condições) e `filterCombine`; o `filter` existente passa a aparecer só no modo OData |
| `resources/stakeholder/execute.ts` | Decide qual dos dois vira `$filter` (e a retaguarda da decisão 2) |
| `NiboEmpresas.node.ts` | **Nada** |

O cardápio de campos mora na descrição (é UI), e o construtor não sabe nada sobre Nibo: recebe
campo, operador, valor e tipo, e devolve texto. É o que permite Schedules herdá-lo sem tocar
numa linha dele.

---

## 4. Campos na UI (nome de parâmetro é contrato — CLAUDE decisão 9)

Aparecem só em **Get Many**, nos quatro recursos.

| Parâmetro | Tipo | O que é |
|---|---|---|
| `filterType` | options | `conditions` (padrão) · `odata` |
| `filters` | fixedCollection, múltiplo | Cada item: `field` · `operator` · `value` |
| `filterCombine` | options | `and` (padrão) · `or` — só no modo `conditions` |
| `filter` | string | **Inalterado.** Passa a aparecer só quando `filterType` = `odata` |

**Cardápio de campos** (nome na UI → caminho na API → tipo):

| Na UI | Caminho | Tipo |
|---|---|---|
| Name | `name` | texto |
| Document Number | `document/number` | texto |
| Email | `email` | texto |
| Phone | `phone` | texto |
| Trading Name | `companyInformation/companyName` | texto |
| City | `address/city` | texto |
| State | `address/state` | texto |
| Is Company | `isCompany` | sim-ou-não |
| Is Archived | `isArchived` | sim-ou-não |
| Updated At | `updateDate` | data |

Armadilhas de linter já conhecidas: opções em **ordem alfabética**, `default` precisa ser
**literal** (a 0.4.4 tropeçou num ternário), descrição de booleano começa com "Whether", e
descrição de campo **não pode** citar `{{ $json… }}`.

---

## 5. Fatias, com teste antes do código

**Fatia 1 — `transport/odata.ts`** *(commit próprio)*

Testes primeiro, em `__tests__/odata.test.ts`:

| Caso | Espera |
|---|---|
| `contains` em texto | `contains(name,'ACME')` |
| `contains ignorando caixa` | `contains(tolower(name),'acme')` — valor em minúsculas |
| `eq`, `ne`, `startswith`, `endswith` | forma correspondente |
| **apóstrofo no valor** | `contains(name,'D''ALESSANDRO')` |
| booleano | `isCompany eq true` — **sem aspas** |
| data | `updateDate ge 2026-07-01` — **sem aspas** |
| duas condições com E | `A and B` |
| duas condições com OU | `A or B` |
| condição sem campo, ou lista vazia | devolve `''` |

**Fatia 2 — descrição** *(commit próprio)*: os quatro parâmetros da seção 4, com o cardápio
e os operadores por tipo. Testes em `description.test.ts`: o `filter` continua existindo e
só aparece no modo `odata`; `filterType` nasce em `conditions`; o cardápio não oferece
document type; cada grupo de operador aparece para o tipo certo.

**Fatia 3 — `execute.ts`** *(commit próprio)*: decide o `$filter`. Testes em
`execute.test.ts`: modo `conditions` manda a expressão construída; modo `odata` manda o texto
cru; **node salvo antes, sem `filterType` e com `filter` preenchido, continua filtrando**;
modo `conditions` sem condição nenhuma e sem `filter` manda `''`.

**Fatia 4 — README + bump 0.5.0** *(commit próprio)*: seção *Filtering* explicando os dois
modos, com o apóstrofo como exemplo do que o construtor resolve, e a nota de que o campo
OData segue disponível.

---

## 6. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.5.0 |
|---|---|
| 3 — escrita só na cobaia | **Esta versão não escreve nada.** Medição e aceite são `GET` |
| 4 — nenhum token em código ou commit | Nada novo toca token |
| 5 — zero dep de runtime | O construtor é código próprio; `dependencies` segue `{}` |
| Decisão 9 — inglês | Campos, operadores, descrições e README |
| 7 — instalação real | A 0.5.0 fecha com a tabela da seção 7 |

---

## 7. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` — todos verdes.

**Teste de instalação real (regra 7)**, com a 0.5.0 instalada pela tela Community Nodes,
**contra a cobaia, só com leitura**:

| ☐ | Uma condição *Name contém* devolve o mesmo que a expressão OData equivalente |
| ☐ | **A prova do apóstrofo:** procurar por um nome com `'` funciona pelo construtor e falha, como hoje, se digitado cru no modo OData |
| ☐ | Duas condições com **E** filtram de verdade; trocar para **OU** muda o resultado |
| ☐ | *Is Company* (sim-ou-não) e *Updated At* (data) funcionam — os dois literais sem aspas |
| ☐ | O modo **OData Expression** continua aceitando o que já aceitava |
| ☐ | **Regressão:** node salvo na 0.4.4, com `filter` preenchido, filtra igual depois de atualizar |
| ☐ | Funciona nos quatro recursos, não só em Customer |
| ☐ | CI verde; scanner oficial sem achados |

---

## 8. Sequência

Fatias pequenas, teste antes do código, commit por fatia, push e tag **só com o OK do
Alvaro**:

1. `transport/odata.ts` (função pura) + testes
2. Descrição: `filterType`, `filters`, `filterCombine`, e o `filter` condicionado
3. `execute.ts`: escolha do `$filter` + retaguarda do node já salvo
4. README + bump 0.5.0
5. Publicar → aceite real na cobaia → fechar a tabela da seção 7
