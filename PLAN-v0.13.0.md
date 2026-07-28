# PLANO DE IMPLEMENTAÇÃO — v0.13.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público: nenhum nome de cliente, ID de
> workflow, ID de credencial — e **nenhum token**.

**Escopo da v0.13.0:** **Collections** — as cobranças (boleto e Pix) que o Nibo emite a partir
de um agendamento a receber. É um pedaço do item 8 do anexo A.2 do contrato, puxado para a
frente por decisão do Alvaro em 2026-07-28.

**Por que fora de ordem.** É a segunda vez que a ordem do anexo A.2 cede a uma decisão de uso —
a primeira foi a fatia 6 (contas) passar na frente da 5 (arquivos), na 0.11.0. A ordem do
contrato é por dependência técnica, e nenhuma das duas fatias que sobraram depende da outra.

**Por que 0.13.0:** capacidade nova é minor, que é a regra escrita do projeto.

**Criar e cancelar cobrança entram**, e isso mudou duas vezes no mesmo dia. A cobaia **não
emite** (1.1), então a escrita ficaria fora; em 2026-07-28 o Alvaro abriu uma **exceção
explícita à regra inviolável 3** — emitir cobranças de R$ 10 numa empresa de produção, sobre um
contato de teste no nome dele, uma de cada `deliveryType`. Medido em 1.13 a 1.17, **com resíduo
zero**: as duas cobranças canceladas e os dois agendamentos apagados.

**Cinco operações, então:** `Get Many`, `Get`, `Get Many Profiles`, `Create` e `Cancel`.

**Também fora de escopo:** NFS-e (fatia 7) e os demais auxiliares (Banks, Users,
Organizations) — ver a decisão 3 em aberto, na seção 7.

---

## 1. Medições — o que a API respondeu

Duas fontes, ambas de **2026-07-28** e ambas **inteiramente de leitura** — nenhum `POST`,
nenhum `DELETE`, nenhuma escrita de nenhum tipo saiu de nenhuma das duas:

| Fonte | O que deu | Por quê |
|---|---|---|
| **Cobaia** | O **schema** (1.3) e as regras de consulta (1.4 a 1.8) | A coleção está vazia, mas a API valida a expressão contra o **tipo** |
| **Empresa de produção**, com 5 cobranças de sonda de 2019 | O **registro de verdade** (1.3), os valores de `status` (1.5) e o link público (1.12) | Leitura em produção é permitida pela regra 3, que proíbe **escrita**. Autorizada explicitamente pelo Alvaro em 2026-07-28 |

A segunda fonte existe porque a primeira não bastava, e ela **corrigiu uma conclusão da
primeira** — ver 1.5, que é o achado mais importante desta seção.

### 1.1 🔴 A cobaia não emite cobrança — e foi por isso que a medição saiu dela

```
GET /public/collections-profiles  →  200  {"items":[],"count":0}
```

**Zero perfis.** E `CollectionProfileId` é **obrigatório** no corpo da criação — vem só dessa
rota. Um perfil de cobrança não é um cadastro que se cria pela API: ele amarra um **provedor
bancário** (na produção, Cora) à empresa. Configurar um na cobaia significaria contratar
emissão de boleto para uma empresa de teste.

O cerco fecha assim:

| Caminho para medir a escrita | Por que não serve |
|---|---|
| Emitir na **cobaia** | Não há perfil, e criar um exige provedor bancário contratado |
| Emitir numa **empresa real** | **Regra inviolável 3** — escrita só na cobaia. Suspensa por exceção explícita do Alvaro em 2026-07-28, para R$ 10 sobre um contato de teste no nome dele; ver a decisão 2 da seção 7 |
| Deduzir dos workflows | O corpo é conhecido (está no `payloads.md`), mas **payload conhecido não é comportamento medido** — é o erro que este projeto já pagou caro |

Então a escrita não entra pela cobaia. Não é cautela: é que ali **não existe o que medir**.

**Para contraste, a empresa de produção tem exatamente um perfil**, e ele responde assim:

```json
{ "paymentMethods": [{ "paymentForm": "BankSlip", "provider": "PJBank" }] }
```

⚠️ **`paymentMethods` não é a lista de formas de pagamento que o tomador vê.** Ler `BankSlip`
ali e concluir *"esta empresa não faz Pix"* é errado — e foi o que este plano concluiu antes de
o Alvaro corrigir em 2026-07-28: **todo boleto emitido já sai com o QR de Pix junto**,
automaticamente. O campo descreve o **meio de emissão** (quem imprime o boleto, e por qual
provedor), não o que o pagador pode escolher.

