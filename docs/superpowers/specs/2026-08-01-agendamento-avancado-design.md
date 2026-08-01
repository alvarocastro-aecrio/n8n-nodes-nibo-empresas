# 0.15.0 — Agendamento que já nasce cobrado, notado e repetido

**Data:** 2026-08-01 · **Estado:** desenho aprovado pelo Alvaro, **nada medido ainda** —
a seção 8 é a lista do que precisa ser medido antes de existir código.

---

## 1. O que a versão entrega

Criar um agendamento no Nibo hoje cria uma linha e para aí. Quem quer boleto emite depois,
com o recurso Collection; quem quer nota emite depois, com o Service Invoice; quem quer
doze mensalidades cria doze agendamentos.

A API não exige nada disso. **O mesmo `POST` que o node já usa aceita quatro blocos a mais**,
e é o que esta versão passa a oferecer:

| Bloco | O que faz |
|---|---|
| **Boleto** | O agendamento nasce com a cobrança programada — na hora, ou tantos dias antes do vencimento |
| **Nota fiscal** | O agendamento nasce com a NFS-e programada — na hora, dias antes, quando a baixa for feita, ou quando o boleto for criado |
| **Recorrência** | Uma criação, e o Nibo repete o agendamento no intervalo pedido |
| **Parcelamento** | Uma criação, e o Nibo abre as parcelas, cada uma com seu vencimento e seu valor |

Tudo na operação **Create**. O *Get*, o *Get Many* e o *Delete* não mudam, e o **Update
também não** — a API só aceita esses blocos numa criação.

Nada some da tela e nada muda de lugar. Os três gatilhos nascem respondidos com "não",
e um node salvo na 0.14.2 continua criando exatamente o mesmo agendamento.

---

## 2. O que a API oferece

### 2.1 Medido em 2026-08-01, com sonda direta

| Sonda | Resposta | O que isso quer dizer |
|---|---|---|
| `GET /installments/{guid-zerado}` | **500** `validation_error` — *"Parcelamento não encontrado"* | A rota **existe**: erro de negócio só nasce onde há rota |
| `GET /installments/{guid-zerado}/schedules` | **500**, mesma frase | Existe também — é por onde as parcelas irmãs são lidas |
| `GET /installments` | 404 *"Resource not found"* | Não há coleção de parcelamentos |
| `GET /recurrences`, `/recurrences/{id}`, `/schedules/recurrences` | 404, todas | **A recorrência não tem ID nem lista nesta API** |
| `GET /$metadata`, `/swagger/docs/v1`, `/swagger/v1/swagger.json` | 404 | Não há esquema publicado para conferir contra |
| `GET /public/collections-profiles` (cobaia) | 200 `{"items":[],"count":0}` | A cobaia **não emite boleto** |
| `GET /nfse/serviceprofiles` (cobaia) | 200 `{"items":[],"count":0}` | A cobaia **não emite NFS-e** |
| `GET /public/collections-profiles` (produção) | 1 perfil — PJBank, BankSlip, multa 2%, juros 1% ao mês | A exceção declarada só pode ser lá |
| `GET /nfse/serviceprofiles` (produção) | ≥ 1 perfil — ISS 5% | idem |
| `$filter=hasRecurrence eq false` (produção) | 38.962 de 38.962 | O filtro funciona, e essa organização não usa recorrência |
| `$filter=hasInstallment eq true` | 500 | `hasInstallment` **não** é filtrável |

O registro que a leitura devolve já carrega, e ninguém tinha reparado:
`hasInstallment`, `hasRecurrence`, `hasInvoice`, `hasPendingInvoice`, `hasScheduleInvoice`,
`autoGenerateNFSeType`, `autoGenerateCollectionType`, `serviceProvisionLocationType`,
`hasEntryPromise`, `hasOpenEntryPromise`, `lastEntryPromise`, `autoGenerateEntryPromise`
e `isPaymentScheduled`. Numa amostra **sem** parcelamento **não** há `installmentId` —
se ele existe, existe só quando há parcelamento, que é o que a documentação afirma.

