# PLANO DE IMPLEMENTAÇÃO — v0.11.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da cobaia. Também
> sem GUID de registro.

**Escopo da v0.11.0:** **as contas bancárias** — saldos, transferência e importação de
extrato. É o item 6 do anexo A.2 do contrato, e a última fatia grande de leitura-e-escrita
que sobrou fora de Files, NFS-e e Collections.

**Por que esta e não outra.** A 0.10.0 abriu o recurso `Bank Account` com **uma** operação,
e abriu por obrigação: a baixa é recusada sem uma conta. Ficou um recurso que existe na tela
e não faz nada do que o nome promete. Esta versão paga essa dívida e destrava ~10 nodes em
quatro workflows, entre eles o único que hoje manda extrato bancário para o Nibo.

**Por que é minor e não patch:** capacidades novas — um recurso novo, quatro operações que
não existiam.

**Fora de escopo:** Files & Annotations (item 5); NFS-e (item 7); Collections; `POST
/accounts` e `PUT /accounts/{id}` — ver decisão 9; e o conserto do scanner no CI.

---

## 1. Medições — o que a API respondeu

Tudo abaixo foi medido **na cobaia, em 2026-07-27**, com escrita liberada pelo Alvaro e com
o código ainda não escrito. Tudo que tinha como apagar foi apagado; o que não tinha está
declarado na 1.10.

### 1.1 A view de saldo — a coleção que o catálogo conhecia e nunca teve a forma descrita

`GET /accounts/views/balance` responde **200**, envelope `{items,count}`. Um registro:

```
accountId · accountName · balance · bankBalance · isVirtual · isReconcilable
isAccountAutomated · pendingReconciliationCount · totalOpenReconciliations
isPJBankVirtualAccountWaitingApprove
```

- **A chave é `accountId`**; `$orderby=id` e `$orderby=name` são **500** — as duas
  propriedades simplesmente não existem neste DTO. É a chave de paginação.
- **`isArchived` é 500 aqui.** Existe em `/accounts` e não nesta view: não há como pedir ao
  servidor um saldo sem contas arquivadas.
- Filtros com **200**: `accountId eq` (GUID **sem aspas** — com aspas é o 500 de
  `Edm.Guid`/`Edm.String`, a mesma regra de `/categories`), `accountName`, `balance`,
  `bankBalance`, `isVirtual`, `isReconcilable`.
- **`balance` e `bankBalance` são coisas diferentes**: numa conta sem automação bancária o
  saldo do Nibo andou e o `bankBalance` ficou em `0.00`.

### 1.2 🔴 A rota que não está em documentação nenhuma

O catálogo do projeto (`endpoints.md`, `payloads.md`) conhece **`POST /accounts/transfer`** e
mais nada sobre transferências. Medido:

| ☑ | Rota | Resposta |
|---|---|---|
| ☑ | `GET /accounts/transfer` | **200**, envelope `{items,count}` — **a coleção de transferências** |
| ☑ | `DELETE /accounts/transfer/{transferId}` | **204**, e os saldos voltam |
| ☑ | `GET /accounts/transfers` · `/transfers` · `/accounts/views/transfer` | **404** |

A pista veio de um erro: `DELETE /accounts/transfer/<entryId>` respondeu **500 "Transferência
não encontrada"** em vez de 404. Um 404 diz *rota não existe*; aquela frase diz *rota existe
e o ID está errado* — e é o que fez procurar a coleção.

Um registro traz **só três campos de topo** — `id`, `originEntry`, `destinyEntry` — com os
dois lançamentos inteiros aninhados dentro (`entryId`, `account{}`, `date`, `identifier`,
`value`, `isTransfer`, `createDate`, `createUser`, `costCenters`, `categories`).

- **A chave é `id`**; `date`, `value`, `createDate`, `transferId` e `originEntryId` são
  **500** — não são campos de topo.
- **Os filtros vão pelo caminho aninhado**, e respondem 200: `originEntry/date`,
  `originEntry/value`, `originEntry/identifier`, `originEntry/account/id`,
  `destinyEntry/account/id`. `id eq <guid nu>` também.

### 1.3 A transferência: o que responde e o que cria