É a terceira vez neste documento que um campo lido isoladamente sugere uma ausência que não
existe — ver 1.5, e o gotcha 14 do projeto.

### 1.2 A coleção da cobaia está vazia — e foi a leitura em produção que fechou o buraco

```
GET /public/collections?$top=5000        (cobaia)     →  200  {"items":[],"count":0}
GET /public/collections?$top=500         (produção)   →  200  count=5
```

Sem um único registro, três coisas não tinham como ser medidas na cobaia: o **formato do
registro**, os valores de **`status`** e se os links são **públicos**. As cinco cobranças de
sonda de 2019 da empresa de produção responderam as três — e a segunda derrubou uma conclusão
que já estava escrita neste plano (1.5).

**Lição que fica registrada:** o schema medido contra uma coleção vazia diz o que a API
**aceita perguntar**, e não o que ela **devolve**. As duas coisas não coincidem aqui, e a 1.3
mostra a diferença campo a campo.

### 1.3 O schema inteiro, medido com a coleção vazia

Dá para mapear os campos sem ter registro nenhum, porque a API valida a expressão contra o
**tipo**, não contra os dados. Três respostas distinguem tudo:

| Resposta ao `$orderby=<campo>` | Significa |
|---|---|
| **200** | existe, e é primitivo |
| 500 *"must evaluate to a single value of primitive type"* | **existe, e é complexo** |
| 500 *"Could not find a property named 'X'"* | não existe |

É uma técnica que serve para qualquer coleção desta API antes de haver dados, e vale registrar
por isso. O resultado, de 33 nomes tentados:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | primitivo | A chave de paginação (1.4) |
| `scheduleId` | primitivo | O agendamento cobrado — a ligação que resolve a 1.9 |
| `stakeholderId` | primitivo | Quem paga |
| `collectionProfileId` | primitivo | O perfil que emitiu |
| `value` | primitivo | |
| `paidValue` | primitivo | Quanto foi pago |
| `dueDate` | primitivo | |
| `createDate` | primitivo | |
| `lasStatusChangeDate` | primitivo | **Com o erro de digitação da API** (1.6) |
| `description` | primitivo | O único campo de texto, e ele aceita `contains` e `tolower` |
| `url` | primitivo | O link da cobrança |
| `pdf` | primitivo | O boleto |
| `status` | 🔴 **complexo** | Não compara — ver 1.5 |

#### O registro que a API realmente devolve — e ele não é o mesmo conjunto

Medido nos 5 registros da empresa de produção. **Dezoito campos**, e cinco deles não estavam
em nenhuma lista de candidatos porque não havia como adivinhá-los:

| Campo | Nota |
|---|---|
| `debtor` `{document, name}` | Quem deve — **complexo**, e filtra por `debtor/name` e `debtor/document` |
| `beneficiary` `{document, name}` | Quem recebe — filtra por `beneficiary/name` |
| `createUser` | O nome de quem emitiu, como texto |
| `deliveryStatus` `{code, description}` | O ciclo de entrega do boleto: `0` *Não entregue*, `2` *Visualizada* |
| `accountantIntegrationStatus` `{code, description}` | Integração contábil |

E a assimetria que importa para o desenho: **`collectionProfileId` e `pdf` filtram mas quase
nunca vêm no registro** — `pdf` apareceu em 1 dos 5 —, enquanto `debtor`, `beneficiary`,
`createUser`, `deliveryStatus` e `accountantIntegrationStatus` vêm sempre e não estavam no
schema tentado. O tipo que a API expõe ao `$filter` **não é** o DTO que ela devolve.

**Não existem**, e valem estar escritos para ninguém tentar de novo: `organizationId`,
`amount`, `paymentDate`, `paidDate`, `cancelDate`, `issueDate`, `isPaid`, `isCanceled`,
`isActive`, `deliveryType`, `type`, `barcode`, `digitableLine`, `ourNumber`, `number`,
`documentNumber`, `paymentForm`, `provider`, `paymentMethod`, `customerId`, `stakeholder`,
`customer`, `payer`, `name`, `identifier`, `email`.

Duas ausências chamam atenção: **`deliveryType` some na leitura** — é campo só de escrita — e
**não há data de pagamento**, embora haja `paidValue`. Dá para saber quanto foi pago e não
quando.