### 2.2 Da documentação — **não medido**

Fonte: <https://nibo.readme.io/reference/agendar-recebimento> e a variante `-json`,
lidas em 2026-08-01. Tudo abaixo é palavra da Nibo, não medição deste projeto.

**Objeto `collection`** — a automação do boleto:

| Chave | Valores |
|---|---|
| `AutoGenerateCollectionType` | **2** = X dias antes do vencimento · **3** = imediatamente |
| `DaysBeforeDueDateToGenerateCollection` | os X dias, obrigatório quando o tipo é 2 |
| `CollectionProfileId` | o perfil de cobrança |
| `deliveryType` | **0** = e-mail · **1** = integração do contador (padrão 0) |

⚠️ A documentação escreve três chaves em maiúscula e uma em minúscula. O node já apanhou
disso: o corpo de criação de cobrança do recurso Collection é o único desta API em
PascalCase. **A grafia é item de medição** (8.5).

**Campos de NFS-e, na raiz do corpo:**

| Chave | Valores |
|---|---|
| `autoGenerateNFSeType` | **2** = X dias antes · **3** = quando a baixa for realizada · **4** = quando o boleto for criado · **5** = enviar imediatamente |
| `daysBeforeDueDateToGenerateNFSe` | os X dias |
| `serviceProfileId` | o perfil de serviço |
| `additionalServiceDescription` | preenche o `{{Descricao}}` do perfil |
| `additionalRemarks` | informações complementares |
| `cityWhereServiceWasProvided` / `stateWhereServiceWasProvided` | prestação em outro município |

Cinco dessas seis a operação **Service Invoice → Issue** já pede hoje, com estes mesmos
nomes. `additionalRemarks` é a única nova.

**Objeto `recurrence`:** `enabled`, `intervalType` (0 dia · 1 semana · 2 mês · 3 ano),
`interval`, `recurrenceEndType` (0 indeterminado · 1 por ocorrências · 2 por data),
`maxOccurrences`, `endDate`.

**Array `instalment`** — com um "l" só, na grafia da documentação — uma entrada por parcela:
`installmentNumber`, `value`, `dueDate` obrigatórios; `description`, `scheduleDate`,
`accrualDate`, `reference` opcionais.

**A documentação diz que `recurrence` e `instalment` não vão juntos no mesmo pedido.**

**No débito** (`POST /schedules/debit`) existem `recurrence` e `instalment`, e **não**
existem `collection` nem os campos de NFS-e. Faz sentido: boleto e nota são coisas que se
emitem para o cliente.

**Leitura das parcelas:** `GET /installments/{id}` devolve
`{installmentId, divideTotalValue, totalOfInstallments, totalValue}`, e
`GET /installments/{id}/schedules` devolve a lista de
`{scheduleId, dueDate, scheduleDate, accrualDate, value, installmentNumber}`.

**Da central de ajuda:** a recorrência **provisiona até 36 meses à frente**; o parcelamento
vai até **100 parcelas** e aparece no Nibo com a etiqueta *"Parcelado — X/Y"*. Nem
recorrência nem parcelamento viram um no outro depois de criados.

---

## 3. As cinco decisões do Alvaro

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Escopo | Os quatro blocos, **parcelamento incluído** |
| 2 | Como a tela pergunta | **A tela pergunta** — gatilho na tela, e os campos daquela resposta nascem sozinhos (o jeito do `Return All` → `Limit`), e não caixa de `+ Add Field` |
| 3 | O que sai do node | **Um item por criação**, com as parcelas irmãs listadas dentro dele |
| 4 | Até onde ir no aceite | **Boleto real e nota real** na empresa de produção, exceção declarada |
| 5 | Como informar as parcelas | **O node calcula** a partir de quantidade e intervalo, **e** existe o modo de digitar linha a linha |

---

## 4. A tela, campo por campo

Rótulos em inglês, como manda a decisão 9 do projeto. Todos só em **Create**.

### 4.1 `Generate Boleto` — só em Schedule - Credit

*Don't generate* (padrão) · *Immediately* · *A number of days before the due date*

