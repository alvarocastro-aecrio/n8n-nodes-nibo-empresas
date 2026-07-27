# PLANO DE IMPLEMENTAÇÃO — v0.10.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da cobaia. Também
> sem GUID de registro.

**Escopo da v0.10.0:** **a baixa** — pagamentos e recebimentos realizados. É o item 4 do
anexo A.2 do contrato, e a fatia que a 0.9.0 adiou explicitamente.

**Por que esta e não outra.** O buraco não é uma capacidade que falta; é uma capacidade
pela metade. Hoje o node **cria um agendamento e não consegue dar baixa nele** — um contas
a pagar que nasce e nunca é marcado como pago deixa o resto do fluxo em HTTP Request.
Destrava ~11 nodes.

**Por que é minor e não patch:** capacidades novas — dois recursos e uma operação que não
existiam.

**Fora de escopo:** Files & Annotations (item 5, ~19 nodes) e o *Upload & Attach*; NFS-e;
o recurso Account completo — entra só a leitura que a baixa exige, ver decisão 6; e o
conserto do scanner no CI.

---

## 1. Medições — o que a API respondeu

Tudo abaixo foi medido **na cobaia, em 2026-07-27**, com escrita liberada pelo Alvaro e
com o código ainda não escrito. Tudo que tinha como apagar foi apagado; o que não tinha
está declarado na 1.9.

### 1.1 Baixar um agendamento que já existe — a operação que a versão existe para

| ☑ | O que foi feito | Resposta |
|---|---|---|
| ☑ | `POST /schedules/debit/{scheduleId}/payments`, corpo `{accountId, date, value}` | **200**, devolve o **`entryId`** puro |
| ☑ | O agendamento logo depois | **`isPaid: true`** |
| ☑ | `POST /schedules/credit/{scheduleId}/receipts` — o "validar" do catálogo | **200**, `isPaid: true`. **Confirmado simétrico** |
| ☑ | Sem `accountId` | **500** *"Conta bancária não encontrada."* |
| ☑ | Baixa de **100** num agendamento de **400** | **200**, e `isPaid` continua **`false`** — baixa parcial existe |

### 1.2 O 200 que faz outra coisa — e é a defesa central desta versão

| ☑ | O que foi feito | O que a API respondeu | O que de fato aconteceu |
|---|---|---|---|
| ☑ | `POST /payments` **sem** `accountId` | **200** + um GUID | **Nasceu um agendamento de débito em aberto.** Não há pagamento nenhum: `/payments` continua vazio, e o GUID devolvido é um `scheduleId` |
| ☑ | `POST /payments` **com** `accountId` | **200** + um GUID | Agora sim há pagamento — e o GUID **ainda é o `scheduleId`**, não o `entryId` |

Duas coisas decorrem, e as duas viram código:

1. **Uma baixa sem conta bancária não é uma baixa, e a API não diz isso.** É da família do
   `{"Messages":[""]}` com 200 que este projeto existe para interceptar. O node **recusa
   antes de mandar**.
2. **A criação devolve o `scheduleId` e a baixa devolve o `entryId`** — chaves diferentes,
   nas duas pontas da mesma família. Quem relê pela chave errada não acha nada.

### 1.3 O registro, e a chave que ele não usa

`GET /payments` e `GET /receipts` respondem envelope `{items,count}`. Um registro:

```
entryId · scheduleId · isVirtual · account{} · stakeholder{} · category{} · categories[]
date · accrualDate · identifier · value · description · isReconciliated · isTransfer
isFlagged · costCenters · bankBalanceDateIsGreaterThanEntryDate
```

- **A chave é `entryId`**; `$orderby=id` é **500**. É a chave de paginação.
- **`costCenters` está aqui** — o rateio que a 0.9.0 passou a escrever aparece na baixa.
- **`value` de um pagamento vem positivo (250)** onde o agendamento do mesmo lançamento vem
  **negativo (−250)**. O sinal é do endpoint, como já era entre Get e Get Many de agendamento.