### 1.4 A chave de paginação é `id`, e `$skip` sem `$orderby` é 500

Como em quase toda coleção desta API. `collectionId` **não existe** — é o nome que se tentaria
primeiro, pela analogia com `scheduleId` e `costCenterId`, e é 500.

Respondem 200 como chave: `id`, `dueDate`, `value`, `scheduleId`, `createDate`,
`lasStatusChangeDate`. Vale o gotcha 16 de sempre: **200 não prova que ordenou**, e com a
coleção vazia não houve como provar. `id` é a escolha pela mesma razão de sempre — é a única
que é única.

### 1.5 🔴 `status` **filtra** — e a primeira versão desta seção dizia o contrário

**Esta é a correção mais importante do documento, e ela é minha.** A sondagem contra a coleção
vazia tentou `status/id`, `status/name` e `status/value`, levou 500 *"Could not find a
property"* nas três, e este plano concluiu *"status não é uma condição possível"*.

**Faltou `status/code`.** Medido contra a empresa com dados:

| Expressão | Resposta |
|---|---|
| `$orderby=status` | 500 *"must evaluate to a single value of primitive type"* — é complexo |
| `$orderby=status/code` · `$filter=status/code eq 3` | ✅ **200** — `count=2` |
| `$filter=status/code ne -1` | ✅ 200 |
| `$filter=status eq 'Ativa'` · `status eq 1` | 500 *"incompatible types"* |
| `$orderby=status/id` · `/name` · `/value` | 500 *"Could not find a property"* |
| `$orderby=status/description` · `$filter=status/description eq 'Paga'` | 500 *"O Nibo se comportou de forma inesperada."* |

**É o gotcha 14 do projeto de novo**, palavra por palavra: *um 404 prova a ausência daquele
CAMINHO, nunca a ausência da capacidade*. Foi assim que a família de escrita de categorias
apareceu atrás de quatro 404 na 0.9.0, e foi assim que este plano quase deixou de fora
justamente o filtro que todo mundo quer — *me dê as cobranças em aberto*.

**Os códigos medidos:** `status` → `3` *Paga*, `-1` *Cancelada*, e depois `1` *Ativação
pendente* (1.15) e `0` *Em fila de geração* (1.18). `deliveryStatus` → `0` *Não entregue*, `2`
*Visualizada*. Os demais não apareceram e ficam por confirmar — e a 1.18 é a razão de o node
dizer, no próprio campo, que a lista é o que foi medido.

`deliveryStatus/code` e `accountantIntegrationStatus/code` também ordenam e filtram, pela mesma
porta.

### 1.6 O erro de digitação está na API, e foi confirmado

| `$filter` | Resposta |
|---|---|
| `lasStatusChangeDate ge 2020-01-01` | **200** |
| `lastStatusChangeDate ge 2020-01-01` | 500 *"Could not find a property named 'lastStatusChangeDate'"* |

Falta o `t` de *last*, na propriedade do servidor. Quem escrever certo toma 500.

### 1.7 GUID compara sem aspas — o gotcha 15 vale aqui também

| Expressão | Resposta |
|---|---|
| `scheduleId eq <guid>` | **200** |
| `scheduleId eq '<guid>'` | 500 *"Found operand types 'Edm.Guid' and 'Edm.String'"* |
| `ScheduleId eq <guid>` (maiúscula) | 200 — o nome da propriedade não é sensível a caixa |

### 1.8 Não existe get-by-id

| Rota | Resposta |
|---|---|
| `GET /public/collections/{id}` | **404** |
| `GET /collections/{id}` | 404 |
| `GET /public/collections-profiles/{id}` | 404 |
| `GET /public/collections?$filter=id eq <guid>` | **200** |

Mesma situação da categoria na 0.9.0: o Get se faz pela lista filtrada por ID, e um envelope
vazio é o que "não encontrado" significa numa operação que pediu um registro.

### 1.9 A ponta solta do contrato (2.6), resolvida

O contrato registrava um endpoint em uso que responde 404 e pedia que não se implementasse nada
antes de achar o caminho atual. Medido:

```
GET /schedules/credit/promise                          →  404  (corpo em texto, não JSON)
GET /public/collections?$filter=scheduleId eq <guid>   →  200
```

**O caminho atual é o filtro por `scheduleId`**, exatamente como o contrato supunha. Fica
provado, e é o que o `Get Many` desta versão entrega.

