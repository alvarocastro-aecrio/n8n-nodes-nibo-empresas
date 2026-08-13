# PLANO DE IMPLEMENTAÇÃO — v0.18.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> **Para quem executa em sessão limpa:** as fatias estão em passos com caixa (`- [ ]`),
> cada uma com teste antes do código e commit ao fim. Nenhum passo depende de contexto
> da conversa que originou este plano — tudo que foi medido está na seção 1.
>
> 🔒 Seguro para repositório público: nenhum token, nenhum ID de cliente, nenhum nome de
> empresa. Os comandos abaixo usam `<accountId>` e `<token>` como placeholders.

**Escopo da v0.18.0:** o Get Many de **Transaction - Payment** e **Transaction -
Receipt** ganha dois campos no menu do filtro assistido — **Account ID** (`account/id`,
GUID, comparado sem aspas) e **Account Name** (`account/name`, texto) — a mesma extensão
que 0.7.0 e 0.8.0 fizeram para categoria e contato, agora para a conta bancária pela qual
o pagamento passou.

**Por que agora:** Alvaro lança pagamentos diretamente — Create de Transaction - Payment,
sem passar por um agendamento em aberto antes — e tentou filtrar o Get Many pela conta
bancária do pagamento. A opção não existe no menu de campos hoje. Achado investigando em
2026-08-13.

**Fora de escopo:** mudar o formulário de Create/Settle, que já pede a conta e continua
como está; transformar `account/id` numa lista carregada do servidor (ver decisão em §2);
qualquer outro campo do filtro.

---

## 1. Medições

Medido em 2026-08-13, direto contra a API (curl, fora do node), numa organização com
lançamentos reais de payments/receipts já com conta.

### 1.1 ✅ A leitura de `/payments` e `/receipts` não carrega `accountId` solto — carrega `account` aninhado

```
GET /payments?$top=1
```

responde, entre outros campos, `"account":{"id":"...","name":"...","isDeleted":false,"type":"BankAccount"}`
— não um campo solto `accountId`. Mesmo formato em `/receipts` (sem `type` dentro de
`account`; o resto igual). É o mesmo desenho que `stakeholder` e `category` já têm nesta
mesma coleção: aninhado na leitura, plano na escrita.

### 1.2 ❌ `accountId` — o nome que o lado de escrita usa — é HTTP 500 no Get Many

```
GET /payments?$filter=accountId eq <accountId>
```

→ HTTP 500, `"Could not find a property named 'accountId' on type
'Nibo.Apps.Organization.AppService.Interfaces.Schedules.DTOs.ScheduleEntryDto'"`. É a
mesma armadilha que o bloco de comentário deste arquivo já documenta para `isFlag`/
`isFlagged`: o nome que a escrita exige (`accountId`, campo obrigatório de Create e
Settle) não é o nome que a leitura responde.

### 1.3 ✅ `account/id`, sem aspas, filtra corretamente — HTTP 200 e o resultado bate

```
GET /payments?$filter=account/id eq <accountId>&$top=500
```

→ HTTP 200 nas três contas testadas: uma trouxe 8 registros, todos com aquele
`account.id`; outra bateu no teto de 500 registros, todos também com o `account.id`
pedido; um GUID inventado (`00000000-0000-0000-0000-000000000000`) trouxe 0. Mesmo teste
em `/receipts`, mesma conta → HTTP 200, mesmo formato de retorno.

### 1.4 ✅ `account/name` também filtra, no mesmo padrão que `stakeholder/name` já usa

```
GET /payments?$filter=contains(tolower(account/name),'<pedaço do nome em minúsculo>')
```

→ HTTP 200, resultado restrito às entradas daquela conta. Não medido em `/receipts`
separadamente, mas é o mesmo DTO e o mesmo `account` aninhado de 1.1 — sem razão para
divergir, e se divergir o teste da Fatia 1 pega isso antes do commit.

**O que isso decide:** dois campos em `FILTER_FIELDS`
(`resources/transaction/description.ts`) — `account/id` do tipo `guid`, como `scheduleId`
e `entryId` já são neste mesmo menu, e `account/name` do tipo `text`, como
`stakeholder/name`. Ordem alfabética por rótulo: "Account ID" e "Account Name" ficam
**antes** de "Accrual Date".

---

## 2. Decisões de recorte

- **Só o Get Many.** O formulário de Create/Settle já pede a conta (`accountId`,
  obrigatório) — isso não muda.
- **Caixa de texto, não lista.** Os outros campos GUID deste mesmo menu (`scheduleId`,
  `entryId`) são digitados, não escolhidos de uma lista carregada do servidor —
  `account/id` segue a mesma forma, para não introduzir uma UI diferente dentro do mesmo
  menu por causa de um único campo. Quem precisar do ID de uma conta específica já tem
  **Bank Account · Get Many** (0.11.0) para achá-lo.
