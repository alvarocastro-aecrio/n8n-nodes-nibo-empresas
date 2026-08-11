# PLANO DE IMPLEMENTAÇÃO — v0.17.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> **Para quem executa em sessão limpa:** as fatias estão em passos com caixa (`- [ ]`),
> cada uma com teste antes do código e commit ao fim. Nenhum passo depende de contexto
> da conversa que originou este plano — tudo que foi medido está na seção 1.
>
> 🔒 Seguro para repositório público: nenhum token, nenhum ID de cliente, nenhum nome de
> empresa.

**Escopo da v0.17.0:** **uma escrita confirmada nunca é reportada como falha.** Quando o
`POST` foi aceito e só a releitura não alcançou, o node passa a devolver o que sabe, com
aviso, em vez de abortar a rajada — e passa a distinguir, com prova, o atraso da
collection do caso em que o dinheiro realmente não foi registrado como movimentado.

**Por que agora.** Uma rajada de 66 lançamentos parou no terceiro. Os três primeiros foram
gravados e liquidados; os 63 restantes nunca foram enviados. Seção 1.1.

**Fora de escopo:** retry de HTTP no `transport/request.ts` (a 429 e a 500 continuam como
estão); mudar o formato de saída do caminho feliz; traduzir mensagens de erro (segue para
a 0.16.1); qualquer mudança no `settle` além da que espelha o `create`.

---

## 1. Medições

### 1.1 ✅ Produção, 2026-08-10: o lag **cresce dentro da rajada**

Medido sobre uma execução real (n8n 2.x, pacote 0.16.0, `receipt` → `create`, 66 itens de
entrada, intervalo entre itens no padrão de 1000 ms). Os instantes do `POST` vêm do
`createDate` que a própria Nibo carimbou; os do node, do `startTime`/`executionTime` da
execução.

| item | `POST` carimbado pela Nibo | janela até a lista responder |
|---|---|---|
| 0 | `21:00:43.157Z` | ~1,9 s → achou |
| 1 | `21:00:46.313Z` | ~4,3 s → achou |
| 2 | `21:00:51.890Z` | **7,116 s → esgotou as 5 tentativas** |

O node começou em `21:00:42.845Z` e lançou em `21:00:59.006Z`. Os 7,116 s do item 2 batem
com a janela do `niboReadBack` — 500+1000+2000+2500 ms de sono mais os 5 GETs. Os dois
primeiros números dependem de estimar ~300 ms de ida e volta do `POST`; o terceiro é
exato, e é ele que fecha a aritmética.

**O que isso derruba:** a calibragem de 2026-07-27, que viu ~3 s num settle isolado e
concluiu que 6 s eram "o dobro do que foi visto". O lag não é constante — ele **cresce
conforme a rajada avança**. Aumentar a janela fixa adia o estouro para o item 8 ou 15 e
multiplica o tempo de parede pelo tamanho da rajada.

### 1.2 ✅ A criação foi completa, não pela metade

Os três lançamentos existem na Nibo, liquidados: `paidValue` igual ao `value` e
`paymentDate` no dia pedido. Não é o caso de nascer agendamento em aberto — o `throw` foi
**falso negativo puro**, e custou 63 lançamentos que nunca foram enviados.

### 1.3 ⚠️ E na cobaia o atraso **não** cresceu — a hipótese da rajada não se sustenta

Sonda de 2026-08-11, empresa nova e vazia, rajada de 12 criações com 1 s entre elas, do
jeito que o node faz. Lag da lista `/receipts`, item a item, em ms:

```
2649 · 1496 · 1162 · 1739 · 1600 · 1827 · 2150 · 1809 · 1520 · 1739 · 1780 · 1629
```

Entre 1,1 e 2,6 s, **estável, sem tendência de subida**. Ou seja: o que 1.1 mostrou é que
o atraso *varia muito* e que em produção passou de 7 s — não que a rajada seja a causa. O
que empurra para cima é provavelmente porte e carga da organização, e isso **não foi
isolado**. Fica registrado como não sabido, e não como sabido.

