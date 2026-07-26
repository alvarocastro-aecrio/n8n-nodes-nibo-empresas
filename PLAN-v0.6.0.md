# PLANO DE IMPLEMENTAÇÃO — v0.6.0

> **Não é spec.** A spec é o `DESIGN.md` e o `CONTRATO-API.md` (repo de planejamento) —
> daqui valem principalmente a Parte 1 (anatomia da API) e o anexo A.2 (ordem de
> construção). Convenção igual à dos planos anteriores.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da empresa cobaia.

**Escopo da v0.6.0:** **agendamentos** — contas a receber e contas a pagar. Dois recursos
novos, **Credit Schedule** e **Debit Schedule**, com as mesmas cinco operações dos
stakeholders: Get Many, Get, Create, Update, Delete.

**Prova o quê:** que o núcleo construído até a 0.5.x **paga a segunda família de graça**.
Paginação, ciclo seguro de Update, filtro assistido, erros legíveis — tudo já existe; esta
versão os aponta para a fatia que mais destrava: os agendamentos respondem por **~40 dos
nodes HTTP Request** dos workflows ativos, a maior fatia que resta (anexo A.2 do contrato).

**Decidido com o Alvaro em 2026-07-26:** dois recursos no menu (não um recurso com campo
de tipo), e **as cinco operações de uma vez** (não leitura primeiro e escrita depois).

**Fora de escopo:** a varredura de auditoria `GET /schedules` (crédito+débito juntos),
anexos e anotações de agendamento (fatia 5 do A.2), baixa de agendamento — payments e
receipts (fatia 4), parcelamento, e qualquer mudança nos recursos já publicados.

---

## 1. Medições — o que a API respondeu

### 1.1 De hoje (2026-07-26), só com `GET` (`$top=1`), contra a cobaia

| Medição | Resposta |
|---|---|
| Envelope de `/schedules/credit`, `/schedules/debit` e `/schedules` | ✅ `{items, count}` nas três |
| `$orderby=scheduleId` com `$skip` | ✅ 200 nas três coleções |
| **`$orderby=id`** | ❌ 500 — `Could not find a property named 'id' on type '…ScheduleFullViewDto'` |
| `$skip` sem `$orderby` | ❌ 500, como nos stakeholders |
| `contains(description,…)` · `contains(reference,…)` · `contains(stakeholder/name,…)` · `tolower()` | ✅ 200 |
| `dueDate` · `scheduleDate` · `accrualDate` · `createDate` · `updateDate` com `ge`/`gt` | ✅ 200 |
| **`value gt 100` · `value gt 100.50`** — número, sem aspas | ✅ 200 |
| `isPaid` · `isDued` · `isFlagged` · `hasInvoice` com `eq` | ✅ 200 |
| `stakeholder/id eq <guid sem aspas>` · `scheduleId eq <guid>` | ✅ 200 |
| **`isDeleted eq false`** | ❌ 500 — o campo não existe aqui |
| **`costCenterValueType eq 0`** | ❌ 500 — enum não compara, como nos stakeholders |

**A chave de paginação mudou de nome.** Nos stakeholders é `id`; aqui é **`scheduleId`**,
e `id` derruba com 500. O `paginate.ts` já recebe a chave por parâmetro desde a 0.2.0 —
esta é a primeira coleção que usa essa porta.

**O filtro ganhou um tipo.** `value` compara como número, sem aspas, com casas decimais.
O construtor da 0.5.0 conhece texto, sim-ou-não e data; ganha `number`.

### 1.2 Do contrato (medições de 2026-07-23/25, na cobaia)