| ☑ | O que foi feito | Resposta |
|---|---|---|
| ☑ | `POST /accounts/transfer`, corpo `{date, originAccountId, destinyAccountId, value, description}` | **204**, corpo vazio — **sem ID** |
| ☑ | `GET /accounts/transfer` logo depois | **200 em 335 ms, de primeira** |
| ☑ | O que ela cria | **dois lançamentos**: um em `/payments` na conta de origem, outro em `/receipts` na de destino, ambos `isTransfer: true` |
| ☑ | `DELETE /accounts/transfer/{id}` | **204**, os dois lançamentos somem e os saldos voltam |

**Os 335 ms são o achado de desenho da versão.** Todo o resto desta API chega atrasado —
`/payments` e `/receipts` levam ~3 s (0.10.0, 1.10), a view de saldo leva mais, a fila de
conciliação leva minutos (1.8). **`/accounts/transfer` responde na hora.** A releitura que
confirma a transferência sai barata; nas outras coleções ela seria uma espera.

Dois detalhes do corpo:

- **`description` é opcional**, e omiti-la responde 204. A API então **inventa** a descrição:
  *"Transferência de {conta de origem} para {conta de destino}"*.
- **A descrição chega em `identifier`**, não em `description`. Não existe campo `description`
  no registro lido — nem no aninhado, nem em `/payments`.

### 1.4 Os erros da transferência — e os dois que mentem

| ☑ | Corpo | Resposta |
|---|---|---|
| ☑ | mesma conta nos dois lados | **500** *"Você não pode transferir valores entre as mesmas contas correntes"* |
| ☑ | `value` zero, negativo, ou ausente | **500** *"O valor informado deve ser positivo"* |
| ☑ | sem `date` | **500** *"É necessario informar a data da transfêrencia."* |
| ☑ | **sem `originAccountId`** | 🔴 **500** *"Não é possivel transferir valores de contas virtuais"* |
| ☑ | **sem `destinyAccountId`** | 🔴 **500** *"Não é possivel transferir valores para contas virtuais"* |
| ☑ | **conta inexistente** | 🔴 **500** *"Não é possivel transferir valores de contas virtuais"* |
| ☑ | sem `description` | **204** — ver 1.3 |
| ☑ | **data anterior à abertura da conta** | ✅ **204, aceita** |

As três em vermelho são a mesma mentira: **a conta não é virtual — ela não foi mandada, ou
não existe.** Quem lê a resposta vai procurar uma configuração de conta virtual que não tem
nada a ver com o problema.

A última linha **contraria a suposição com que este plano começou**. Na baixa, data anterior
ao saldo inicial da conta é 500 (0.10.0, 6.1). Na transferência é 204. A defesa que eu havia
proposto para a transferência teria bloqueado uma operação que a API aceita — ela pertence ao
extrato (1.7), e só a ele.

### 1.5 Mais uma assimetria de sinal, e agora dentro da mesma transferência

Uma transferência de 123,45:

| Onde | `value` |
|---|---|
| `/accounts/transfer` → `originEntry` | **−123,45** |
| `/accounts/transfer` → `destinyEntry` | **+123,45** |
| `/payments` (o mesmo lançamento de origem) | **+123,45** |

**O mesmo lançamento vale −123,45 numa rota e +123,45 na outra.** É a terceira vez que este
projeto encontra o padrão: já era assim entre `Get` e `Get Many` de agendamento, e entre
agendamento e baixa (0.10.0, 1.3). O node **repassa o sinal como veio** — inventar um
critério próprio seria criar uma quarta convenção.

### 1.6 O extrato — o formato que o contrato marcava como pendente

O anexo A.3 do contrato registra `POST /accounts/{id}/bankstatement` como *"pendente de
levantamento"*. **Levantado**, lendo o único workflow ativo que o usa (não nomeado aqui,
regra 8) e reproduzido contra a cobaia:

```json
{
  "transactions": [
    { "description": "…", "value": -10.50, "date": "2026-07-27T00:00:00" }
  ],
  "batchName": "extrato.csv"
}
```

Sucesso é **204 sem corpo**. O destino é a **área de transferência** do Nibo — a fila de
conciliação —, não o razão: nenhum lançamento aparece em `/payments` nem em `/receipts`, e o
`balance` da conta **não muda**.

Formatos de data medidos, **os três aceitos**: `2026-07-29T00:00:00` (o que o workflow manda),
`2026-07-30` (só a data) e `2026-07-31T00:00:00Z` (com fuso). **`value` como texto
(`"-2.00"`) também entra.**

### 1.7 🔴 O extrato é aceito pela metade, em silêncio — o achado que justifica a versão