**Consequência:** calibrar a janela pelo número da cobaia seria repetir o erro de
2026-07-27 — medir numa empresa vazia e concluir para todas. A janela não é a saída.

### 1.4 ✅ O get-by-id é forte-consistente, e é ~40x mais barato

Mesma sonda, cronometrado em paralelo com a lista, logo após o `POST /receipts`:

| rota | resposta |
|---|---|
| `GET /receipts?$filter=scheduleId eq {id}` | 1.162–2.649 ms |
| `GET /schedules/credit/{scheduleId}` | **38–67 ms**, sempre, em 13 medições |

Nenhuma medição do get-by-id passou de 67 ms, e nenhuma falhou. É a prova barata.

### 1.5 ✅ `isPaid` separa o liquidado do que nasceu em aberto

O corpo do get-by-id, nos três casos que importam:

| nasceu de | `isPaid` | `paidValue` | `openValue` | `isEntry` |
|---|---|---|---|---|
| `POST /receipts` **com** `accountId` | `true` | valor | `0` | `true` |
| `POST /receipts` **sem** `accountId` | `false` | `0` | valor | `false` |
| `POST /schedules/credit` | `false` | `0` | valor | `false` |

### 1.6 ✅ O caso perigoso está confirmado, e é exatamente este

`POST /receipts` **sem** `accountId` responde **200** e um GUID, e o que nasce é um
agendamento **em aberto** — `isPaid: false`, `openValue: 100` — que **não aparece em
`/receipts`** (a lista filtrada por ele responde `[]`). Reconfirma a medição de 2026-07-27
que originou a recusa no topo do `createEntry`, e prova que 1.5 distingue o caso.

**É a decisão de arquitetura inteira, respondida:** o sucesso brando pode ser *verificado*.
Quando a lista não alcançar, o node pergunta ao get-by-id; `isPaid: true` é prova de que o
dinheiro foi registrado como movimentado, e `isPaid: false` é uma falha de verdade, que
merece sentença própria — e que hoje passa despercebida.

### 1.7 ✅ Auditoria: quem mais sofre do mesmo defeito

Sete lugares aceitam uma escrita e depois **lançam erro fatal** porque a confirmação não
veio. Ordenados pelo que um reenvio custa, que é o que decide a prioridade:

| # | onde | a escrita aceita é | reenviar custa | janela hoje |
|---|---|---|---|---|
| 1 | `transaction/execute.ts:482` · create | recebimento/pagamento liquidado | **dinheiro em dobro** | 5 tent. / 6 s |
| 2 | `transaction/execute.ts:350` · settle | a baixa de um agendamento | **dinheiro em dobro** | 5 tent. / 6 s |
| 3 | `bankTransfer/execute.ts:255` | transferência entre contas | **dinheiro movido em dobro** | 3 tent. / **1,5 s** |
| 4 | `bankAccount/execute.ts:254` · create | conta bancária | conta duplicada, e **permanente** — esta API não apaga conta | 5 tent. / 6 s |
| 5 | `scheduleFile/execute.ts:270` · attach | anexo num agendamento | anexo duplicado | 3 tent. / **1,5 s** |
| 6 | `bankAccount/execute.ts:380` · update | `PUT` aplicado | nada — `PUT` é idempotente aqui | 5 tent. / 6 s |
| 7 | `transport/save.ts:192` · `niboSafeUpdate` | `PUT` aplicado | nada | **1 leitura, zero retry** |

Três observações que a tabela não diz sozinha:

- **O #3 e o #5 estão mais expostos que o #1, não menos.** A janela de 1,5 s deles foi
  justificada por uma medição de *"335 ms, primeira tentativa"* numa chamada isolada — o
  mesmo método que calibrou os 6 s do #1 e que 1.1 derrubou.