### 1.10 O 404 de rota inexistente é uma quinta forma de corpo de erro

`{"statusCode":404,"message":…}` — não é o `{error, error_description}` de sempre, não é o
texto puro do 429, não é o HTML do 411, não é o `application/problem+json` do serviço de
arquivos. O `classifyNiboError` cai no ramo `unknown` e mostra a mensagem do helper, que para
um 404 já é legível. **Nada a fazer**, mas fica registrado.

### 1.11 O prefixo `/public/`

Único grupo de rotas da API com prefixo diferente. Não muda nada no transporte — o endpoint é
uma string que o recurso monta —, mas é a primeira coisa que faz alguém achar que errou o
caminho.

### 1.12 🔴 O `url` da cobrança é público

Medido com `fetch` limpo, sem header nenhum: **200, `text/html`, sem redirect**. É a página de
pagamento do boleto, e ela abre para quem tiver o link — sem token, sem cookie, sem nada.

Diferente do `arquivos.nibo.com.br` da 0.12.0, que responde 302 para um SAS do Azure: aqui o
próprio endereço serve a página. O efeito para quem usa é o mesmo, e a frase na tela também:
**quem tem a `url` tem a cobrança**.

Todos os 5 registros trazem `url`. `pdf` veio em 1 dos 5 (1.3).

### 1.18 O quarto código de status apareceu no aceite, horas depois

`0` *"Em fila de geração"*. A sonda de escrita da 1.15 tinha visto as duas cobranças nascerem em
`1` *"Ativação pendente"*; o aceite, no dia seguinte, viu uma nascer em `0`.

Ou seja: **há mais de um estado de nascimento**, e a lista de códigos que este projeto conhece
cresceu depois de o plano estar escrito e o código construído. Nada quebrou, e a razão é a
decisão de dizer na tela que a lista é *o que foi medido* e não *o que existe* — a caixa de
Filter (OData) continua sendo a saída para um estado que não esteja nela.

É a mesma família do gotcha 14, vista de outro ângulo: não achar um valor não prova que ele não
exista.

### 1.13 A criação: 200 com o ID entre aspas

`POST /public/collections`, corpo `{ScheduleId, DueDate, CollectionProfileId, deliveryType}` →
**200 com o GUID entre aspas**, como string JSON. É a mesma forma do `POST /schedules/credit` e
do `POST /accounts`: GUID nu, sem envelope.

### 1.14 🔴 Um agendamento tem no máximo UMA cobrança

A segunda emissão sobre o mesmo agendamento é recusada:

```
POST /public/collections   →  500  validation_error
                               "Não é possível criar mais de uma cobrança por agendamento"
```

**Isso fecha a ponta solta 2.6 do contrato por outro lado.** A pergunta era como listar os
boletos de um agendamento; a resposta é que **nunca há mais de um**. O filtro por `scheduleId`
(1.9) devolve 0 ou 1, sempre.

### 1.15 O `deliveryType` não aparece na leitura, e os dois nascem iguais

As duas cobranças — uma com `deliveryType: 1` (retida) e outra com `0` (régua) — nasceram
**idênticas** aos olhos da API:

```
status  {"code":1,"description":"Ativação pendente"}
entrega {"code":0,"description":"Não entregue"}
```

Igual logo depois e igual 4 segundos depois. O campo é **só de escrita** (1.3 já mostrava que
ele não volta no registro) e o efeito dele — o e-mail e a régua — acontece fora do que a
leitura enxerga. **Consequência para o node:** não há como confirmar, relendo, se o boleto foi
enviado ou retido. Quem escolhe o `deliveryType` está tomando uma decisão que a API não devolve.

Com isso, o terceiro código de `status` fica conhecido: **`1` Ativação pendente**, além do `3`
Paga e do `-1` Cancelada da 1.5.

### 1.16 🔴 A rota de cancelar existe, e **não é** o `DELETE` do catálogo

```
DELETE /public/collections/{id}       →  404  {"statusCode":404,"message":"Resource not found"}
POST   /public/collections/{id}/cancel →  204
```

O catálogo deste projeto listava `DELETE /public/collections/{id}` como o cancelamento, marcado
como não validado. **Ele não existe.** A rota real foi achada do mesmo jeito que a coleção de
transferência na 0.11.0: entre dez tentativas que responderam 404 *"Resource not found"* — que
fala da **rota** —, uma respondeu **500 *"A cobrança não pode ser cancelada"***, que fala do
**recurso**. Um erro de negócio só existe onde existe rota para produzi-lo.