Escolhendo qualquer um dos dois últimos, nascem:

- **`Collection Profile`** — a lista que `loadCollectionProfiles` já carrega. Obrigatório.
- **`Delivery`** — *By E-Mail* · *Through the Accountant* · *Leave It to Nibo*, exatamente as
  três do recurso Collection, com os mesmos textos já corrigidos na 0.13.1: **as duas
  primeiras enviam**, a escolha é por onde sai.

Só no "dias antes" nasce também **`Days Before Due Date`**.

### 4.2 `Issue Invoice (NFS-e)` — só em Schedule - Credit

*Don't issue* (padrão) · *Immediately* · *A number of days before the due date* ·
*When the receipt is settled* · *When the boleto is generated*

Escolhendo qualquer coisa que não seja "don't", nascem:

- **`Service Profile`** — a lista de `loadServiceProfiles`. Obrigatório.
- **`Invoice Fields`**, caixa opcional com `Service Description`, `Additional Remarks`,
  `City Where Service Was Provided`, `State Where Service Was Provided` — os nomes que a
  operação *Issue* já usa, porque são os mesmos campos da mesma API.

Só no "dias antes" nasce **`Days Before Due Date`**.

*When the boleto is generated* depende de existir boleto, e **o node não recusa** essa
escolha quando o bloco do boleto está em "don't": o boleto pode nascer depois, na mão,
dentro do Nibo. Isso fica dito na descrição da opção, não numa recusa.

### 4.3 `Repeat` — nas duas famílias

*Don't repeat* (padrão) · *Recurrence* · *Installments*

**Uma pergunta com três respostas**, e é isso que torna a combinação que a API recusa
inalcançável pela tela — o mesmo raciocínio do `Apportion By`, que é uma caixa e não duas.

**Recurrence** abre `Repeat Every` (1) + `Interval` (*Day* · *Week* · *Month* · *Year*,
padrão Month), `Ends` (*After a number of occurrences* · *On a date* · *Never*) e, conforme
a resposta, `Occurrences` ou `End Date`.

**Installments** abre `Installments Are`:

- ***Generated*** → `Number of Installments`, `Every` + `Interval`, e `Amount`
  (*Split the total across the installments* · *Repeat the amount on every one*).
  **A parcela 1 vence no `Due Date` que já está na tela** — nenhuma data se repete.
  **"O total" é a soma das linhas de `Categories`**, que é como esta API declara o valor de
  um agendamento: ela não guarda total nenhum. O que cada uma das duas escolhas realmente
  produz no corpo depende da medição 8.4.
- ***Listed one by one*** → a tabela fiel à API: número, vencimento, valor e os opcionais.

Os rótulos `Repeat Every` e `Interval` aparecem nos dois caminhos, o da recorrência e o das
parcelas geradas, e **os nomes de parâmetro por baixo são distintos**. Rótulo é palavra;
nome de parâmetro é contrato, e dois caminhos diferentes nunca dividem um.

---

## 5. O payload

O que a tela coletou vira exatamente o que a seção 2.2 descreve. Regra que já é do node e
continua valendo: **um bloco em "don't" não põe chave nenhuma no corpo**, e um agendamento
criado sem tocar em nada sai byte por byte igual ao da 0.14.2.

| Tela | Corpo |
|---|---|
| Generate Boleto = *Immediately* | `collection.AutoGenerateCollectionType = 3` |
| Generate Boleto = *days before* | `= 2` + `DaysBeforeDueDateToGenerateCollection` |
| Collection Profile / Delivery | `CollectionProfileId` / `deliveryType` |
| Issue Invoice = *Immediately* | `autoGenerateNFSeType = 5` |
| Issue Invoice = *days before* | `= 2` + `daysBeforeDueDateToGenerateNFSe` |
| Issue Invoice = *when settled* | `= 3` |
| Issue Invoice = *when the boleto is generated* | `= 4` |
| Service Profile e a caixa Invoice Fields | as cinco chaves de NFS-e na raiz |
| Repeat = *Recurrence* | `recurrence.enabled = true` + intervalo, término e o que ele pedir |
| Repeat = *Installments*, modo *Generated* | o array `instalment` **montado pelo node** |
| Repeat = *Installments*, modo *one by one* | o array `instalment` como foi digitado |