- **O #7 não tem retry nenhum**: um `GET` depois do `PUT`, e ele atende os updates de
  contato, categoria, centro de custo e agendamento. É o mais frágil dos sete, e é o que
  menos machuca quando falha.
- **O #5 diz a coisa oposta dos outros** — *"o attach não aconteceu, anexe de novo"* — por
  inferência, não por medição. Vale conferir antes de repetir a frase.

E quatro lugares **já acertam**, e são o precedente da casa: `_niboAuthorizationPending` e
`_niboCancellationPending` (`serviceInvoice`), `_niboReconciliationNotice` (`bankAccount`),
`_niboRecurrenceNotListed` (`schedule`), mais o `niboCreate` que cai para `{ id }` quando a
releitura não vem.

**Recorte desta versão:** #1 e #2 têm a prova barata medida em 1.4/1.5 e são resolvidos
aqui. #3, #4 e #5 exigem sonda própria — cada um tem uma rota de confirmação diferente, e
nenhuma foi medida. Ficam para a 0.17.1, listados aqui para não sumirem.

---

## 2. As perguntas da sonda

Contra a **cobaia**, nunca contra empresa de cliente. Tudo que a sonda criar é apagado no
fim, com `DELETE /schedules/credit/{id}` — apagar a baixa **não basta**, ver decisão 3.

- **2.1** Depois de `POST /receipts`, quanto tempo até
  `GET /receipts?$filter=scheduleId eq <id>` responder o registro? Polling a cada 250 ms,
  teto de 120 s. Um número, não uma faixa.
- **2.2** Esse número cresce numa rajada? Doze criações seguidas, 1 s entre elas, medindo
  o lag de cada uma. É a reprodução controlada de 1.1.
- **2.3** `GET /schedules/credit/{scheduleId}` responde **na hora** depois do
  `POST /receipts`? Medir a latência até o primeiro 200, no mesmo laço apertado.
- **2.4** Nesse corpo, **qual campo distingue liquidado de em aberto**? Comparar o
  schedule nascido de `POST /receipts` (com `accountId`) com um nascido de
  `POST /schedules/credit`. Olhar `isPaid`, `paidValue`, `isDued`, `status`, `type`.
- **2.5** Reconfirmar o caso perigoso: `POST /receipts` **sem** `accountId` nasce em
  aberto? E o campo de 2.4 mostra isso?

**2.3 + 2.4 são a decisão de arquitetura inteira.** Se existir uma rota forte-consistente
que diga "liquidado", o sucesso brando é *verificado*. Se não existir, ele é cego — e aí é
outro desenho, decisão 2.

---

## 3. Decisões de recorte

1. **A lista continua sendo o caminho feliz.** O registro que ela devolve é o que o
   workflow consome hoje; trocar isso mudaria o formato de saída de quem já usa. A
   confirmação pela outra rota é o **plano B**, não o novo padrão.
2. **Sucesso brando só com prova, se houver prova.** Se 2.3/2.4 derem a rota
   forte-consistente, o aviso sai só depois de confirmar que o schedule está liquidado, e
   um schedule **em aberto** vira erro — outro erro, que diz que o dinheiro *não* foi
   registrado como movimentado. Se não derem, o aviso sai sem verificação e **diz que não
   verificou**, em vez de fingir.
3. **Apagar a baixa não apaga o lançamento.** `DELETE` da entrada devolve
   `scheduleReopened: true` (`transaction/execute.ts:164-171`): o agendamento volta a
   existir em aberto. Vale para a limpeza da sonda e para qualquer instrução de operação.
4. **`continueOnFail` para de descartar a `description`.** Hoje o catch empurra só
   `{ error: message }` (`transaction/execute.ts:192-195`) — quem liga a opção justamente
   para não perder a rajada perde o `scheduleId` que provaria não reenviar.
5. **A janela fixa não é onde a correção mora.** Pode ser ajustada com o número de 2.1/2.2
   na mão, mas 6 s × 63 itens são 6 min de sono puro numa rajada; a saída é a confirmação
   barata, não a espera longa.