| Fato | Consequência para o node |
|---|---|
| `POST /schedules/credit` responde **string JSON crua** com o GUID criado | O parse defensivo do `niboCreate` já cobre; o read-back devolve o registro inteiro |
| `/FormatType=json` é redundante no POST de schedules e **404 em todo PUT** | Create usa o caminho simples + read-back |
| **`GET /schedules/credit/{id}` é universal**: aceita ID de débito e responde `type: "Debit"`. `GET /schedules/debit/{id}` e `GET /schedules/{id}` são **404** | Toda leitura por ID passa pelo endpoint universal — inclusive o read-back do Create e o ciclo do Update do débito |
| `PUT` bem-sucedido responde `{}` ou 204; malformado responde **`{"Messages":[""]}` com HTTP 200 e nada gravado** | O ciclo seguro (GET → merge → PUT → GET) já trata os dois |
| Obrigatórios do POST: `stakeholderId`, `scheduleDate`, `dueDate`, `categories: [{categoryId, value}]` | O formulário do Create pede exatamente isso |
| **`accrualDate` omitido → a API copia o `dueDate`**, silenciosamente | Campo de primeira classe no Create, nunca escondido em menu (contrato §3.4) |
| **Débito: `value` negativo no GET, positivo no POST** | Ver decisão 5 |
| **`stakeholderId` da raiz vem zerado** (`00000000-…`) no GET; o real está em `stakeholder.id` | Ver decisão 4 |
| O POST de schedules usa **`isFlagged`** (payments usa `isFlag`) | Grafia fixa no payload; ninguém digita |

### 1.3 Medido na cobaia em 2026-07-26 (fatia 5) — a cobaia terminou com zero registros

| ☑ | Resposta |
|---|---|
| `PUT /schedules/debit/{id}` existe? | ✅ **Existe** — HTTP 204, corpo vazio |
| `DELETE /schedules/debit/{id}` existe? | ✅ **Existe** — HTTP 204, corpo vazio. Igual no crédito |
| Formato da resposta do `POST /schedules/debit` | **String JSON crua** com o GUID, HTTP 200 — idêntico ao crédito |
| O `PUT` aceita o registro lido? | ✅ **Inteiro, dos dois lados.** O que o get-by-id universal devolve volta como corpo sem tirar nada: `reference`, datas, `categories` e valor intactos |
| `categories` volta como foi? | ⚠️ **A linha é recriada a cada `PUT`**: mesmo `categoryId` e mesmo `value`, **`id` de linha novo**. Uma confirmação que comparasse `categories` cru falharia sempre |
| Sinal do `value` no débito | ⚠️ **É do endpoint, não do registro** — ver abaixo |
| `accrualDate` omitido | ✅ Copiado do `dueDate`, silenciosamente, como o contrato diz. Preenchido, é respeitado |
| `isFlagged` no `POST` | ✅ Aceito, e volta `true` na leitura |

**O sinal do débito pertence ao endpoint.** O mesmo agendamento, na mesma hora:

| Onde | `value` | `categories[].value` | `openValue` |
|---|---|---|---|
| `GET /schedules/credit/{id}` (get-by-id universal) | **−500** | **−500** | +500 |
| `GET /schedules/debit` (listagem) | **+500** | **+500** | +500 |

E o `$filter` do servidor em `/schedules/debit` compara o **positivo**: `value eq 500` acha, `value eq -500` não acha nada. O `POST` recebe positivo; o `PUT` recebe o negativo que o get-by-id devolveu e grava sem mexer no módulo.

Consequência para a decisão 5: o node não toca em nada — mas **Get e Get Many de um mesmo débito devolvem sinais diferentes**, porque o node lê por ID no endpoint universal. Isso é da API, não do node, e vai escrito no README e na descrição do campo Value.

**O `stakeholderId` zerado é defeito da listagem, não de toda leitura.** O get-by-id devolve o GUID real na raiz; só a listagem devolve `00000000-…`. O normalize conserta onde está quebrado e não encosta onde está certo — que é o que o código já faz, e o teste que separa os dois casos é o que segura isso.

**Dois achados de brinde, que não estavam na tabela:**

- **Agendamento apagado lido por ID responde HTTP 500**, com `error_description: "Agendamento não encontrado"` — um *not found* com cara de erro de servidor. É exatamente a regra "500 de negócio ≠ 500 real" que o `errors.ts` já trata desde a 0.2.0: a mensagem chega legível ao usuário.
- **A listagem é eventualmente consistente.** Logo depois do `DELETE` (204), a coleção ainda respondeu com o registro por alguns segundos; a leitura por ID já dizia que não existia. Quem apaga e relista no mesmo segundo pode ver o que apagou.