- **Não existe `dueDate`, `isPaid` nem `isDeleted`** nesta view — as três são 500.

### 1.4 `isFlag` na escrita, `isFlagged` na leitura — as duas são verdade

O catálogo diz *"`isFlag` aqui (não `isFlagged`)"*, e isso vale **para o corpo de escrita**.
Na **view de leitura e de filtro** o campo é **`isFlagged`**: `isFlag eq false` responde
**500** *"Could not find a property named 'isFlag'"*, e `isFlagged eq false` responde 200.
São dois nomes para o mesmo campo, um de cada lado — medido nos dois.

### 1.5 Ler um lançamento sozinho

| ☑ | Rota | Resposta |
|---|---|---|
| ☑ | `GET /payments/{entryId}` | **404** — não há get-by-id |
| ☑ | `GET /payments?$filter=entryId eq <guid **sem aspas**>` | **200**, `count: 1` |
| ☑ | O mesmo **com aspas** | **500** *"Found operand types 'Edm.Guid' and 'Edm.String'"* |
| ☑ | `GET /payments?$filter=scheduleId eq <guid sem aspas>` | **200** — acha a baixa de um agendamento |

É exatamente a regra do GUID nu que a 0.9.0 mediu em `/categories` e `/costcenters`. **O
tipo `guid` do construtor de OData serve aqui sem uma linha a mais.**

### 1.6 Filtros medidos

| Responde 200 | Responde 500 |
|---|---|
| `contains(description,…)` · `contains(tolower(description),…)` | `isFlag` — é o nome da escrita |
| `isFlagged` · `value` · `date` · `accrualDate` | `isDeleted` — não existe nesta view |
| `stakeholder/name` | `dueDate` — não existe nesta view |
| `entryId eq` · `scheduleId eq` (GUID nu) | `isPaid` — não existe nesta view |

`$orderby` com 200: `entryId`, `scheduleId`, `date`, `accrualDate`, `value`, `description`.
Com 500: `id`, `dueDate`.

### 1.7 Estornar — e o catálogo estava errado sobre a rota

| ☑ | Rota | Resposta |
|---|---|---|
| ☑ | `DELETE /schedules/{kind}/{scheduleId}/payments/{entryId}` | **204**, e o agendamento volta a `isPaid: false` |
| ☑ | `DELETE /schedules/{scheduleId}/payments/{entryId}` — **a rota do catálogo** | **404** |
| ☑ | `DELETE /payments/{entryId}` | **404** |
| ☑ | `DELETE /schedules/{scheduleId}/payments` | **404** |

**O segmento do tipo (`debit`/`credit`) é obrigatório**, e o `payloads.md` o omite. Corrigir.

Apagar o **agendamento** também leva a baixa junto — medido: depois de `DELETE
/schedules/debit/{id}`, `/payments` volta a zero sem estorno explícito.

### 1.8 Recategorizar: não achei rota, e o catálogo diz que existe

O catálogo marca `PUT /payments/{id}` como ✔ — *"há workflow de produção chamando hoje"*.
**Seis candidatas responderam 404**, com o lançamento vivo na mão:

`PUT /payments/{entryId}` · `PUT /payments/{scheduleId}` ·
`PUT /schedules/{s}/payments/{e}` · `PUT /schedules/debit/{s}/payments/{e}` ·
`PUT /schedules/debit/{s}/payments` · `POST /payments/{entryId}`

A categoria e a descrição do lançamento **não mudaram** em nenhuma delas.

**Levantado em 2026-07-27, a pedido do Alvaro, e a resposta é fechada.** O workflow de
produção que sustentava o ✔ foi lido: ele chama `PUT /payments/{entryId}` — **o mesmo id
que eu já tinha testado** — com um corpo de sete campos. Esse corpo foi reproduzido
**exatamente**, campo a campo, contra um lançamento vivo na cobaia, inclusive o
`categoryid` de inicial minúscula que ele escreve: **404**. Com `categoryId` correto:
**404**. A categoria não mudou.