Cancelar **não remove** o registro: ele fica na coleção com `status` `-1` *Cancelada*. E o
`url` continua respondendo depois (1.12).

### 1.17 Apagar o agendamento cancela a cobrança dele

Medido sem querer, e por isso registrado: a primeira sonda leu a cobrança como *Ativação
pendente*, apagou o agendamento, e a leitura seguinte trouxe ***Cancelada***. Nada mais tinha
acontecido no meio.

Ou seja, há **dois caminhos** para cancelar, e o segundo é um efeito colateral de outra
operação. Vale para quem apaga agendamento a receber achando que a cobrança fica de pé — e para
a limpeza de qualquer sonda futura.


---

## 2. Decisões de recorte

1. **Cinco operações:** `Get Many`, `Get`, `Get Many Profiles`, `Create` e `Cancel`. As duas
   últimas entram porque foram **medidas** (1.13 a 1.17), na exceção que o Alvaro abriu à regra
   3. Um payload copiado de workflow não teria bastado: foi a medição que mostrou que o
   `DELETE` do catálogo não existe (1.16) e que um agendamento só aceita uma cobrança (1.14).

2. **`Get Many Profiles` existe por duas razões.** O perfil é obrigatório na criação, e listar
   os perfis é a **única** forma de descobrir se uma empresa emite cobrança — foi assim que a
   1.1 descobriu que a cobaia não emite.

2b. **`Create` recusa antes de mandar quando o agendamento já tem cobrança** (1.14). Custa um
   `GET` e troca o *"Não é possível criar mais de uma cobrança por agendamento"* por uma frase
   em inglês que **nomeia a cobrança que já existe** — que é o que a pessoa precisa para decidir
   se cancela aquela ou desiste desta.

2c. **`Delivery` é uma escolha de duas opções, e o padrão é o que não manda nada.** O
   `deliveryType` decide se o Nibo **envia o boleto por e-mail ao tomador** e dispara a régua de
   lembretes (`0`) ou se o retém na tela de conferência (`1`). O padrão do node é **`1`**, pela
   mesma regra do `Fail on Incomplete Results` e do `Allow Moving the Lock Back`: quando uma das
   opções sai para fora, a defesa é o que acontece quando ninguém escolheu nada. E o notice diz,
   com todas as letras, o que o `0` faz.

2d. **O node não promete o que não pode confirmar.** A 1.15 mediu que os dois `deliveryType`
   nascem idênticos na leitura — não há como reler e saber se o boleto foi enviado. A resposta
   do `Create` devolve o registro como a API o entrega e **não** afirma que algo foi enviado.

3. **`Get` é a lista filtrada por ID** (1.8), como em Category desde a 0.9.0. Envelope vazio
   vira "não encontrado" com o ID na frase.

4. **`status` entra no menu, por `status/code`** (1.5) — junto com `deliveryStatus/code`. É o
   filtro que todo mundo quer, e a primeira versão deste plano o tinha descartado por engano.
   O rótulo na tela é *Status*, os valores são oferecidos como uma lista de opções com o número
   e o nome (`3 — Paga`, `-1 — Cancelada`), e a descrição do campo diz que os códigos vistos até
   agora são esses e que o `status/description` **não** compara.
   Fora do menu ficam `url`, `pdf` e `collectionProfileId`: filtram, e filtrar por eles não
   quer dizer nada.

5. **A chave de paginação é `id`**, sempre injetada pelo transporte, porque `$skip` sem
   `$orderby` é 500 (1.4).

6. **`lasStatusChangeDate` entra com o nome errado que a API exige, e o rótulo na tela diz o
   certo:** *Last Status Change*. O nome da propriedade é contrato com o servidor; o rótulo é
   com quem lê.

7. **O aviso do link público entra, agora que está medido** (1.12): a `url` abre a página de
   pagamento sem token nenhum. Mesmo padrão da 0.12.0 — a frase fica no notice da operação que
   entrega o link, e no README.

8. **`Cancel` usa a rota que existe, e o notice diz o que ela deixa para trás** (1.16): o
   registro **não some**, fica com `status` `-1` *Cancelada*, e o `url` continua respondendo
   depois. O notice diz também o segundo caminho, que ninguém adivinha: **apagar o agendamento
   cancela a cobrança dele** (1.17).