| ☑ | A linha tem… | Resposta | O que de fato acontece |
|---|---|---|---|
| ☑ | **data anterior à abertura da conta** (`dateOfOpenBalance`) | **204** | **a linha some** |
| ☑ | **data que a API não lê** (`29/07/2026`) | **204** | **a linha some** |
| ☑ | `transactions: []` | **204** | nada acontece |
| ☑ | corpo `{}` inteiro, sem `transactions` nem `batchName` | **204** | nada acontece |
| ☑ | conta inexistente | **500** *"Conta corrente não encontrada"* | única recusa de verdade |

**Como isso foi isolado.** Um lote de duas linhas subiu o contador em **uma**. A linha que
ficou de fora era a datada antes da abertura da conta. A hipótese foi então testada ao
contrário — duas linhas, ambas depois da abertura, uma positiva e uma negativa — e as **duas**
entraram, o que descarta o sinal do valor como explicação. A data em formato brasileiro foi
mandada sozinha depois, e o contador **não mexeu**.

**Um lote pode ser aceito pela metade, com 204, sem uma palavra sobre qual linha caiu.** É a
mesma família do `{"Messages":[""]}` com 200 que este projeto existe para interceptar, e é a
pior versão dela até agora: as outras erram tudo ou acertam tudo.

### 1.8 E não há como conferir depois

| ☑ | Rota tentada | Resposta |
|---|---|---|
| ☑ | `GET /accounts/{id}/bankstatement` | **404** |
| ☑ | `GET /accounts/{id}/reconciliations` · `/accounts/{id}/statement` | **404** |
| ☑ | `GET /reconciliations` · `/bankstatement` · `/accounts/views/bankstatement` | **404** |
| ☑ | `GET /accounts/views/reconciliation` · `/accounts/views/reconciliations` | **404** |
| ☑ | `DELETE /accounts/{id}/bankstatement` | **404** |

**A área de conciliação é write-only pela API.** O único sinal observável é o
`pendingReconciliationCount` da view de saldo (1.1) — e ele **conta transações, não lotes**:
três linhas subiram o contador em três.

⏱️ **E ele demora minutos.** Cronometrado: um lote levou **mais de 150 s** para aparecer;
outro ainda não tinha aparecido aos 64 s e apareceu depois. Nenhuma execução de n8n espera
isso. **A operação não tem releitura possível** — e é por isso que a defesa dela é toda antes
de mandar (decisão 6).

### 1.9 `$skip` sem `$orderby` é 500 — em duas das três coleções

| Coleção | `$skip` sozinho | `$orderby` + `$top` + `$skip` |
|---|---|---|
| `/accounts/views/balance` | **500** *"O Nibo se comportou de forma inesperada."* | **200** |
| `/accounts/transfer` | **500** *(idem)* | **200** |
| `/accounts` | **200** | **200** |

O transporte deste node **sempre** manda `$orderby` — o `paginate.ts` o injeta desde a
fundação, e desde a 0.10.0 a chave vem como parâmetro porque cada coleção tem a sua. Ele
passa ileso por esta mina **por desenho, não por sorte**, e isso vira teste na fatia 1.

### 1.10 O que ficou na cobaia

**Apagado, conferido:** todas as transferências das sondas (`GET /accounts/transfer` terminou
em `count: 0`), e os lançamentos que elas criaram saíram de `/payments` e `/receipts` junto —
os saldos voltaram exatamente aos valores de antes.

⚠️ **Permanente, e declarado:**

1. **Uma segunda conta bancária**, criada porque transferência exige duas e a cobaia tinha
   uma. `DELETE /accounts/{id}` é **404**, como já era o `GET`. Arquivar por `PUT` talvez
   sirva de saída — **continua não medido**, e continua fora do escopo (decisão 9).
2. **Onze conciliações pendentes** na área de transferência, das sondas de extrato. Não saem
   por API (1.8) — só pela tela do Nibo, se o Alvaro quiser limpar. Elas **não afetam saldo
   nem lançamento**: ficam na fila de conciliação.

---

## 2. Decisões de recorte