**A conta que gera as parcelas** parte do `Due Date` da tela e soma o intervalo pedido, uma
vez por parcela. Dois cuidados que os testes têm de cobrir: **mês curto** — 31/01 + 1 mês
cai em 28 ou 29/02, e a parcela seguinte volta a ser dia 31, não continua no 28 — e o
**centavo que sobra** na divisão, que vai todo na primeira parcela, para que a soma feche.

---

## 6. O que sai do node

Um item por criação, sempre — o agendamento lido de volta, como já é hoje. Com dois acréscimos:

- **Parcelamento:** o item ganha `installment`, com `installmentId`, `totalOfInstallments`,
  `totalValue`, `divideTotalValue` e **a lista das irmãs**, lida de
  `GET /installments/{id}/schedules`.
- **Recorrência:** o item ganha `_niboRecurrenceNotListed`, dizendo que o Nibo criou as
  ocorrências e que **esta API não tem rota que as liste** (medido: `/recurrences` é 404).
  É o hábito que o node já tem com `_niboPaginationWarning`, `_niboAuthorizationPending` e
  `_niboCancellationPending`: **aviso é dado, nunca erro**.

A leitura das irmãs é enriquecimento, não confirmação: se ela falhar, a criação **continua
tendo dado certo** e o item sai sem a lista. Falhar ali mandaria o fluxo tentar de novo, e
tentar de novo cria outro parcelamento.

---

## 7. O que o node recusa antes de mandar

Cedo, enquanto ainda é barato, e só o que dá para saber sem perguntar à API:

1. `Days Before Due Date` vazio, zero ou negativo, quando o gatilho escolhido pede.
2. Recorrência *On a date* sem `End Date`, ou com data anterior ao vencimento.
3. Recorrência *After a number of occurrences* sem número, ou com número zero ou negativo.
   **Uma ocorrência só não é recusada**: é o mesmo que não repetir, e a API a aceita — o
   node não inventa regra de negócio que a API não tem.
4. Parcelamento *Generated* com menos de 2 ou mais de 100 parcelas. Aqui a recusa **é** do
   node: dividir um valor em uma parte só é contradição na própria pergunta, e o teto de
   100 é o que a central de ajuda da Nibo declara.
5. Parcelamento *one by one* com linha sem vencimento, sem valor, ou com números repetidos.
6. Recorrência **e** parcelamento no mesmo pedido — inalcançável pela tela, alcançável por
   expressão. A API recusa; o node diz antes e explica que se escolhe um dos dois.

Não há checagem prévia de perfil: numa criação não existe cobrança anterior para tropeçar,
e o perfil é campo obrigatório da tela. **O que a API recusar ganha a tradução de sempre**,
no molde do `aboutTheCategory` — e as frases exatas só se conhecem depois de medir.

---

## 8. O que precisa ser medido antes de existir código

Nada abaixo é sabido, e o desenho inteiro assume respostas. Esta lista vira a primeira
fatia do `PLAN-v0.15.0.md`.

1. **A rota simples aceita os blocos?** O node usa `POST /schedules/credit`, sem
   `/FormatType=json`. A documentação mostra os campos nessa rota; a variante `-json` da
   página mostra a rota sufixada. Se só a sufixada aceitar, muda o transporte.
2. **O que o POST devolve quando cria vários?** Hoje ele devolve um GUID pelado, e o node
   relê por ele. Com seis parcelas, qual dos seis vem? A documentação chega a dizer que a
   resposta é `{}`, o que contradiz o que este projeto mediu. O read-back depende disso.
3. **O agendamento criado com parcelas carrega `installmentId`?** É o que a documentação
   afirma e é a única porta para as irmãs. Uma amostra sem parcelamento não tem a chave.