9. **`Create` e `Cancel` não têm read-back de confirmação, e é decisão medida.** O `Create`
   devolve o GUID e a releitura mostra `Ativação pendente` — que é o mesmo estado para os dois
   `deliveryType`, então reler não confirma nada que a resposta já não diga. O `Cancel` responde
   204 e a releitura mostra `-1`, essa sim uma confirmação barata e real: fica.

8. **O README diz o que a versão não faz e por quê.** Alguém que instalar isto vai procurar
   como emitir boleto. A resposta — "não há onde medir a escrita dentro das regras deste
   projeto" — é mais útil do que a ausência silenciosa.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.13.0 |
|---|---|
| `resources/collection/description.ts` · `execute.ts` | **Novo.** As cinco operações, o menu de filtro medido, a guarda de uma-cobrança-por-agendamento e os notices do link público e do cancelamento |
| `transport/paginate.ts` | **Nada** — a chave `id` é parâmetro, e o envelope é o de sempre |
| `transport/request.ts` · `errors.ts` | **Nada** — o `/public/` é só uma string, e o 404 da 1.10 já sai legível |
| `resources/shared/filter.ts` | **Nada** — os tipos `date`, `number`, `text` e `guid` já existem |
| `NiboEmpresas.node.ts` | O recurso na lista, no handler e nos imports |
| Credencial | **Nada a fazer** — a lista sai de `RESOURCES.map(...)`, recurso novo entra sozinho |

---

## 4. Fatias, com teste antes do código

1. **`Collection · Get Many`, com o filtro assistido** *(commit próprio)*. Testes: a rota é
   `/public/collections`; a chave de paginação é `id`; o menu de filtro tem exatamente os
   campos medidos na 1.3 e **não** tem `status`; o GUID vai sem aspas (1.7); o campo com o erro
   de digitação viaja como a API o exige e o rótulo mostra o certo (1.6).

2. **`Collection · Get` e `Get Many Profiles`** *(commit próprio)*. Testes: o `Get` monta
   `$filter=id eq <guid>` e não chama `/public/collections/{id}`, que é 404; envelope vazio vira
   erro com o ID na frase; os perfis vêm da rota `-profiles` e uma lista vazia é dita como "esta
   empresa não emite cobrança", que é o que ela significa.

3. **`Collection · Create`** *(commit próprio)*. Testes: o corpo leva as quatro chaves em
   PascalCase menos o `deliveryType`, como a API quer; **o padrão do Delivery é reter, não
   enviar**; a guarda lê as cobranças do agendamento antes e **recusa sem mandar nada** quando já
   há uma, nomeando a que existe (1.14); o GUID entre aspas vira `collectionId` na saída (1.13);
   a resposta não afirma que algo foi enviado (1.15); o notice do envio existe e fala do e-mail.

4. **`Collection · Cancel`** *(commit próprio)*. Testes: chama `POST …/{id}/cancel` e **não** o
   `DELETE`, que é 404 (1.16); o 204 vira confirmação lida de volta; o notice diz que o registro
   fica com `Cancelada` em vez de sumir, que o link segue respondendo, e que apagar o agendamento
   cancela a cobrança junto (1.17).

5. **README, catálogo e bump 0.13.0** *(commit próprio)*. `endpoints.md`/`payloads.md`: o schema
   da 1.3 contra o registro real, o `status` que **filtra por `status/code`**, a ausência de
   get-by-id, o erro de digitação, **a rota de cancelar que substitui o `DELETE` errado do
   catálogo**, a regra de uma-cobrança-por-agendamento, e a **resolução da ponta solta 2.6**.
   `SKILL.md`: gotchas novos + triagem. A nota de ressincronização do `CLAUDE.md`.

---

## 5. Onde cada regra inviolável continua atendida