E o que fecha a leitura: **esse workflow está inativo**, com `retryOnFail` e
`onError: continueErrorOutput`. O ✔ do catálogo significava *"alguém escreveu esse node"*,
nunca *"isto funciona"*.

**Conclusão: recategorizar um pagamento não é possível por esta API.** A operação não entra
no menu — a regra da 0.3.1, entrada de menu sem rota atrás é o defeito — e agora isso é
medição, não cautela.

### 1.9 A rota cruzada, que aceita e faz a coisa errada

**`POST /schedules/credit/{id}/receipts` num agendamento de DÉBITO responde 200.** É a
mesma universalidade do get-by-id que a 0.6.0 encontrou, agora numa **escrita**: quem
mandar um débito pela porta do crédito recebe 200 e um lançamento do lado errado do caixa,
sem uma palavra. O node recusa isso pelo recurso, como já recusa no Get.

### 1.10 A lista chega atrasada, e `count` e `items` discordam no meio do caminho

Medido cronometrando: depois de uma baixa, `GET /receipts` respondeu `count=0, items=0`
por ~3 s e só então `count=1, items=1`. Numa outra corrida a lista devolveu **`items` com
registro e `count: 0` ao mesmo tempo**, e depois de um `DELETE` devolveu `count: 3` com a
coleção já vazia.

Consequência de desenho, e é a mais séria da versão depois da 1.2: **a releitura logo
depois de escrever pode não achar o que acabou de ser escrito.** O `niboCreate` de hoje
relê na hora. Aqui isso não basta.

Segunda consequência: a defesa de varredura incompleta do transporte compara `count` com o
que colheu. Numa coleção onde os dois discordam por alguns segundos, essa comparação pode
gritar sem motivo — **conferir contra a 0.2.0 antes de confiar**.

### 1.11 O que ficou na cobaia

A empresa **não tinha conta bancária nenhuma**, e sem conta não existe baixa. Foi criada
**uma**: `SONDA CONTA 0.10.0`, com corpo `{name}` apenas — `POST /accounts` responde 200 e
devolve o GUID puro.

⚠️ **Ela é permanente:** `DELETE /accounts/{id}` é **404**, como o `GET` já era. O registro
tem `isArchived`, então arquivar por `PUT` talvez sirva de saída — **não medido**.

Todo o resto foi apagado: os agendamentos e as baixas das sondas, cada um conferido, e
`/payments` e `/receipts` terminaram em `count: 0` e `items: 0`.

---

## 2. Decisões de recorte

0. **Os nomes no menu levam a palavra de família `Transaction`** *(decidido pelo Alvaro em
   2026-07-27, vendo os três menus lado a lado)*. `Transaction - Payment` e
   `Transaction - Receipt`, com os `value` guardados como `payment` e `receipt` — rótulo é
   palavra, `value` é contrato.

   ```
   Bank Account · Category · Contact - Customer · Contact - Employee
   Contact - Partner · Contact - Supplier · Cost Center
   Schedule - Credit · Schedule - Debit · Transaction - Payment · Transaction - Receipt
   ```

   **O caminho até aqui vale mais que a escolha.** Minha primeira sugestão foi `Settlement`,
   por duas razões: a regra deste node (família de mais de um recurso leva prefixo) e a
   posição na ordenação. O Alvaro achou a palavra ruim e pediu outra — e ao procurar, a
   razão da ordenação caiu: medido com **todos** os recursos que ainda faltam no roteiro,
   `Payment` e `Receipt` ficam adjacentes **sem prefixo nenhum**, porque nada plausível cai
   entre eles. O prefixo não conserta agrupamento aqui, ao contrário da 0.8.2, onde
   `Credit Schedule` caía entre `Category` e `Customer`.

   Ficou então um custo contra um ganho, e os dois são reais: sem prefixo, a palavra que o
   olho procura vem primeiro — **e isso pesa mais desde que se descobriu que community node
   não tem busca nas actions** (CLAUDE §4.1, item 3), então o menu é varrido de olho. Com
   `Transaction`, os dois se leem como uma família e caem logo depois de `Schedule`, na
   ordem do dinheiro. **`Settlement` perdia dos dois lados**: tomava o primeiro lugar da
   linha *e* era uma palavra que ninguém diz.