---

## 4. Regras invioláveis

| Regra | Por quê |
|---|---|
| Escrita aceita **nunca** vira `throw` sem antes tentar confirmar | É o erro que faz o operador reenviar e pagar duas vezes |
| O `scheduleId` sai **em campo**, não só na prosa | A `description` some no `continueOnFail` |
| Sonda só na cobaia, com limpeza conferida segundos depois | A lista atrasa depois do `DELETE` e mostra fantasma |
| Nenhum ID de cliente neste arquivo | Repositório público |
| `npx jest && npm run lint && npm run build` antes de cada commit | Portão de sempre |

---

## 5. Fatias — o que foi feito

Executadas em 2026-08-11. Cada uma com teste antes do código, e o portão
`npx jest && npm run lint && npm run build` antes do commit.

### Fatia 0 ✅ — A sonda

`<scratchpad>/sonda-0.17.0.mjs`, fora do repo. Token da cobaia renovado; empresa nova, sem
cliente e sem conta, então a sonda cria um de cada antes de medir. Respostas na seção 1.4
a 1.6. Limpeza: 15 `DELETE /schedules/credit/{id}`, todos 204, conferidos 8 s depois —
`count: 0` em agendamentos e em recebimentos. **A conta bancária fica**: esta API não apaga
conta, e a sonda cria uma só, reutilizável.

### Fatia 1 ❌ — Cancelada, e vale dizer por quê

Era para `niboReadBack` devolver quantas vezes tentou, para o aviso poder citar o número.
Com 1.4 na mão o aviso passou a citar coisa melhor — o que o **schedule** responde, com
`isPaid` e `paidValue` de verdade — e o número de tentativas virou detalhe interno. Uma
fatia inteira que a medição tornou desnecessária.

### Fatia 2 + 3 ✅ — A confirmação pela rota barata, e o aviso no lugar do `throw`

**Arquivos:** `resources/transaction/execute.ts`, `__tests__/transaction.test.ts`

`scheduleBehind()` lê `GET /schedules/credit/{id}` e engole a própria falha — uma
confirmação que não responde não é falha nova, o chamador ainda tem a frase antiga.

Três saídas no `create`, e são três frases diferentes onde antes havia uma:

| o schedule responde | o node faz |
|---|---|
| `isPaid: true` | devolve os campos dele + `scheduleId` + `_niboReadBackPending` |
| `isPaid: false` | **erro novo** — nasceu agendamento em aberto, o dinheiro não foi registrado como movimentado |
| não responde | o erro de antes, com o "não reenvie" intacto |

**No `settle` o teste é outro, e o próprio suíte foi quem avisou:** liquidação parcial é
legítima e deixa `isPaid: false`. Então ali o que se compara é **quanto foi pago**, contra
a leitura que já estava sendo feita para a checagem de tipo. `paidValue` subiu → liquidou;
igual → não liquidou, e isso é erro.

### Fatia 4 ✅ — O `continueOnFail` para de perder a prova · janela **não** mexida

**Arquivos:** `resources/shared/failure.ts` (novo), os 13 pontos de captura dos 12
resources.

`failedItem(error)` mantém `error` com nome e conteúdo idênticos — workflow lê `$json.error`
desde a 0.1.0 — e acrescenta `errorDescription` quando existe.

**`READ_BACK_WAITS` fica como está, de propósito.** Calibrá-la pelos 1,1–2,6 s da cobaia
seria repetir o erro de julho: medir numa empresa vazia e concluir para todas (1.3). A
janela deixou de ser a única prova, que era o problema.

### Fatia 6 ✅ — Um segundo de respiro antes de toda chamada de um mesmo ciclo

**Arquivos:** `transport/save.ts`, `resources/transaction/execute.ts`,
`resources/bankTransfer/execute.ts`, `resources/scheduleFile/execute.ts` e os testes de cada.