- **`account/name` entra junto**, porque já foi medido no mesmo golpe e custa zero código
  novo — o tipo `text` já existe no builder.

---

## 3. Fatias

### Fatia 1 — Os dois campos no filtro, com teste antes do código

- [ ] **Passo 1: escrever o teste que falha**

  Em `nodes/NiboEmpresas/__tests__/transaction.test.ts`:

  - Atualizar `it('offers only the paths the API was measured to filter on', ...)`
    (linha ~362) — acrescentar `'account/id'` e `'account/name'` à lista esperada:
    ```ts
    expect(optionValues(field).sort()).toEqual(
      ['account/id', 'account/name', 'accrualDate', 'date', 'description', 'entryId', 'isFlagged', 'scheduleId', 'stakeholder/name', 'value'].sort(),
    );
    ```
  - Acrescentar `'accountId'` ao `it.each` de `'never offers %s'` (linha ~370) — é a
    mesma armadilha de nome que `isFlag` já cobre ali, agora medida em §1.2.
  - Acrescentar `'accountId'` ao `it.each` de `'fails the item on "%s", which is a 500
    on this view'` (linha ~264) — mesma razão: o node recusa antes de mandar, porque o
    campo não está no menu.
  - Acrescentar `'account/id'` ao laço de `it('collects the two ID fields in the box
    that never quotes them', ...)` (linha ~377) — vira o terceiro campo GUID que passa
    pela mesma caixa de texto sem aspas. Ajustar o comentário da linha 376 e o texto do
    teste ("the two ID fields" → "the three ID fields", ou reformular).
  - Um novo `it` em `describe('executeTransaction — the filter it sends', ...)`, no
    padrão de `it('finds the settlement of a schedule by the schedule ID, unquoted',
    ...)` (linha ~238): condição `{ field: 'account/id', operator: 'eq', guidValue:
    GUID }`, afirmando que o `$filter` enviado é `` `account/id eq ${GUID}` ``, sem
    aspas.
  - Um segundo, no padrão de `it('searches the description ignoring case', ...)`
    (linha ~217): condição de texto sobre `account/name` com `containsIgnoreCase`,
    afirmando `contains(tolower(account/name),'...')`.

- [ ] **Passo 2: rodar e ver falhar**

  `npm test -- transaction.test.ts` — as asserções tocadas devem falhar (o campo ainda
  não existe no menu, ou ainda não está na lista de "nunca oferecidos").

- [ ] **Passo 3: escrever o mínimo que passa**

  Em `nodes/NiboEmpresas/resources/transaction/description.ts`:

  - Acrescentar ao array `FILTER_FIELDS` (começa na linha ~158), antes de `{ label:
    'Accrual Date', ... }`:
    ```ts
    { label: 'Account ID', path: 'account/id', type: 'guid' },
    { label: 'Account Name', path: 'account/name', type: 'text' },
    ```
  - Atualizar o comentário acima de `FILTER_FIELDS` (linhas ~139–157): registrar a
    quinta armadilha de nome — `accountId` falha (§1.2), `account/id` funciona (§1.3),
    mesma forma que `isFlag`/`isFlagged` já documentada ali — e citar `account/name`
    (§1.4), no mesmo tom de "medido em AAAA-MM-DD" que o resto do bloco usa.

- [ ] **Passo 4: rodar e ver passar**

  `npm test -- transaction.test.ts` — tudo verde, resto do arquivo inalterado.

- [ ] **Passo 5: rodar o pacote inteiro e o lint**

  `npm test && npm run lint` — nada mais deve quebrar: nenhum outro arquivo de teste
  referencia a lista de `FILTER_FIELDS` de transaction.

- [ ] **Passo 6: commit**

  Uma mudança, um commit — código e teste juntos.

### Fatia 2 — CHANGELOG e versão

- [ ] **Passo 1:** `package.json` → `"version": "0.18.0"`.
- [ ] **Passo 2:** nova linha em `CHANGELOG.md`, no mesmo tom das anteriores — o que
  faltava (filtrar Get Many de pagamento/recebimento pela conta), por que faltava (o
  nome que a escrita usa, `accountId`, não existe na leitura — é `account/id`, aninhado),
  o que passou a existir (`Account ID` e `Account Name` no menu do filtro).
- [ ] **Passo 3:** commit.

---

## 4. Regras invioláveis

- Nenhuma mudança no formulário de Create/Settle.
- `account/id` continua comparado sem aspas — é GUID, como todo outro campo desse tipo
  neste projeto.
- Um node salvo antes desta versão continua filtrando exatamente como filtrava: são dois
  campos novos no menu, nada removido nem renomeado.