0. **Dois recursos, porque são duas coleções.** `Bank Account` e **`Bank Transfer`** (novo).
   Um registro de `/accounts/transfer` não é uma conta: são três campos de topo com dois
   lançamentos aninhados (1.2), e nenhum filtro de um serve no outro. É a mesma razão que
   separou `Transaction - Payment` de `Schedule - Debit` na 0.10.0. `Bank Transfer` não leva
   prefixo de família: é recurso único, como `Bank Account` e `Category`.

   ```
   Bank Account · Bank Transfer · Category · Contact - Customer · Contact - Employee
   Contact - Partner · Contact - Supplier · Cost Center · Schedule - Credit
   Schedule - Debit · Transaction - Payment · Transaction - Receipt
   ```

   `Bank Transfer` cai logo depois de `Bank Account`, que é onde o olho procura — e isso pesa
   desde que se descobriu que community node não tem busca nas actions (CLAUDE §4.1, item 3).

1. **Seis operações**, e as cinco novas:

   | Recurso · Operação | O que faz |
   |---|---|
   | `Bank Account · Get Many` | já existe desde a 0.10.0, **não muda** |
   | **`Bank Account · Get Balances`** | os saldos, coleção própria, paginada por `accountId` |
   | **`Bank Account · Import Bank Statement`** | manda o extrato para a fila de conciliação |
   | **`Bank Transfer · Create`** | move dinheiro entre duas contas |
   | **`Bank Transfer · Get Many`** | a coleção, com filtro pelos caminhos aninhados |
   | **`Bank Transfer · Delete`** | desfaz uma transferência |

2. **`Get Balances` é operação própria, não uma chavinha no `Get Many`.** São duas coleções
   da API, com chave de paginação diferente (`id` contra `accountId`) e conjuntos de filtro
   que quase não se sobrepõem — `isArchived` existe numa e é 500 na outra (1.1). Juntá-las
   significaria uma tela cujos filtros aparecem e somem conforme um booleano, e cujo campo
   escolhido pode virar 500 ao ligar a chave. Duas operações não têm esse estado.

3. **`Create` relê e devolve o registro completo.** O `POST` responde 204 sem ID (1.3), e sem
   releitura a operação devolveria apenas o que o usuário digitou — indistinguível de uma
   chamada que não gravou. A releitura é em `/accounts/transfer`, que responde na hora, e é
   ela que **produz o `id` sem o qual o `Delete` é inútil**.

4. 🔴 **A defesa da data pertence ao extrato, e não à transferência.** Esta decisão existe
   para registrar um erro do desenho original: eu havia proposto recusar transferência com
   data anterior à abertura da conta, por analogia com a baixa. **A API aceita** (1.4). O
   node **não** recusa — a regra vale para o extrato, onde a linha é engolida em silêncio
   (1.7), e só lá.

5. **`Import Bank Statement` agrega os itens** *(decidido pelo Alvaro em 2026-07-27)*. Um item
   de entrada = uma transação; o node monta um lote e faz **uma** chamada. É a primeira
   operação agregadora deste node, e ela existe porque o formato da API é de lote (1.6): a
   alternativa deixaria de pé o nó de código que hoje faz essa junção.

   Os campos `Description`, `Value` e `Date` são lidos **por item** — `getNodeParameter(name,
   i)` já resolve expressão por índice —, e `Account` e `Batch Name` são lidos do **primeiro**
   item. Daí duas recusas: **itens que pedem contas diferentes** (um lote só não vai para duas
   contas) e **o modo token-por-item** (um lote só não pertence a duas empresas — mesma regra
   que a lista de contas já aplica desde a 0.10.0).

6. **`Import Bank Statement` valida linha a linha antes de mandar, e nomeia a linha.** É a
   consequência direta da 1.7 com a 1.8: como não há releitura possível, uma linha engolida
   é engolida para sempre. O node lê `dateOfOpenBalance` da conta em `GET /accounts` e recusa
   **antes de qualquer escrita**:

   - data que não dá para interpretar;
   - data anterior à abertura da conta — dizendo **qual é** a data de abertura, que é
     justamente o que a API omite quando fala disso na baixa (0.10.0, 6.1);
   - lote vazio depois de tudo isso.

   A recusa nomeia o índice do item, porque num lote de duzentas linhas "uma data inválida"
   não é informação.

7. **`Import Bank Statement` não finge confirmação.** A resposta traz o que foi mandado, a
   contagem de linhas e um aviso de que o Nibo **não confirma na hora**: a fila leva minutos
   (1.8) e a conferência é o `pendingReconciliationCount` do `Get Balances`. Um `success:
   true` seco seria mentira — e é o tipo de mentira que este node existe para não repetir.