A Nibo responde 429 acima de ~14 chamadas por segundo e aperta isso em horário comercial.
Os ciclos deste node disparavam chamadas coladas — `POST` e `GET` sem nada entre eles — e
**todo read-back perguntava a primeira vez no instante em que a escrita voltava.** Essa
pergunta não podia acertar: o menor lag já medido nesta coleção é **1.162 ms** (1.3). Era
requisição gasta para ouvir não, contra um orçamento que uma chamada útil depois pode
precisar.

| onde | antes | agora |
|---|---|---|
| `niboReadBack` | ask em 0, depois 500·1000·2000·2500 | 1000·1000·2000·3000·5000, **uma espera por ask** |
| `niboCreate` | `POST` → `GET` colados | 1 s entre eles |
| `niboSafeUpdate` | `GET`→`PUT`→`GET` colados | 1 s entre cada |
| `bankTransfer` | ask em 0, depois 500·1000 | 1000·1000·2000 |
| `scheduleFile` | ask em 0, depois 500·1000 | 1000·1000·2000 |
| reconferência do `isPaid` | não existia | 3 asks, 1 s entre eles |

A constante mora em `transport/save.ts` como `BREATH`, com o porquê no lugar. **A janela
do read-back dobrou de 6 s para 12 s e ainda assim gasta menos requisição**, porque as duas
que iam para o vazio agora vão para onde um registro pode estar.

**E a reconferência do `isPaid` é uma correção de risco, não de desempenho.** Uma única
leitura `false` viraria o erro *"nasceu agendamento em aberto"* numa escrita boa cujo flag
ainda não tinha alcançado — e a frase manda liquidar de novo, ou seja, dinheiro em dobro.
Três leituras com um segundo entre elas, e só então a acusação.

### Fatia 5 ✅ — Aceite contra a API real

`<scratchpad>/aceite-0.17.0.mjs`: dirige os handlers de `dist/` com um `IExecuteFunctions`
de verdade, no modo *API Token (Per Item)*, **com o read-back forçado a desistir de
primeira** — sem isso o caminho feliz venceria sempre na cobaia e o ramo novo nunca rodaria.

```
1. criação com conta, read-back impossível → NÃO lançou
   isPaid true · paidValue 77 · openValue 0 · _niboReadBackPending presente
2. POST /receipts sem conta            → isPaid false · openValue 77
   (o caso que o ramo novo passa a chamar de falha, e que hoje passa batido)
3. rajada de 8, todas com read-back impossível → 8/8 sobreviveram
   antes da 0.17.0: 0/8
4. caminho normal, read-back de verdade → 1862 · 2327 · 1873 ms
   três entryId distintos, nenhum aviso — o caminho feliz segue sendo o caminho feliz
```

Limpeza: 13 `DELETE`, todos 204; `count: 0` em agendamentos e recebimentos.

⚠️ **O arnês mediu a si mesmo antes de medir o node, e vale registrar.** A primeira rodada
da parte 4 devolveu o **mesmo `entryId` três vezes**. Não era o node: `qs` é opção separada
de `IHttpRequestOptions` e quem a serializa é o n8n, então o `fetch` do arnês mandava todo
read-back **sem `$filter`** e recebia sempre o primeiro registro da coleção. Uma sonda
separada provou que `scheduleId eq <guid>` filtra certo — três schedules, três entradas,
uma cada. Corrigido o arnês, os três `entryId` saíram distintos. **Um arnês escrito à mão
é código sem teste**, e este errou exatamente onde ninguém olharia.

---

## 6. O que fica decidido

- Escrita aceita e confirmada é **aviso**, não falha — em `create` e em `settle`.
- O `scheduleId` e o `entryId` saem em campo, e sobrevivem ao `continueOnFail`.
- O caso **em aberto** deixa de passar batido: vira erro com sentença própria.
- A janela de espera não é prova de nada, e não foi recalibrada por isso.
- Os cinco lugares de 1.7 que sofrem do mesmo defeito ficam para a 0.17.1.