1. **Dois recursos, `Payment` e `Receipt`, com um handler só** — a API dá aos dois um
   contrato idêntico (medido nas cinco operações), exatamente como aos dois agendamentos e
   aos quatro contatos. Custam uma tabela e nenhuma lógica.
2. **Cinco operações**, e a que justifica a versão é a terceira:

   | Operação | O que faz |
   |---|---|
   | **Settle** | Dá baixa num agendamento que já existe — o buraco de hoje |
   | Create | Lança e baixa numa tacada, criando o agendamento junto |
   | Get Many | A coleção, com filtro assistido e paginação por `entryId` |
   | Get | Um lançamento, pela lista filtrada — não há get-by-id |
   | Delete | Estorna a baixa, devolvendo o agendamento a *em aberto* |

3. **`Create` recusa sem conta bancária.** É a defesa central: sem `accountId` a API
   responde 200 e cria um agendamento em aberto no lugar do pagamento (medição 1.2). Uma
   operação chamada *Create Payment* que às vezes não cria pagamento nenhum é pior que
   nenhuma operação.
4. **A releitura tolera o atraso da lista.** Create e Settle releem o registro; a coleção
   demora ~3 s a mostrá-lo (1.10). A releitura tenta de novo por uma janela curta antes de
   desistir, e **o `entryId` de uma baixa e o `scheduleId` de uma criação são chaves
   diferentes** — cada operação relê pela sua.
5. **`Delete` é estorno, e o nome tem que dizer isso.** Ela não apaga o agendamento: devolve
   ele a *em aberto*. O texto da tela diz, e a resposta do node é
   `{ scheduleId, entryId, reversed: true }` em vez do `deleted: true` dos outros recursos.
6. **Entra `Bank Account` com `Get Many` só** *(decidido pelo Alvaro em 2026-07-27)*. A baixa exige um
   `accountId` e o node não tem de onde tirar um. A lista assistida resolve na tela; **no
   modo token-por-item ela recusa carregar** (regra da 0.7.0), e aí é preciso um jeito de
   ler o ID por empresa — que é exatamente o que `Category · Get Many` faz desde a 0.7.0.
   O recurso Account **completo** (saldos, transferência, extrato) é o item 6 do roteiro e
   continua fora.
7. **Recategorizar não entra**, pela medição 1.8 — e não é mais pendência: o workflow de
   produção foi lido, a chamada dele foi reproduzida à risca e responde 404. A capacidade
   não existe nesta API.
8. **Settle recusa o agendamento do outro tipo.** A API aceita com 200 (1.9). O node já faz
   isso no `Get` do agendamento desde a 0.6.0 e a mensagem já existe — aqui ela vale mais,
   porque lá o prejuízo era ler errado e aqui é **escrever** no lado errado do caixa.
9. **O `guid` do OData é reusado sem uma linha nova** — `entryId` e `scheduleId` comparam
   nus, igual a `/categories` e `/costcenters` (1.5). O tipo entrou na 0.9.0 justamente por
   isso.
10. **Nada de recategorização silenciosa no Update.** Não há Update aqui: a única escrita
    sobre um lançamento existente é o estorno.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.10.0 |
|---|---|
| `resources/transaction/description.ts` **(novo)** | Os dois recursos, cinco operações, filtro assistido |
| `resources/transaction/execute.ts` **(novo)** | As cinco, com a recusa sem conta e a recusa do tipo trocado |
| `resources/account/description.ts` **(novo)** | `Bank Account · Get Many` |
| `resources/account/execute.ts` **(novo)** | Uma operação |
| `resources/account/load.ts` **(novo)** | A lista de contas do formulário de baixa |
| `transport/save.ts` | A releitura que tolera o atraso da lista (decisão 4) — **a única mudança de transporte prevista** |
| `NiboEmpresas.node.ts` | Declara os três recursos novos, o `loadOptions` novo — **e a credencial**, que precisa citar cada `resource` (CLAUDE §4.1, item 1) |
| `transport/odata.ts` · `resources/shared/*` · os recursos de 0.9.x | **Nada** |