| Regra | Na v0.13.0 |
|---|---|
| 3 — escrita só na cobaia | ⚠️ **Exceção explícita do Alvaro em 2026-07-28**, registrada como tal: R$ 10, contato de teste no nome dele, numa empresa de produção, porque a cobaia não emite (1.1). Resíduo **zero** — as duas cobranças canceladas e os dois agendamentos apagados. É a segunda exceção declarada do projeto, depois do rótulo 0.11.x |
| 4 — nenhum token em código ou commit | Sondas leram de variável de ambiente |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| 6 — nada de caminho absoluto | Sondas descartáveis no scratchpad |
| Decisão 9 (projeto) — inglês | Campos, rótulos, notices, mensagens, README |
| 7 — instalação real | A 0.13.0 só fecha depois da tela Community Nodes |
| 8 — repo público | Este plano não nomeia cliente nem credencial |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` verdes antes de cada commit de fatia.

⚠️ **O aceite das duas operações de escrita roda na empresa de produção**, pela mesma razão e
sob a mesma exceção da seção 1: a cobaia não emite. Vale R$ 10, o contato de teste, e a mesma
limpeza que a sondagem fez — cancelar a cobrança e apagar o agendamento, conferindo os dois.

**O resto do aceite roda contra as duas empresas, e por quê.** O arranjo de sempre —
`IExecuteFunctions` real dirigindo os handlers de `dist/` — contra a **cobaia** prova o caminho
vazio (`count: 0`, e o "esta empresa não emite cobrança" da 1.1), e contra a **empresa com as 5
cobranças de sonda** prova a leitura do registro, os filtros por `status/code` e o link público.
Tudo de leitura: o aceite desta versão não escreve em lugar nenhum.

| ☐ | Item | Como conferir |
|---|---|---|
✅ **Aceite executado em 2026-07-28: 15/15, 22 chamadas, resíduo zero.** Uma cobrança de R$ 10
emitida com Delivery retido, cancelada, e o agendamento apagado — conferido.

| ☑ | `Get Many` chama `/public/collections` e pagina por `id` | Contra a cobaia |
| ☑ | O filtro por `scheduleId` monta o GUID **sem aspas** | Contra a cobaia — 500 se errar |
| ☑ | O filtro por `lasStatusChangeDate` responde 200 | É o teste do erro de digitação |
| ☑ | `Get` de um ID inexistente diz "não encontrado" com o ID | Contra a cobaia |
| ☑ | `Get Many Profiles` diz que a empresa não emite cobrança | A cobaia é exatamente esse caso (1.1) |
| ☑ | `Get Many` filtra por `status/code` e por `deliveryStatus/code` | Contra a empresa com dados — é o teste da 1.5 |
| ☑ | **Um registro de verdade é lido e os 18 campos batem** | Contra a empresa com dados (1.3) |
| ☑ | O notice diz que a `url` é pública | 1.12 |
| ☑ | `Create` emite, e o Delivery vem **retido** por padrão | Decisão 2c |
| ☑ | `Create` **recusa sem mandar nada** num agendamento que já tem cobrança | É o teste da 1.14, e a frase nomeia a que existe |
| ☑ | `Cancel` chama `POST …/cancel` e a releitura mostra `Cancelada` | 1.16 |
| ☑ | Resíduo conferido: cobranças canceladas, agendamentos apagados | Toda sonda de escrita fecha assim |
| ☑ | Node salvo na 0.12.x executa sem ser tocado | `File · Upload` e `Schedule · Get Many` |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de instância limpa |

---

## 7. O que está em aberto — e é decisão do Alvaro

| # | Em aberto | Situação |
|---|---|---|
| 1 | ~~Ler cobranças de uma empresa real~~ | ✅ **Resolvida em 2026-07-28.** As 5 cobranças de sonda de 2019 deram o registro (1.3), os códigos de `status` (1.5) e o link público (1.12) — e corrigiram o erro da 1.5 |
| 2 | ~~`Create` e `Cancel`~~ | ✅ **Resolvida em 2026-07-28**, com a exceção à regra 3 autorizada pelo Alvaro. Medidas em 1.13 a 1.17, com resíduo zero. Entram na versão |
| 3 | **Juntar os outros auxiliares na mesma versão** | Com `Create` e `Cancel` dentro, Collections já é uma versão inteira — cinco operações. `Banks`, `Users` e `Organizations` fechariam a fatia 8 e trocariam o `Bank 341` da lista de contas por `Itaú`, mas **não são mais necessários para a 0.13.0 ficar redonda**. Continua sendo escopo do Alvaro; minha recomendação agora é **deixar para uma 0.14.0** |
| 4 | **A numeração** | **0.13.0** — capacidade nova é minor |

**Nada mais depende de decisão para começar.** A rota, a chave de paginação, o registro campo a
campo, os filtros — `status/code` incluído —, o erro de digitação, a criação, a regra de uma
cobrança por agendamento e a rota de cancelar estão todos medidos. A fatia 1 pode começar com o
OK do Alvaro.
