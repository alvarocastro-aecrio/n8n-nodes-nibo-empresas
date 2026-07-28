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

**🔴 Fora de escopo, e não por escolha: criar e cancelar cobrança.** A medição da seção 1.1
mostrou que **não há como medir a escrita dentro das regras deste projeto**. Isso é o achado
principal desta sondagem e está dissecado abaixo. A versão entrega **leitura**, que é
exatamente o que roda em produção hoje.

**Também fora de escopo:** NFS-e (fatia 7) e os demais auxiliares (Banks, Users,
Organizations) — ver a decisão 3 em aberto, na seção 7.

---

## 1. Medições — o que a API respondeu

Sondagem de **2026-07-28, na cobaia, e inteiramente de leitura**: nenhum `POST`, nenhum
`DELETE`, nenhuma escrita de nenhum tipo saiu. Emitir cobrança é ação voltada para fora — o
Nibo manda o boleto por e-mail ao tomador —, então a escrita não se sonda sem liberação, e
acabou que nem com liberação daria (1.1).

### 1.1 🔴 A cobaia não emite cobrança, e é por isso que a escrita fica fora

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
| Emitir numa **empresa real** | **Regra inviolável 3** — escrita só na cobaia. E o efeito sai para fora: boleto e e-mail ao cliente do cliente |
| Deduzir dos workflows | O corpo é conhecido (está no `payloads.md`), mas **payload conhecido não é comportamento medido** — é o erro que este projeto já pagou caro |

Então a escrita não entra. Não é cautela: é que **não existe lugar onde medi-la**.

### 1.2 A coleção da cobaia está vazia — o que isso deixou sem medir

```
GET /public/collections?$top=5000  →  200  {"items":[],"count":0}
```

Sem um único registro, **três coisas ficaram por medir** e estão na seção 7 como pendência:

- o **formato do registro** campo a campo, com os valores que cada um traz;
- os valores de **`status`** (o MCP mostra *Ativa*, *Paga*, *Cancelada* — não confirmado aqui);
- se os links **`url`** e **`pdf`** são públicos, como o `arquivos.nibo.com.br` da 0.12.0.

O que **não** ficou por medir é o schema, e isso é a 1.3.

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

### 1.5 🔴 `status` existe, e não dá para filtrar por ele

É o campo pelo qual todo mundo quer filtrar — *me dê as cobranças em aberto* — e ele é um tipo
complexo do .NET:

| Expressão | Resposta |
|---|---|
| `$orderby=status` | 500 *"must evaluate to a single value of primitive type"* |
| `$filter=status eq 'Ativa'` | 500 *"A binary operator with incompatible types was detected"* |
| `$filter=status eq 1` | 500, idem |
| `$filter=status ne null` | 200 — e é a única coisa que ele aceita |
| `$orderby=status/id` · `status/name` · `status/value` | 500 *"Could not find a property"* |
| `$orderby=status/description` | 500 *"O Nibo se comportou de forma inesperada."* |

Ou seja: o campo vem no registro e **não é uma condição possível**. Quem quiser cobranças em
aberto filtra o que dá no servidor e separa por `status` no n8n. Isso vai na tela.

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

---

## 2. Decisões de recorte

1. **Somente leitura, e a razão está na 1.1.** `Create` e `Cancel` não entram porque não há
   onde medi-los: a cobaia não tem perfil de cobrança e a regra 3 proíbe escrever em qualquer
   outro lugar. Um payload copiado de workflow **não é comportamento medido**, e este projeto
   já pagou por essa diferença mais de uma vez.

2. **Três operações:** `Get Many`, `Get` e `Get Many Profiles`. A terceira existe porque o
   perfil é o que a criação vai exigir no dia em que ela entrar, e porque listar os perfis é a
   única forma de descobrir se uma empresa emite cobrança — que foi a pergunta desta sondagem.

3. **`Get` é a lista filtrada por ID** (1.8), como em Category desde a 0.9.0. Envelope vazio
   vira "não encontrado" com o ID na frase.

4. **O menu do filtro assistido leva só o que foi medido**, e `status` fica **fora** (1.5) —
   com uma frase na tela dizendo por quê e o que fazer no lugar. Oferecer uma condição que
   responde 500 é pior do que não oferecer.

5. **A chave de paginação é `id`**, sempre injetada pelo transporte, porque `$skip` sem
   `$orderby` é 500 (1.4).

6. **`lasStatusChangeDate` entra com o nome errado que a API exige, e o rótulo na tela diz o
   certo:** *Last Status Change*. O nome da propriedade é contrato com o servidor; o rótulo é
   com quem lê.