---

## 4. Fatias, com teste antes do código

1. **`Transaction · Get Many` e `Get`** *(commit próprio)*. Leitura pura. Testes:
   pagina por `entryId` e nunca por `id`; o filtro assistido só oferece os campos medidos e
   **nunca `isFlag`, `isDeleted`, `dueDate` nem `isPaid`**; Get monta `entryId eq` **sem
   aspas** e recusa o que não é GUID; lista vazia vira "não encontrado".
2. **`Bank Account · Get Many` e a lista** *(commit próprio)*. Testes: lê `/accounts` e
   desempacota pelo formato; a lista recusa carregar no modo token-por-item apontando a
   operação que lê o ID por empresa.
3. **`Settle`** *(commit próprio)*, a fatia que justifica a versão. Testes: monta
   `/schedules/{kind}/{id}/{payments|receipts}` a partir do recurso; **recusa sem conta
   bancária antes de mandar**; recusa o agendamento do tipo trocado; relê pelo `entryId`
   que a rota devolve; a baixa parcial passa sem virar erro.
4. **`Create`** *(commit próprio)*. Testes: **recusa sem conta**, com a explicação da 1.2;
   o corpo leva `isFlag` (nome da escrita) e a leitura devolve `isFlagged`; relê pelo
   **`scheduleId`**, que é o que esta rota devolve, e não pelo `entryId`.
5. **`Delete` (estorno)** *(commit próprio)*. Testes: a rota carrega o segmento do tipo;
   sem ele seria 404; devolve `reversed: true` e não `deleted: true`; recusa quando falta
   qualquer um dos dois IDs.
6. **A releitura que tolera o atraso** *(commit próprio)*. Testes: uma lista que responde
   vazia e depois responde o registro é lida corretamente; a janela é limitada e o fim dela
   é um erro que diz o que houve; nenhum outro recurso muda de comportamento.
7. **README, catálogo e bump 0.10.0** *(commit próprio)*. Inclui corrigir no `endpoints.md`
   e no `payloads.md`: a rota de estorno (1.7), o `isFlag`/`isFlagged` dos dois lados (1.4),
   o `accountId` que a criação não exige e a baixa exige (1.1/1.2), e a marca ✔ de
   `PUT /payments/{id}`, que não se sustentou (1.8).

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.10.0 |
|---|---|
| 3 — escrita só na cobaia | Todas as sondas da seção 1 rodaram **só na cobaia**; tudo que tinha como apagar foi apagado, e a conta bancária que não tem está declarada na 1.11 |
| 4 — nenhum token em código ou commit | As sondas leram o token de variável de ambiente |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| 6 — nada de caminho absoluto | As sondas são descartáveis e não viraram estado do repositório |
| Decisão 9 — inglês | Campos, rótulos, mensagens de erro e README |
| 7 — instalação real | A 0.10.0 só fecha depois da tela Community Nodes, com a seção 6 preenchida |
| 8 — repo público | Este plano não nomeia cliente, workflow, credencial nem GUID |

---

## 6. Teste e aceite

**Gate local:** ☑ cumprido em 2026-07-27 — `npm run lint`, `npm run lint:community`,
`npm test` (657 testes), `npm run build` e `npm pack` todos verdes.

**Como o aceite foi feito:** pelo arranjo da 0.9.0 — um `IExecuteFunctions` de verdade, com
o helper HTTP real e o token da cobaia, chamando **os handlers compilados em `dist/`**. Cada
fatia foi aceita no seu commit, com limpeza no fim, e a cobaia terminou em `count: 0` nas
duas coleções todas as vezes.