8. **`Create` recusa antes de mandar** o que a API recusaria com uma frase errada (1.4):
   mesma conta nos dois lados, valor não positivo, e conta de origem ou destino em branco.
   Esta última é a que mais importa: *"Não é possivel transferir valores de contas virtuais"*
   manda o usuário procurar o problema no lugar errado.

9. **`POST /accounts` e `PUT /accounts/{id}` ficam fora** *(decidido pelo Alvaro em
   2026-07-27)*. Nenhum workflow do mapa precisa delas, e as duas custam caro: conta criada
   **não se apaga** (`DELETE` é 404, medido), e o `PUT` é a porta do `balanceLockDate` —
   recuá-lo destrava um período contábil fechado do cliente, e um `PUT` parcial pode derrubar
   a automação bancária da conta. Entram quando houver uso real, com o merge da 0.4.0.

10. **`Bank Transfer · Delete` devolve `deleted: true`**, como todo outro `Delete` deste node.
    Diferente do estorno da 0.10.0, aqui a operação **apaga mesmo** o recurso desta tela: a
    transferência some da coleção e os dois lançamentos vão junto (1.3). Não há efeito
    colateral a nomear, então não há campo extra.

11. **O filtro assistido de `Bank Transfer` oferece os caminhos aninhados** (`originEntry/date`,
    `destinyEntry/account/id`), porque é o que a coleção tem (1.2) — os nomes de topo são 500.
    Isso **não pede nada novo**: o construtor de OData já escreve caminho com `/` desde a
    0.5.0, e cinco recursos já filtram assim (`document/number`, `stakeholder/name`,
    `group/name`). O que muda é a profundidade — três níveis, contra os dois de hoje — e é só
    isso que a fatia 2 precisa cobrir de teste.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.11.0 |
|---|---|
| `resources/bankAccount/description.ts` | `Get Balances` e `Import Bank Statement`, com os filtros medidos em 1.1 |
| `resources/bankAccount/execute.ts` | As duas, incluindo a validação linha a linha e a agregação |
| `resources/bankTransfer/description.ts` **(novo)** | O recurso, três operações, filtro por caminho aninhado |
| `resources/bankTransfer/execute.ts` **(novo)** | As três, com as recusas da decisão 8 |
| `resources/bankAccount/load.ts` | **Nada** — a lista de contas já serve os campos novos |
| `transport/save.ts` | **Nada previsto**: a releitura tolerante da 0.10.0 já cobre, e aqui ela acerta de primeira |
| `NiboEmpresas.node.ts` | Declara o recurso novo — **e a credencial**, que precisa citar cada `resource` (CLAUDE §4.1, item 1) |
| `transport/odata.ts` | **Nada** — o tipo `guid` e o caminho com `/` já existem desde a 0.5.0 e a 0.9.0 (decisão 11) |
| `transport/paginate.ts` · `resources/shared/*` | **Nada** |

---

## 4. Fatias, com teste antes do código

1. **`Bank Account · Get Balances`** *(commit próprio)*. Leitura pura, e é onde a mina de
   paginação vira teste. Testes: pagina por **`accountId`** e nunca por `id`; o filtro
   assistido oferece só os campos medidos e **nunca `isArchived`**; `accountId eq` monta o
   GUID **sem aspas**; a requisição **sempre** leva `$orderby` junto de `$skip` (1.9).
2. **`Bank Transfer · Get Many` e `Delete`** *(commit próprio)*. Testes: pagina por `id`; o
   filtro assistido monta os caminhos aninhados (`originEntry/date`,
   `destinyEntry/account/id`) e nunca os nomes de topo que dão 500; `Delete` recusa sem ID e
   devolve `deleted: true`.
3. **`Bank Transfer · Create`** *(commit próprio)*. Testes: recusa mesma conta nos dois lados,
   valor não positivo e conta em branco — **antes de qualquer chamada**, com a explicação que
   desmonta a frase das "contas virtuais"; relê em `/accounts/transfer` e devolve o registro
   com `id`; `description` omitida não é erro, e a resposta mostra a que a API inventou; o
   sinal de `originEntry` vem negativo e **não é corrigido** (1.5).
4. **`Bank Account · Import Bank Statement`** *(commit próprio)*, a fatia que justifica a
   versão. Testes: N itens viram **uma** chamada; `Description`, `Value` e `Date` são lidos
   por item e `Account`/`Batch Name` do primeiro; **recusa a linha com data anterior à
   abertura da conta, nomeando o índice e a data de abertura**; recusa data que não dá para
   interpretar; recusa lote vazio, contas divergentes entre itens e o modo token-por-item; a
   resposta diz que o Nibo não confirma na hora e aponta o `Get Balances`.