7. **Nada de aviso sobre link público até estar medido.** A 0.12.0 mediu que
   `arquivos.nibo.com.br` entrega sem token, e é tentador assumir o mesmo para `url` e `pdf`
   daqui. **Assumir é o que este plano não faz**: ou se mede (seção 7, decisão 1) e a frase
   entra com todas as letras, ou não entra frase nenhuma.

8. **O README diz o que a versão não faz e por quê.** Alguém que instalar isto vai procurar
   como emitir boleto. A resposta — "não há onde medir a escrita dentro das regras deste
   projeto" — é mais útil do que a ausência silenciosa.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.13.0 |
|---|---|
| `resources/collection/description.ts` · `execute.ts` | **Novo.** As três operações, o menu de filtro medido e a frase sobre `status` |
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

3. **README, catálogo e bump 0.13.0** *(commit próprio)*. `endpoints.md`/`payloads.md`: o schema
   da 1.3, o `status` que não filtra, a ausência de get-by-id, a confirmação do erro de
   digitação, e a **resolução da ponta solta 2.6 do contrato**. `SKILL.md`: gotcha novo +
   triagem. A nota de ressincronização do `CLAUDE.md`.

---

## 5. Onde cada regra inviolável continua atendida

| Regra | Na v0.13.0 |
|---|---|
| 3 — escrita só na cobaia | **Nenhuma escrita, em lugar nenhum.** É o que define o recorte (1.1) |
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

**⚠️ O aceite tem um problema, e ele é a decisão 1 da seção 7.** O arranjo de sempre —
`IExecuteFunctions` real dirigindo os handlers de `dist/` contra a cobaia — aqui prova pouco:
a coleção está vazia, então `Get Many` devolveria `count: 0` e `Get` erraria por não achar. Isso
confirma que a rota responde e **não** confirma que o registro é lido direito.

| ☐ | Item | Como conferir |
|---|---|---|
| ☐ | `Get Many` chama `/public/collections` e pagina por `id` | Contra a cobaia |
| ☐ | O filtro por `scheduleId` monta o GUID **sem aspas** | Contra a cobaia — 500 se errar |
| ☐ | O filtro por `lasStatusChangeDate` responde 200 | É o teste do erro de digitação |
| ☐ | `Get` de um ID inexistente diz "não encontrado" com o ID | Contra a cobaia |
| ☐ | `Get Many Profiles` diz que a empresa não emite cobrança | A cobaia é exatamente esse caso (1.1) |
| ☐ | **Um registro de verdade é lido e os campos batem** | ⚠️ **Depende da decisão 1** |
| ☐ | **`url` e `pdf`: públicos ou não** | ⚠️ **Depende da decisão 1** |
| ☐ | Node salvo na 0.12.x executa sem ser tocado | `File · Upload` e `Schedule · Get Many` |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de instância limpa |

---

## 7. O que está em aberto — e é decisão do Alvaro

| # | Em aberto | Por que depende de você |
|---|---|---|
| 1 | 🔴 **Ler cobranças de uma empresa real** para medir o registro, o `status` e os links | A regra 3 proíbe **escrita** fora da cobaia; **leitura** em produção é permitida e foi como as ~90 chamadas do levantamento original foram feitas. Mas é dado de cliente, e quem autoriza é você. Sem isso a versão sai com o formato do registro não medido — funciona, porque o node repassa o que a API devolveu, mas o menu de filtro e o aviso do link ficam sem confirmação |
| 2 | **`Create` e `Cancel`** | Ficam para o dia em que houver perfil de cobrança na cobaia. Se você quiser isso, é uma conversa com o Nibo antes de ser uma tarefa de código — e a alternativa (emitir em empresa real) esbarra na regra 3 e manda boleto para o cliente do cliente |
| 3 | **Juntar os outros auxiliares na mesma versão** | Collections sozinha destrava ~2 nodes. `Banks`, `Users` e `Organizations` são três listas simples e fechariam a fatia 8 inteira — e `Banks` trocaria o `Bank 341` da lista de contas por `Itaú`. Custa pouco e a versão fica redonda. **Recomendo juntar**, mas é escopo, e escopo é seu |
| 4 | **A numeração** | **0.13.0** — capacidade nova é minor |

**A fatia 1 pode começar sem nenhuma dessas respostas.** A rota, a chave de paginação, o
`status` que não filtra e o erro de digitação estão medidos, e é disso que o `Get Many` é feito.
As decisões 1 e 3 mudam o que a versão entrega no fim, não o que ela começa fazendo.