| ☑ | Item | Como foi conferido |
|---|---|---|
| ☑ | `Settle` baixa um agendamento de débito e ele fica pago | Contra a cobaia, `isPaid` conferido |
| ☑ | E um de crédito, pela rota simétrica | Idem |
| ☑ | A baixa **parcial** deixa o agendamento em aberto | 100 contra 400: 200, e `isPaid` continua false |
| ☑ | `Settle` **sem conta** é recusado pelo node, não pela API | Recusado antes de qualquer chamada |
| ☑ | `Settle` recusa o agendamento do tipo trocado | Recusou **e não escreveu nada** |
| ☑ | `Create` sem conta é recusado — e nunca cria agendamento em aberto no lugar | Nenhuma chamada sai; a explicação diz o que aconteceria |
| ☑ | `Create` relê pelo `scheduleId` e `Settle` pelo `entryId` | As duas releituras, contra a cobaia |
| ☑ | A releitura sobrevive ao atraso da lista | Quatro tentativas somando 6 s; todo Create e Settle do aceite passou por ela |
| ☑ | `Delete` estorna e o agendamento volta a em aberto | `isPaid` de volta a false, entrada fora da coleção |
| ☐ | Um lançamento aparece **certo na tela do Nibo** | Criado pela tela do n8n, olhado no Nibo (regra irmã da 7) |
| ☐ | Um node salvo na 0.9.1 executa sem ser tocado | Agendamento e Category · Get Many |
| ☑ | A cobaia termina sem lançamento de sonda | `count: 0` em `/payments` e `/receipts`, medido **depois** da janela de atraso |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de uma instância limpa, com o pacote vindo do npm |

### 6.1 O que a construção mediu além do plano

1. 🔴 **A data da baixa não pode ser anterior ao saldo inicial da conta** — 500 *"A data da
   baixa é inferior a data do saldo inicial da conta."* A data comparada é o
   `dateOfOpenBalance` da **conta**, e a frase da API omite justamente isso. Pior: **esse
   erro mascara outros**, porque vence antes deles — foi ele que fez uma sonda de
   `accrualDate` parecer falha do `accrualDate`. Virou explicação do node.
2. **`accrualDate` omitido faz a API copiar a `date`** — a mesma armadilha do `dueDate` no
   agendamento, e por isso o campo ficou no corpo e não num menu.
3. **A matriz de contato de `/payments` e `/receipts` é idêntica à dos agendamentos** —
   medida, não deduzida: cliente num pagamento e fornecedor ou funcionário num recebimento
   respondem *"Stakeholder is not compatible"*.

### 6.2 Onde o plano foi contrariado, e por quê

1. **A ordem das fatias estava errada.** A releitura tolerante era a fatia 6, e as fatias 3
   e 4 dependem dela — cumprir a ordem original significaria embutir num commit um defeito
   já conhecido. Veio antes da 3, em commit próprio.
2. **`Delete` devolve `deleted: true`, não `reversed: true`** como a decisão 5 pedia. O
   argumento dela era que a operação não apaga o agendamento — verdade, mas ela apaga a
   **entrada**, que é o recurso desta tela, e `deleted` é o que todo outro recurso deste node
   devolve. O que faltava era o efeito colateral, e ele virou campo próprio:
   **`scheduleReopened: true`**.

---

---

## 7. As três que estavam em aberto, e como ficaram

Respondidas pelo Alvaro em 2026-07-27.

| # | Estava em aberto | Ficou |
|---|---|---|
| 1 | Os nomes no menu | **`Transaction - Payment` / `Transaction - Receipt`** — delegado a mim, minha sugestão (`Settlement`) recusada e refeita com ele. Ver decisão 0. `Bank Account` solto |
| 2 | Se `Bank Account` entra agora | **Entra**, com `Get Many` só — decisão 6 |
| 3 | Se vale levantar o `PUT /payments/{id}` | **Levantado e fechado**: a chamada de produção foi lida e reproduzida à risca, responde 404, e o workflow que a fazia está inativo. Não existe recategorização nesta API — ver 1.8 |

Nada mais deste plano depende de decisão. A fatia 1 pode começar.