---

## 2. Decisões de recorte

1. **Dois recursos, um handler** *(decidido pelo Alvaro)*. `Credit Schedule` e
   `Debit Schedule` entram no menu Resource — em ordem alfabética, entrelaçados com os
   stakeholders — e dividem um handler parametrizado por uma tabela, como os quatro
   stakeholders dividem o deles desde a 0.1.0. Cada um tem seu campo de ID
   (`creditScheduleId`, `debitScheduleId`): nome de parâmetro é contrato.
2. **As cinco operações de uma vez** *(decidido pelo Alvaro)*. A versão só fecha com o
   aceite completo — leitura e escrita — na cobaia.
3. **Get confere o tipo.** A busca por ID é o endpoint universal, que aceita ID de
   qualquer tipo e responde o que aquele ID for. Um ID de débito colado no recurso de
   crédito **falha com mensagem clara** ("this ID belongs to a debit schedule") em vez de
   devolver silenciosamente um registro do outro tipo — que é exatamente a troca que um
   workflow não percebe.
4. **`stakeholderId` da raiz é consertado em toda leitura.** O GET responde a raiz zerada
   e o valor real dentro de `stakeholder.id`; o normalize copia o real para a raiz. É
   defeito puro da API — não há leitura em que o GUID zerado seja a resposta certa.
5. **O sinal do débito não é tocado na leitura.** O valor sai como a API responde
   (negativo no débito, se a medição 1.3 confirmar) — inverter valor financeiro na saída
   criaria um node que soma diferente da API que ele embrulha. Na **escrita** o usuário
   digita positivo, como a própria API exige. O campo Value do filtro do débito ganha a
   descrição que explica o sinal, com o texto decidido pela medição 1.3.
6. **Categorias como o array que a API pede.** O Create exige `categories`; a UI oferece
   uma fixedCollection múltipla — Category ID + Value por linha, pelo menos uma. O valor
   do agendamento é a soma das linhas, regra da API, dita na descrição do campo.
7. **`accrualDate` (competência) é campo de primeira classe no Create**, visível ao lado
   do vencimento, nunca dentro de Additional Fields — contrato §3.4, assimetria 1. Vazio,
   a descrição avisa: a API copia o vencimento, e a receita/despesa cai no mês do
   vencimento.
8. **O cardápio de filtro é fechado e medido**, como na 0.5.0: só entra campo da tabela
   1.1. `type` fica fora (é constante dentro de cada coleção), `isDeleted` e
   `costCenterValueType` ficam fora (500). A UI das condições e a escolha do `$filter`
   saem do arquivo dos stakeholders para um módulo compartilhado, **sem mudança de
   comportamento** — os testes existentes dos stakeholders são a prova da extração.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.6.0 |
|---|---|
| `transport/odata.ts` | O tipo `number`: literal sem aspas, validado numérico. Puro, como o resto |
| `transport/save.ts` | Opção `readEndpoint` em `niboCreate` e `niboSafeUpdate` — o read-back e o ciclo do Update leem no endpoint universal, escrevem no próprio. Default: o endpoint de escrita (zero mudança para stakeholders) |
| `transport/paginate.ts` · `request.ts` · `merge.ts` · `errors.ts` | **Nada** |
| `resources/shared/filter.ts` **(novo)** | A UI das condições (factory por cardápio) e o `listFilter` parametrizado — stakeholder e schedule consomem daqui |
| `resources/schedule/description.ts` **(novo)** | Os dois recursos, operações, formulários e o cardápio de filtro |
| `resources/schedule/execute.ts` **(novo)** | Handler parametrizado credit/debit: tabela de endpoints, endpoint universal de leitura, checagem de tipo no Get |
| `resources/schedule/normalize.ts` **(novo)** | `stakeholderId` da raiz; o payload de escrita (categories, `isFlagged`, competência) |
| `resources/stakeholder/*` | Só a mudança de importar o filtro do módulo compartilhado |
| `NiboEmpresas.node.ts` | Roteia os dois recursos novos; a credencial ganha os dois na lista do `displayOptions` (padrão de UI travado — regra 1 da memória do projeto, com teste guardando) |