5. **README, catálogo e bump 0.11.0** *(commit próprio)*. Inclui **corrigir e completar** o
   `endpoints.md` e o `payloads.md` com o que só existe aqui: a coleção
   `GET /accounts/transfer` e o `DELETE /accounts/transfer/{id}` (1.2), que não estão em
   documentação nenhuma; o formato do extrato, encerrando o anexo A.3 do contrato (1.6); as
   duas regras de descarte silencioso (1.7); a inexistência de leitura da fila (1.8); as
   mensagens erradas da transferência (1.4); e o `$skip` sem `$orderby` (1.9).

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.11.0 |
|---|---|
| 3 — escrita só na cobaia | Todas as sondas da seção 1 rodaram **só na cobaia**, com liberação explícita do Alvaro; o que não teve como apagar está declarado na 1.10 |
| 4 — nenhum token em código ou commit | As sondas leram o token de variável de ambiente |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| 6 — nada de caminho absoluto | As sondas são descartáveis e não viraram estado do repositório |
| Decisão 9 — inglês | Campos, rótulos, mensagens de erro e README |
| 7 — instalação real | A 0.11.0 só fecha depois da tela Community Nodes, com a seção 6 preenchida |
| 8 — repo público | Este plano não nomeia cliente, workflow, credencial nem GUID de registro |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build` e
`npm pack` verdes antes de cada commit de fatia.

**Como o aceite é feito:** pelo arranjo da 0.9.0 — um `IExecuteFunctions` de verdade, com o
helper HTTP real e o token da cobaia, chamando **os handlers compilados em `dist/`**, nunca
curl. Cada fatia é aceita no seu commit, com limpeza no fim.

| ☐ | Item | Como conferir |
|---|---|---|
| ☐ | `Get Balances` traz as duas contas com saldo | Contra a cobaia |
| ☐ | `Get Balances` pagina por `accountId` e não quebra com `$skip` | Contra a cobaia, com `Return All` |
| ☐ | `Create` transfere e devolve o `id` da transferência | Saldos conferidos antes e depois |
| ☐ | `Create` recusa mesma conta, valor não positivo e conta em branco | **Sem nenhuma chamada sair** |
| ☐ | `Create` aceita data anterior à abertura da conta | Decisão 4 — a recusa **não** pode existir |
| ☐ | `Get Many` filtra por conta de origem e por data, pelos caminhos aninhados | Contra a cobaia |
| ☐ | `Delete` desfaz e os saldos voltam | Conferido nas duas contas |
| ☐ | `Import` manda N itens numa chamada e devolve a contagem | Contra a cobaia |
| ☐ | **`Import` recusa a linha datada antes da abertura, nomeando o índice** | A defesa central; nenhuma chamada sai |
| ☐ | `Import` recusa data ilegível, lote vazio e contas divergentes | Idem |
| ☐ | `Import` diz que o Nibo não confirma na hora | Texto da resposta |
| ☐ | Um lançamento aparece **certo na tela do Nibo** | Criado pela tela do n8n, olhado no Nibo (regra irmã da 7) |
| ☐ | Um node salvo na 0.10.0 executa sem ser tocado | `Bank Account · Get Many` e `Transaction - Payment` |
| ☐ | A cobaia termina sem transferência de sonda | `count: 0` em `/accounts/transfer`, e saldos de volta |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de uma instância limpa, com o pacote vindo do npm |

---

## 7. O que ficou decidido, e o que não depende de mais ninguém

Respondido pelo Alvaro em 2026-07-27.

| # | Estava em aberto | Ficou |
|---|---|---|
| 1 | O recorte da versão | **Saldos + Transferência + Extrato** — as três com uso real; criar e atualizar conta ficam fora (decisão 9) |
| 2 | Como o extrato recebe as transações | **Um item = uma transação**, o node agrega (decisão 5) |
| 3 | Quanto o node trabalha para provar a transferência | **Relê e confirma** — e saiu barato, 335 ms (1.3) |
| 4 | Escrita na cobaia | **Liberada**, com o resíduo declarado na 1.10 |
| 5 | Se desfazer transferência entra | **Entra**, junto com a listagem — descoberto durante a medição (1.2) |

Nada mais deste plano depende de decisão. A fatia 1 pode começar.