4. **As parcelas somam as categorias, ou cada parcela repete o valor delas?** É o que
   decide o que *Split* e *Repeat* fazem com o valor — e há um `divideTotalValue` no
   registro do parcelamento sugerindo que o Nibo pensa nos dois casos.
5. **A grafia.** `instalment` com um "l" só; `AutoGenerateCollectionType` em maiúscula ou
   minúscula. Esta API mistura as duas convenções e aceita-e-ignora o que não reconhece —
   o pior dos dois mundos, e a razão de isto ser item de medição e não de leitura.
6. **Um Update mexe na automação?** O ciclo seguro relê o registro e o devolve inteiro, e
   o registro carrega `autoGenerateNFSeType` e `autoGenerateCollectionType`. Ninguém olhou
   o que o `PUT` faz com essas chaves. Se mexer, o `writeBody` do update tem de tirá-las.
7. **"X dias antes" não dispara na hora**, com vencimento distante. Metade do aceite
   depende disso ser verdade.
8. **Quantos agendamentos uma recorrência cria de fato**, e se `hasRecurrence` fica `true`
   em todos ou só no primeiro.

Regra da sonda, que já custou caro a este projeto uma vez: **o que a sonda criar, ela
anota o ID na hora** — há coleção nesta API sem `GET` nenhum, e quem não guarda o ID perde
o registro para sempre.

---

## 9. Arquivos e testes

`schedule/description.ts` tem 739 linhas e é o maior arquivo do pacote; com os três blocos
dentro, dobrava. Então os blocos saem dele:

| Arquivo | O que carrega |
|---|---|
| `schedule/automation.ts` *(novo)* | Os campos de boleto e de nota, e o pedaço de payload dos dois |
| `schedule/repeat.ts` *(novo)* | Recorrência e parcelamento, e a conta que gera as parcelas |
| `schedule/description.ts` | Passa a montar a tela chamando os dois |
| `schedule/execute.ts` | Junta os pedaços ao corpo, e lê as parcelas irmãs |

Testes novos por módulo, no padrão do pacote. O gerador de parcelas é onde a aritmética
mora, então é onde os testes têm de doer: 31/01 em diante, ano bissexto, divisão que não
fecha em centavos, e a soma das parcelas conferindo com o total.

---

## 10. O aceite

**Na cobaia**, à vontade: recorrência, parcelamento nos dois modos, os dois no débito, e
todas as recusas da seção 7. E, de graça, a **recusa** dos blocos de boleto e de nota —
uma cobaia não tem perfil nenhum, então é ali que se prova que a mensagem do node presta.

**Na produção — exceção declarada à regra 3, escrita no plano antes de rodar**, no molde do
que a 0.13.0 e a 0.14.0 já fizeram:

- Contato combinado com o Alvaro, valor **R$ 1,00**.
- Boleto imediato → confere o registro → **cancela**.
- Nota imediata → confere → **cancela na prefeitura**. Custo aceito e escrito: uma NFS-e
  fica para sempre no histórico fiscal da empresa, marcada Cancelada. Nota fiscal não se apaga.
- Os gatilhos que não disparam ("dias antes", "quando a baixa", "quando o boleto"), criados,
  conferidos no registro e apagados **antes de qualquer vencimento chegar perto**.

O aceite se faz **dirigindo os handlers de `dist/`**, nunca com `curl` — foi assim que a
0.9.0 achou o defeito que 830 testes verdes não acharam. Cobaia zerada no fim.

---

## 11. Fora de escopo, e por quê

- **Update com esses blocos.** A API não aceita: eles são de criação. O que entra no plano
  é só a medição 8.6, que é sobre não estragar o que já existe.
- **Encerrar ou alterar uma recorrência.** Não há rota (`/recurrences` é 404). Quem precisa
  encerrar faz pela tela do Nibo.
- **Ler as ocorrências de uma recorrência.** Mesma razão, e é por isso que existe o aviso
  da seção 6 em vez de uma lista.
- **Um recurso `Installment` próprio,** com Get e Get Many das parcelas. As duas rotas
  existem e ficam medidas nesta versão; virar recurso é conversa da 0.16.0, se fizer falta.