---

## 4. Campos na UI (nome de parâmetro é contrato — CLAUDE decisão 9)

| Parâmetro | Onde | O que é |
|---|---|---|
| `creditScheduleId` · `debitScheduleId` | Get, Update, Delete | O ID do agendamento, um por recurso |
| `stakeholderId` | Create (obrigatório) | GUID do contato — normalmente expressão lendo do item |
| `dueDate` | Create (obrigatório) | Vencimento |
| `scheduleDate` | Create (obrigatório) | Data prevista de pagamento/recebimento |
| `accrualDate` | Create (primeira classe, opcional) | Competência — vazio, a API copia o vencimento |
| `categories` | Create (fixedCollection múltipla, obrigatória) | Linhas de Category ID + Value |
| `additionalFields` | Create | Description, Reference |
| `updateFields` | Update | Os mesmos campos, todos opcionais |
| `returnAll` · `limit` · `filters` · `filterCombine` | Get Many | Herdados do padrão 0.5.x |
| `options.filter` | Get Many | O OData cru, herdado — escrever nele esconde as condições (0.5.2) |

**Cardápio do filtro** (alfabético, como o linter exige):

| Na UI | Caminho | Tipo |
|---|---|---|
| Accrual Date | `accrualDate` | data |
| Created At | `createDate` | data |
| Description | `description` | texto |
| Due Date | `dueDate` | data |
| Has Invoice | `hasInvoice` | sim-ou-não |
| Is Flagged | `isFlagged` | sim-ou-não |
| Is Overdue | `isDued` | sim-ou-não |
| Is Paid | `isPaid` | sim-ou-não |
| Reference | `reference` | texto |
| Schedule Date | `scheduleDate` | data |
| Stakeholder Name | `stakeholder/name` | texto |
| Updated At | `updateDate` | data |
| Value | `value` | **número** |

Armadilhas de linter já conhecidas: opções em ordem alfabética, `default` literal,
descrição de booleano começa com "Whether", nada de `{{ $json… }}` em descrição.

---

## 5. Fatias, com teste antes do código

1. **`transport/odata.ts` — o tipo número** *(commit próprio)*. Testes: `value gt 100` sem
   aspas; decimal com ponto; **vírgula decimal vira ponto** (`100,50` → `100.50` — a caixa
   da UI entrega número, mas uma expressão pode entregar o texto que o item trouxe);
   vazio ignorado; texto não-numérico falha em vez de virar expressão inválida.
2. **Extração do filtro para `resources/shared/filter.ts`** *(commit próprio)*. Zero
   mudança de comportamento: os testes 0.5.x dos stakeholders passam intactos — eles são
   o critério da fatia.
3. **`resources/schedule/description.ts`** *(commit próprio)*. Os dois recursos no menu e
   na lista da credencial, formulários da seção 4, cardápio medido. Testes: a credencial
   lista os seis resources; competência é primeira classe; o cardápio não oferece `type`
   nem `isDeleted`; Value é número.
4. **Leitura: `execute.ts` + `normalize.ts` — Get Many e Get** *(commit próprio)*.
   Testes: `$orderby=scheduleId`; endpoint por recurso; Get no endpoint universal; ID do
   outro tipo falha com a mensagem do tipo real; `stakeholderId` da raiz consertado.
5. **Medição de escrita na cobaia** *(sem código; resultado anotado neste arquivo)*: a
   tabela 1.3 inteira. Cria, lê, atualiza e apaga **na cobaia**, que termina com zero
   registros.
6. **`transport/save.ts`: `readEndpoint`** *(commit próprio)*. Testes: read-back e ciclo
   de Update leem no universal e escrevem no próprio; stakeholders seguem como estão.
7. **Escrita: Create, Update, Delete** *(commit próprio)*. Testes com o que a fatia 5
   mediu: payload de categorias, competência, `isFlagged`, sinal do débito na escrita,
   confirmação do Update, Delete devolve `{id, deleted: true}`.
8. **README + bump 0.6.0** *(commit próprio)*: seção Schedules, os dois recursos, a
   competência, o sinal do débito, histórico.

---

## 6. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.6.0 |
|---|---|
| 3 — escrita só na cobaia | As fatias 5 e o aceite escrevem **só na cobaia**, que termina **com zero registros** |
| 4 — nenhum token em código ou commit | Nada novo toca token |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| Decisão 9 — inglês | Campos, operadores, descrições e README |
| 7 — instalação real | A 0.6.0 fecha com a tabela da seção 7 |
| 8 — repo público | Este plano não nomeia cliente, workflow nem credencial |

---

## 7. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` — todos verdes na 0.6.0, com **328 testes**.

**Aceite funcional (2026-07-26)** — o pacote **publicado** `n8n-nodes-nibo-empresas@0.6.0`
baixado do npm e executado contra a cobaia, 35 verificações:

| ☑ | Get Many nos dois recursos, com filtro assistido: *Due Date depois de* + *Is Paid é falso*; *Value maior que* com centavos |
| ☑ | Get devolve o agendamento pelo ID; ID de débito no recurso de crédito **falha dizendo o tipo real** (e o inverso também) |
| ☑ | Create de um recebimento na cobaia devolve o registro completo, com a categoria da linha |
| ☑ | Create de um pagamento digitado **positivo** funciona; `isFlagged` gravado; o GET seguinte mostra o sinal que a medição 1.3 documentou |
| ☑ | Competência deixada vazia → o registro volta com competência igual ao vencimento; competência preenchida é respeitada |
| ☑ | Update de description confirma pela releitura; referência, valor, categoria e datas intactos; update sem campo nenhum é recusado |
| ☑ | Delete dos dois; **a cobaia terminou com zero agendamentos** nas três coleções |
| ☑ | Regressão: Customer filtra ignorando caixa, lê por ID, escreve e confirma; campo fora do cardápio ainda falha em vez de alargar |
| ☑ | CI verde. **Scanner: ver a ressalva abaixo** |

**O sinal do débito, medido ao vivo no aceite:** o mesmo agendamento respondeu `value: -500`
no Get (endpoint universal) e `value: +500` no Get Many (coleção de débito), `openValue`
positivo nos dois. É o que a decisão 5 previu e o que o README agora diz com os números.

**Achado do aceite — a listagem atrasa nos dois sentidos.** A medição da fatia 5 tinha
pego o atraso só no DELETE; o aceite mostrou que vale também para o CREATE. Medido:

| t | `GET /schedules/credit/{id}` | listagem de débito (sem filtro) |
|---|---|---|
| +0 ms | achou, `value -500` | **0 registros** |
| +2 s | achou | achou |

Ou seja: **Create seguido de Get Many pode não ver o que acabou de criar.** Quem encadeia
deve usar o ID que o Create devolve — o Get é consistente na hora. Está escrito no README.

⚠️ **Ressalva sobre o scanner oficial.** O passo do CI ficou verde **sem ter analisado o
pacote**: o `@n8n/scan-community-package` quebrou no runner (`Failed to analyze:
TypeError`) e **saiu com código 0 assim mesmo**, então o `if` do workflow leu sucesso.
Rodado à mão na VPS, o mesmo scanner passou limpo — *"Package n8n-nodes-nibo-empresas@0.6.0
has passed all security checks"*, com provenance conferida. O pacote está certo; o passo do
CI é que não garante nada hoje e precisa exigir a linha de sucesso em vez do código de saída.

**Pendente para fechar a regra 7 por inteiro:** instalar a 0.6.0 pela **tela Community
Nodes** do n8n de dev (hoje com a 0.5.2) e confirmar que o node carrega e mostra os dois
recursos novos. É a única parte que o aceite funcional não cobre — ela prova empacotamento,
não comportamento — e depende do login do owner da instância.

---

## 8. Sequência

Fatias pequenas, teste antes do código, commit por fatia, push a cada fatia, tag e
publicação **só com o OK do Alvaro**:

1. Número no construtor → 2. extração do filtro → 3. descrição → 4. leitura →
5. medição de escrita na cobaia → 6. `readEndpoint` → 7. escrita → 8. README + bump →
9. publicar → aceite real → fechar a tabela da seção 7.
