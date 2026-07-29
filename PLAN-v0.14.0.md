# PLANO DE IMPLEMENTAÇÃO — v0.14.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público: nenhum nome de cliente, ID de
> workflow, ID de credencial — e **nenhum token**.

**Escopo da v0.14.0:** **NFS-e** — as notas fiscais de serviço. É o **item 7 do anexo A.2 do
contrato**, e a última fatia grande que faltava dele.

**Por que agora.** A 0.12.0 migrou **metade** dos dois workflows de NFS-e: a parte de arquivos
(~19 nodes HTTP Request). A outra metade — emitir a nota e acompanhá-la — continua escrita à
mão. Esta versão é o que falta para esses dois workflows saírem **inteiros** do HTTP Request,
que é o propósito escrito deste pacote.

**Por que 0.14.0:** capacidade nova é minor, que é a regra escrita do projeto.

**Cinco operações:** `Get Many`, `Get`, `Get Many Service Profiles`, `Issue` e `Cancel`.

**A escrita foi medida em produção, de novo, e de novo com exceção declarada.** A cobaia foi
**trocada no meio desta versão**, e a empresa nova **não emite NFS-e** — medido, e por lista
vazia em vez de erro (1.1). O Alvaro autorizou explicitamente em **2026-07-29**:
empresa de produção, contato de teste no nome dele, **valores abaixo de R$ 10**. A sonda usou
R$ 5. É a **terceira** exceção declarada do projeto.

⚠️ **E esta exceção tem um custo que as anteriores não tinham: o resíduo não chega a zero.**
Cancelar uma NFS-e **não a apaga** (1.8) — a nota de sonda fica no histórico da empresa, para
sempre, marcada `Cancelada`. Isso foi dito ao Alvaro antes da sonda, e aceito por ele.

**Fora de escopo:** os auxiliares `Banks`, `Users` e `Organizations` (fatia 8 — ficam para a
0.15.0); qualquer mudança nos recursos já publicados; e o RPS avulso, que esta API não expõe.

---

## 1. Medições — o que a API respondeu

Todas de **2026-07-29**, contra uma empresa de produção. As de 1.2 a 1.12 são **inteiramente de
leitura**. A de 1.13 a 1.16 é a **sonda de escrita** da exceção acima: um agendamento de R$ 5,
uma nota emitida, autorizada e cancelada, e o agendamento apagado.

A empresa já tinha **4 notas** antes de qualquer coisa que este projeto fizesse — três negadas e
uma cancelada, sendo três delas da madrugada do próprio dia 29, emitidas pelo Alvaro. Elas
deram, de graça, os estados terminais que a sonda não precisaria mais produzir.

### 1.1 🔴 A cobaia mudou no meio desta versão — e é por isso que a medição saiu de produção

**A cobaia usada desde 2026-07-25 acabou.** O período de experiência dela expirou, e em
**2026-07-29** o Alvaro **excluiu a empresa e criou outra** no lugar. Foi essa troca que a
medição encontrou:

| O que se tentou, com o token que estava gravado | Resposta |
|---|---|
| `GET /nfse` | **401** `"Api token expirado"` |
| `GET /nfse/serviceprofiles` | **401**, a mesma |
| `GET /categories` · `/accounts` · `/customers` · `/schedules/credit` · `/public/collections` | **401**, a mesma |

**O 401 não é da NFS-e: é do token.** Toda rota responde igual, inclusive as que a cobaia atende
desde a 0.4.0 — que é como se sabe que o impedimento é de credencial e não de recurso.

✅ **Resolvido no mesmo dia.** O token da cobaia nova entrou no arquivo de ambiente e a empresa
foi medida:

| Rota | Resposta |
|---|---|
| `GET /categories` | **200**, `count: 22` — as categorias próprias de uma empresa nova |
| `GET /accounts` · `/customers` · `/schedules/credit` · `/costcenters` | **200**, `count: 0` em todas |
| `GET /public/collections` · `/public/collections-profiles` | **200**, `count: 0` |
| **`GET /nfse`** | **200**, `count: 0` |
| 🔴 **`GET /nfse/serviceprofiles`** | **200**, **`count: 0`** |

**A empresa está genuinamente vazia** — 22 categorias, que é o que o Nibo cria sozinho, e zero
de todo o resto. É uma cobaia melhor que a anterior para o aceite, porque o caminho vazio é
exatamente o que ela existe para provar.

🔴 **E a recusa da NFS-e é por lista vazia, não por erro.** O Alvaro tinha informado que a
empresa nova "não serve para NFS-e", e a medição diz **como**: a rota responde **200 com
`count: 0`**, não 403 nem 404. A diferença decide a tela:

| Se a lista de perfis respondesse | O que o node precisaria |
|---|---|
| **200 com `count: 0`** ← **é este** | A frase *"esta empresa não emite NFS-e"* (1.10), que já estava desenhada |
| 403 ou 404 | Tratamento próprio, e a fatia 2 mudaria |

**É o mesmo formato da cobrança na 0.13.0** — lá a cobaia também respondia coleção e perfis
vazios —, então o recurso trata os dois casos com o mesmo padrão, sem inventar um terceiro.

**Por que a empresa não emite:** NFS-e depende de certificado digital válido e de perfil de
serviço homologado no município (1.10, 1.15) — a mesma classe de impedimento que tirou a cobrança
da cobaia na 0.13.0, onde era o provedor bancário contratado. Uma empresa recém-criada não tem
nenhum dos dois. **Foi por isso que a medição de escrita desta versão saiu de produção**, e não
por escolha.

### 1.2 A rota, o envelope e a contagem

`GET /nfse` → **200**, envelope `{items, count}` de sempre. Sem prefixo `/public/`, sem nada
fora do padrão. `GET /nfse/serviceprofiles` → **200**, mesmo envelope.

### 1.3 O registro, campo a campo

Uma nota autorizada carrega **41 campos** (42 no conjunto das quatro notas lidas — um estado
terminal não traz os campos do outro). Os que importam:

| Campo | O que é |
|---|---|
| `id` | GUID da nota |
| `status` | Objeto `{code, description}` — ver 1.6 |
| `number` | O número da NFS-e. **Só existe depois de autorizada** |
| `verificationCode` | O código de verificação da prefeitura, 50 dígitos |
| `rpsNumber` · `rpsSeries` | Número e série do RPS. O número **é sequencial na empresa** |
| `pdfFileUrl` · `xmlFileUrl` | Links diretos, **públicos** — ver 1.12 |
| `pdfFileId` · `xmlFileId` | Os IDs por trás dos dois links |
| `value` | O valor da nota. **Vem do agendamento** — ver 1.14 |
| `schedule` | O agendamento embutido, com `id`, `value`, `description`, `dueDate` |
| `stakeholder` | `{id, name, type, isDeleted}` — o tomador |
| `customer` | O tomador **de novo**, com documento, e-mail e endereço |
| `serviceProfile` | `{id, name, isDeleted}` — o perfil usado |
| `service` | O serviço resolvido: descrição, `cityServiceCode`, `cnaeCode`, alíquotas |
| `createDate` · `authorizeDate` · `cancelDate` · `lastStatusChange` · `updateDate` | O relógio do ciclo — ver 1.7 |
| `accrualRpsDate` | A competência do RPS |
| `lastMessage` | **O texto da prefeitura**, e é onde mora o motivo de uma recusa (1.15) |
| `lastStatusMessage` | `"Info"` ou `"Error"` — um segundo sinal, mais grosso que o `status` |
| `remarks` · `additionalRemarks` | As observações, preenchidas pelo perfil |
| `customAttributes` | Traz `originalAccrualRpsDate` e os templates do perfil |
| `deductions` · `discounts` | Zero nas notas medidas |
| `serviceProvisionLocationType` · `countryWhereServiceWasProvided` · `stateWhereServiceWasProvided` · `cityWhereServiceWasProvided` | O local da prestação |
| `provider` | O provedor de emissão (`ENotas`, `DF-e`) |
| `serviceProviderDocumentNumber` | O CNPJ do prestador |
| `construction` · `event` · `recipient` · `servicePartners` | Blocos de casos especiais, vazios nas notas medidas |
| `createUser` · `updateUser` | Nome de pessoa. **Não vai para tela nenhuma** |

**`number`, `verificationCode`, `pdfFileUrl` e `xmlFileUrl` são `undefined` enquanto a nota não
foi autorizada.** Uma nota negada nunca os ganha.

### 1.4 A paginação: `id` serve, e o catálogo mandava outra coisa

| `$orderby` | Resposta |
|---|---|
| `id` | ✅ 200 |
| `lastStatusChange` | ✅ 200 |
| `accrualDate` | ❌ 500 |
| `issueDate` | ❌ 500 |
| **`$skip` sem `$orderby`** | ❌ 500, como em toda coleção desta API |

O catálogo do projeto mandava ordenar por `lastStatusChange`. Os dois funcionam — e **`id` é o
que o resto do node já usa**, então é o que fica: uma chave a menos para lembrar.

⚠️ **`accrualDate` quebra como `$orderby`, mas `accrualRpsDate` filtra normalmente** (1.9). São
nomes diferentes; o que está na leitura é `accrualRpsDate`.

### 1.5 Não existe get-by-id

`GET /nfse/{id}` → **404** `{"statusCode":404,"message":"Resource not found"}`, idêntico ao 404
de uma rota inventada. O caminho é `GET /nfse?$filter=id eq <guid>`, **GUID sem aspas** — o
gotcha 15 do projeto vale aqui:

| Expressão | Resposta |
|---|---|
| `id eq <guid>` | ✅ 200, `count=1` |
| `id eq guid'<guid>'` | ❌ 500 — `Unrecognized 'Edm.String' literal 'guid'` |
| `id eq '<guid>'` | ❌ 500 — `incompatible types 'Edm.Guid' and 'Edm.String'` |

É a mesma solução do `Category · Get` e do `Collection · Get`.

### 1.6 🔴 Os cinco códigos de status, medidos — três deles pela primeira vez

| Código | `description` | `lastStatusMessage` | O que significa |
|---:|---|---|---|
| **`1`** | Em fila de processamento | `Info` | Transitório. Nasce aqui |
| **`2`** | Em processamento de autorização | `Info` | Transitório. A prefeitura está com ela |
| **`3`** | **Autorizada** | `Info` | Terminal bom. Ganha `number`, `verificationCode`, PDF e XML |
| **`-1`** | Negada | `Error` | Terminal ruim. O motivo está em `lastMessage` (1.15) |
| **`-4`** | Cancelada | `Info` | Terminal. Depois de autorizada e cancelada |

Os códigos `1`, `2` e `3` só apareceram **porque a sonda os observou de perto** — nenhuma nota
da empresa estava nesses estados. Os `-2` e `-3` não apareceram e **não se afirma que não
existam**: o gotcha 14 vale para valor de enum como vale para rota.

**É por isso que a espera do `Issue` para em `code > 0 && number` ou em `code < 0`, e não numa
lista fechada de nomes.** Um código desconhecido é terminal e vai para a mensagem como veio.

### 1.7 O ciclo inteiro, no relógio

A sonda de R$ 5, lida a cada 400 ms:

| Momento | Estado |
|---|---|
| `+0,4s` | `1` — Em fila de processamento |
| `+0,8s` | `2` — Em processamento de autorização |
| **`+22,8s`** | **`3` — Autorizada**, com `number`, PDF e XML |

E as outras notas da empresa, pela diferença entre `createDate` e o desfecho:

| Nota | Provedor | Desfecho | Tempo |
|---|---|---|---|
| Sonda de hoje (R$ 5) | ENotas | **Autorizada** | **22,8 s** |
| Nota do Alvaro, 03:02 | ENotas | **Autorizada** | **4,6 s** |
| Negada por certificado vencido | ENotas | Negada | 1,3 s |
| Negada pelo município (E0312) | ENotas | Negada | 7,9 s |
| Nota de 2019 | **DF-e** | Negada | **123,1 s** |

**Cinco amostras, de 1,3 s a 123,1 s**, e o Alvaro relata que pode chegar a **5 minutos**.

⚠️ **A mais lenta é uma negação, não uma autorização** — e isso não a torna irrelevante:
**negar também é estado terminal**, é nele que a espera para (2d), e é ele que o teto precisa
cobrir. Ela também é de outro provedor (`DF-e`, e não `ENotas`) e de 2019, o que sugere que a
variação não é só do município: é do caminho inteiro.

**A conclusão é uma só: o teto não pode ser fixo no código**, e o padrão dele é decisão, não
medição (seção 7, item 2).

🔴 **E o teto não é o tempo de espera.** O node devolve no instante em que a nota chega a um
estado terminal — um teto de 5 minutos **não** faz uma nota de 5 segundos demorar 5 minutos. Um
teto generoso não custa nada no caso comum, e um teto curto não resolve o caso lento: ele só
devolve *"ainda não autorizada"* e empurra a consulta para o workflow.

**A nota entra na lista em menos de 0,4 s.** Não há a consistência eventual de `/payments` — a
releitura não precisa de tolerância.

### 1.8 🔴 A rota de cancelar existe, e **não é** o `DELETE` do catálogo — pela segunda vez

O catálogo deste projeto listava `DELETE /nfse/{id}` como o cancelamento, marcado como não
verificado. Contra um **GUID inventado**, que não pode desfazer nada:

| Chamada | Resposta | Lê-se |
|---|---|---|
| `DELETE /nfse/{fake}` | **404** `Resource not found` | **A rota não existe** |
| `POST /nfse/{fake}/cancel` | **500** `"NFSe não encontrada"` | **A rota existe**, o registro é que não |
| `POST /nfse/cancel/{fake}` | 404 | Não existe |
| `POST /nfse/{fake}/cancelar` | 404 | Não existe |
| `PUT /nfse/{fake}/cancel` | 404 | Não existe |
| *(controle)* `DELETE /nfse/{fake}/xyz` | 404 | Rota sabidamente inexistente |

A rota é **`POST /nfse/{id}/cancel`**, e a distinção que a revelou é a mesma da 0.13.0: um erro
**de negócio** onde os outros dão erro **de rota**. Confirmada na sonda (1.16): **204**.

⚠️ **É o segundo cancelamento que este catálogo erra do mesmo jeito** — cobrança na 0.13.0,
NFS-e agora. Os dois estavam marcados como não verificados, e os dois eram `POST …/cancel`. Vira
gotcha no `SKILL.md`, não nota de rodapé.

### 1.9 O filtro assistido, campo a campo

Medido um a um contra a coleção real:

**Funcionam (200):** `status/code` · `value` · `number` · `rpsNumber` · `rpsSeries` ·
`createDate` · `updateDate` · `lastStatusChange` · `accrualRpsDate` · `authorizeDate` ·
`cancelDate` · `stakeholder/id` · `stakeholder/name` (com `contains` + `tolower`) ·
`schedule/id` · `serviceProfile/id` · `customer/name` · `service/description` · `provider` ·
`cityWhereServiceWasProvided`.

**Quebram (500):**

| Campo | Por quê |
|---|---|
| **`status/description`** | Enum não compara — o mesmo problema do `document/type` no contato e do `costCenterValueType` no agendamento. **Filtre por `status/code`** |
| **`isDeleted`** | Não está nesta view, como já não estava na de categoria, centro de custo e lançamento baixado |

### 1.10 O perfil de serviço — o campo que decide a nota inteira

`GET /nfse/serviceprofiles` é **não documentado** pelo Nibo e é o **único** caminho para o
`ServiceProfileId`, que é obrigatório na emissão. A empresa medida tem **um** perfil.

Cada perfil traz ~40 campos, e três grupos importam para a tela:

| Grupo | Campos | Por que aparece |
|---|---|---|
| Identidade | `name`, `cityServiceCode`, `cnaeCode`, `serviceListItemLC116`, `nationalTaxCode` | É o que diz **qual serviço** a nota declara |
| Tributação | `issAliquot`, `issRetained`, `federalTaxAliquot`, e as de PIS/COFINS/CSLL/IR/INSS | É o que decide **quanto imposto** |
| Texto | `description` (template `{{Descricao}}`), `additionalRemarks` | É onde costumam ir **dados bancários e chave Pix** |

🔴 **Perfil errado não é um erro que se corrige depois.** Ele muda o imposto e as instruções de
pagamento impressas na nota, e desfazer é cancelamento na prefeitura. Por isso a lista **não
mostra só o nome**: mostra o código de serviço e a alíquota de ISS junto, e o notice diz que as
observações do perfil vão impressas.

**Uma lista vazia significa que a empresa não emite NFS-e** — é o mesmo caso do `Get Many
Profiles` da cobrança, e é dito com essas palavras em vez de uma caixa vazia.

### 1.11 Um agendamento aceita **várias** notas — diferente da cobrança

Um mesmo agendamento da empresa carrega **três** NFS-e: duas negadas e uma cancelada. Não há a
regra de uma-por-agendamento que a 0.13.0 mediu para a cobrança, e **o node não põe guarda
nenhuma aqui**.

⚠️ **O que não foi medido:** se a API aceita uma segunda nota num agendamento que tem uma
**Autorizada** viva. As três do exemplo estavam todas mortas. Seção 7, item 4 — e enquanto não
for medido, o node não promete nem impede.

### 1.12 🔴 O PDF e o XML são links públicos — e o cancelamento não os apaga

`pdfFileUrl` e `xmlFileUrl` apontam para **`arquivos.nibo.com.br`**, o mesmo host que a 0.12.0
mediu com `curl` pelado: **sem token, sem cookie, sem header**. Quem tem o link tem a nota.

E o pior lado disso foi **medido, não deduzido do registro**. Com a nota da sonda já em `-4
Cancelada`, os dois links foram buscados **sem header de autenticação nenhum**:

| Link | Resposta |
|---|---|
| `pdfFileUrl` | **200** · `application/pdf` · 42.979 bytes |
| `xmlFileUrl` | **200** · `text/xml` · 9.847 bytes |

**Cancelar tira a validade fiscal; não tira o documento do ar.** Quem recebeu o link antes
continua baixando a nota depois de cancelada, e nada no registro sinaliza isso para quem só tem
o PDF na mão.

Isso é fato do serviço, não coisa que o node conserte. Vai para a tela e para o README, como foi
com o anexo na 0.12.0 e com o boleto na 0.13.0.

### 1.13 A emissão devolve o GUID entre aspas

`POST /nfse` → **200**, corpo `"be35e904-…"` — uma **string JSON**, não um objeto. É o mesmo
formato do `POST /schedules/credit` e do `POST /public/collections`. O node desembrulha e devolve
o registro relido, como faz nas outras famílias.

O corpo vai em **PascalCase** — exceção nesta API, onde todo o resto é camelCase:

```
ScheduleId · ServiceProfileId · StakeholderId · AccrualRpsDate ·
AdditionalServiceDescription · StateWhereServiceWasProvided · CityWhereServiceWasProvided
```

### 1.14 O valor não vai no corpo: vem do agendamento

Não existe campo de valor na emissão. O agendamento de R$ 5 gerou nota de R$ 5, e o `value` da
nota lida é 5. **É por isso que não há campo de valor na tela** — e o notice diz de onde ele vem,
porque um campo ausente sem explicação parece esquecimento.

### 1.15 O motivo da recusa vem em `lastMessage`, e é texto da prefeitura

As duas recusas medidas:

```
NFSe negada.
Código: _Cert002
Descrição: O certificado digital da empresa está vencido, será necessário a
atualização do mesmo antes de continuar as emissões de nota fiscal.
```

```
NFSe negada.
Código: E0312
Descrição: O código de tributação nacional informado não está administrado pelo
município de incidência do ISSQN na data de competência informada na DPS,
conforme a lista de serviços nacional do Sistema Nacional NFS-e.
```

**São erros de cadastro e de tributação, não de chamada.** O node não os traduz nem os resume:
repassa o texto inteiro, que é o que a contabilidade precisa ler. O que ele acrescenta é o
**estado** — dizer que a nota foi *negada*, e não que a chamada falhou.

### 1.16 A sonda de escrita, de ponta a ponta

| Passo | Resultado |
|---|---|
| `POST /schedules/credit` — R$ 5, contato de teste, competência do dia | **200**, ID capturado na hora |
| `POST /nfse` | **200**, ID capturado na hora |
| Acompanhamento a cada 400 ms | `1` → `2` → `3` **Autorizada**, número emitido (1.7) |
| `POST /nfse/{id}/cancel` | **204** |
| Releitura 3 s depois | `-4` **Cancelada**, com `cancelDate` — e PDF ainda servindo (1.12) |
| `DELETE /schedules/credit/{id}` | **204** |

**Resíduo:** o agendamento foi apagado e conferido. **A nota cancelada ficou** — não há rota que
a apague, e não deveria haver: é documento fiscal. Está registrado aqui porque toda sonda deste
projeto fecha declarando o que deixou para trás.

---

## 2. Decisões de recorte

**2a — Um recurso, chamado `Service Invoice` na tela.** O linter do n8n põe todo display name em
title case e transforma `NFS-e` em `NFS-E`, grafia que não existe — a 0.9.0 já bateu nessa parede
com o parâmetro da árvore de categorias e resolveu pondo o nome do documento na **descrição**,
onde nada o reescreve. Mesma solução. O valor que o workflow guarda é `serviceInvoice`.

**2b — As cinco operações de uma vez**, e não leitura primeiro. É o padrão desde a 0.6.0, e aqui
ele se sustenta porque **tudo já está medido**, inclusive o cancelamento.

**2c — A espera é opção de tela, com teto configurável.** Decisão do Alvaro em 2026-07-29. Duas
entradas em `Options`:

| Opção | Padrão | Comportamento |
|---|---|---|
| **Wait for Authorization** | **Ligada** | O node acompanha a nota até um estado terminal e devolve o registro final — com `number`, PDF e XML quando autorizada |
| **Authorization Timeout** | **300 s** | O teto, em segundos. Estourou, o node devolve o registro **como está** dizendo que a nota **foi emitida e ainda não foi autorizada** |

**Os dois padrões foram decididos pelo Alvaro em 2026-07-29**, depois de uma recomendação de
120 s ter sido retirada por ficar **abaixo** da amostra mais lenta medida, de 123,1 s (1.7).
**300 s** fica acima de toda amostra e igual ao que a prática dele relata.

**Ligada por padrão é o comportamento seguro sendo o padrão** — a mesma escolha do *Fail on
Incomplete Results* desde a 0.4.3: quem não quer, desliga. E **300 s não é caro**, porque o teto
não é o tempo de espera (1.7): o node devolve assim que a nota chega a um estado terminal.

🔴 **O que a espera nunca faz é dizer que falhou.** Uma emissão que passou e é reportada como
falha faz o workflow emitir de novo — e o segundo RPS já saiu. É a mesma regra que a 0.10.0
escreveu para a baixa, e ela vale mais aqui, porque o duplicado é fiscal.

**2d — Negada para a espera, e não é erro do node.** `code < 0` é estado terminal: a espera para,
e o item sai com o registro e o `lastMessage` da prefeitura. **A operação não falha** — a chamada
funcionou; foi o município que recusou. Um workflow que precise tratar isso lê o `status.code`,
que é dado, não exceção.

**2e — Sem guarda de nota-por-agendamento.** A cobrança tem uma; a NFS-e, pelo medido, não (1.11).
Inventar uma seria vender regra que a API não tem.

**2f — `Get` pelo filtro, não pela rota.** `GET /nfse/{id}` é 404 (1.5). Mesma solução do Category.

**2g — A chave de paginação é `id`.** Funciona (1.4) e é a que o node já usa em todo lugar.

**2h — O tomador é campo, com a busca que já existe.** O `StakeholderId` é obrigatório e a busca
de contatos existe desde a 0.8.0. **Não** se preenche sozinho a partir do agendamento: se a API
exige a coisa, a tela pergunta a coisa. Se a medição do item 5 da seção 7 mostrar que a API
recusa um tomador diferente do dono do agendamento, isso vira validação **antes** da chamada — e
aí sim o campo pode nascer preenchido.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.14.0 |
|---|---|
| `resources/serviceInvoice/description.ts` · `execute.ts` · `load.ts` | **Novo.** As cinco operações, o menu de filtro medido, a espera com teto, os notices do link público, do perfil e do cancelamento |
| `transport/paginate.ts` | **Nada** — chave `id`, envelope de sempre |
| `transport/request.ts` · `errors.ts` | **Nada** — o 500 com corpo de negócio já sai legível desde a 0.6.0 |
| `resources/shared/filter.ts` | **Nada** — `date`, `number`, `text` e `guid` já existem |
| `NiboEmpresas.node.ts` | O recurso na lista, no handler, nos imports e no `loadOptions` do perfil |
| Credencial | **Nada a fazer** — a lista sai de `RESOURCES.map(...)` |

**A espera mora no `execute.ts` do recurso**, não no transporte: é regra desta família, não do
protocolo. O transporte não sabe o que é uma nota autorizada, e não deve saber.

---

## 4. Fatias, com teste antes do código

1. **`Service Invoice · Get Many`, com o filtro assistido** *(commit próprio)*. Testes: a rota é
   `/nfse`; a chave de paginação é `id` e `$skip` sem `$orderby` não é montado; o menu de filtro
   tem exatamente os campos da 1.9 e **não** tem `status/description` nem `isDeleted`; o GUID vai
   sem aspas (1.5); `accrualRpsDate` está no menu e `accrualDate` não existe.

2. **`Get` e `Get Many Service Profiles`** *(commit próprio)*. Testes: o `Get` monta
   `$filter=id eq <guid>` e **não** chama `/nfse/{id}`, que é 404; envelope vazio vira erro com o
   ID na frase; os perfis vêm de `/nfse/serviceprofiles`; a lista mostra código de serviço e ISS
   junto do nome; **lista vazia vira "esta empresa não emite NFS-e"**, que é o que ela significa.

3. **`Issue`, com a espera** *(commit próprio)*. Testes: o corpo leva as sete chaves em
   **PascalCase** (1.13); **não há campo de valor** e o notice diz que ele vem do agendamento
   (1.14); o GUID entre aspas vira registro relido; a espera para em `code > 0 && number` e em
   `code < 0`, e **um código desconhecido é terminal**; o teto estourado devolve *emitida, ainda
   não autorizada* e **nunca** "falhou" (2c); uma nota negada sai como item com `lastMessage`
   inteiro e **não** como exceção (2d); com a espera desligada, o node devolve na hora. **E os
   dois padrões são teste**: sem tocar em `Options`, a espera está **ligada** e o teto é **300 s**
   (2c) — um padrão que mude sem ninguém decidir é o defeito que a 0.13.1 corrigiu.

4. **`Cancel`** *(commit próprio)*. Testes: chama **`POST /nfse/{id}/cancel`** e **não** o
   `DELETE`, que é 404 (1.8); o 204 vira confirmação relida com `code -4`; o notice diz que o
   registro **fica**, que o PDF e o XML **continuam servindo** (1.12), e que isso é cancelamento
   na prefeitura, não um desfazer.

5. **README, catálogo e bump 0.14.0** *(commit próprio)*. `endpoints.md`/`payloads.md`: o schema
   da 1.3 contra o registro real, os **cinco códigos de status**, a chave de paginação, a ausência
   de get-by-id, os campos de filtro que quebram, e **a rota de cancelar que substitui o `DELETE`
   errado do catálogo — a segunda vez que ele erra isso**. `SKILL.md`: o gotcha do
   `POST …/cancel`, o do link público que sobrevive ao cancelamento, e a triagem.

---

## 5. Onde cada regra inviolável continua atendida

| Regra | Na v0.14.0 |
|---|---|
| 3 — escrita só na cobaia | ⚠️ **Exceção explícita do Alvaro em 2026-07-29**, registrada como tal: R$ 5, contato de teste no nome dele, empresa de produção, porque a cobaia está fora (1.1). **Terceira exceção declarada do projeto.** Resíduo: agendamento apagado; **a nota cancelada fica, e não há como não ficar** — dito antes da sonda e aceito |
| 4 — nenhum token em código ou commit | Sondas leram de variável de ambiente; nenhum token neste documento |
| 5 — zero dep de runtime | `dependencies` segue `{}` — a espera usa `setTimeout` |
| 6 — nada de caminho absoluto | Sondas descartáveis no scratchpad |
| Decisão 9 (projeto) — inglês | Campos, rótulos, notices, mensagens, README |
| 7 — instalação real | A 0.14.0 só fecha depois da tela Community Nodes |
| 8 — repo público | Este plano não nomeia cliente, credencial nem workflow |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` verdes antes de cada commit de fatia.

✅ **Nada bloqueia o aceite.** A cobaia foi trocada no meio desta versão e o token novo já está
no arquivo de ambiente (1.1); as duas empresas respondem.

**Como será:** o arranjo de sempre — `IExecuteFunctions` real dirigindo os handlers de `dist/`,
nunca `curl`. Contra a **cobaia**, o caminho vazio — e ela serve melhor para isso do que a
anterior, porque foi criada do zero em 2026-07-29 e **não tem registro nenhum**. Contra a
**empresa de produção**, a leitura do registro, os filtros e — sob a mesma exceção da seção 5,
com R$ 5 — uma emissão, a espera, o cancelamento e a limpeza do agendamento.

| ☑ | Item | Como conferir |
|---|---|---|
| ✅ | `Get Many` chama `/nfse` e pagina por `id` | Produção — 5 notas (8.1) |
| ✅ | O menu de filtro não oferece `status/description` nem `isDeleted` | Unitário — os dois são 500 (1.9) |
| ✅ | O filtro por `schedule/id` monta o GUID **sem aspas** | Produção — 3 notas no mesmo agendamento (8.1) |
| ✅ | `Get` de um ID inexistente diz "não encontrado" com o ID | Produção |
| ✅ | `Get Many Service Profiles` mostra código de serviço e ISS | Produção — *Certificação Digital · Service code 170102002 · ISS 5%* |
| ✅ | Lista de perfis vazia vira "esta empresa não emite NFS-e" | Cobaia — ela responde `count: 0`, medido em 1.1 |
| ✅ | **Os 41 campos de um registro real batem** | Produção — 42 na união das 5 notas (1.3, 8.1) |
| ✅ | `Issue` monta o corpo em PascalCase e sem valor | Unitário + produção (8.2) |
| ✅ | A espera atravessa `1` → `2` → `3` e devolve o `number` | Produção, R$ 5 — 0,5s / 1,6s / 23,3s, nº 2842 (8.2) |
| ✅ | Teto estourado diz **emitida, não autorizada** — nunca "falhou" | Unitário, com teto de 0 s |
| ✅ | Sem tocar em `Options`: espera **ligada**, teto **300 s** | Unitário (2c) |
| ✅ | Nota negada sai como **item**, com o texto da prefeitura | Unitário |
| ✅ | `Cancel` chama `POST …/cancel` — e a releitura mostra **`-2`**, não `-4` | Produção (8.2). 🔴 O item do plano estava errado: cancelar tem fila própria |
| ✅ | O notice diz que PDF e XML seguem públicos **depois** do cancelamento | 1.12 |
| ✅ | Resíduo conferido: agendamento apagado, nota cancelada declarada | Agendamento `da479837…` apagado; nota `ac9fc756…` fica em `-4` (8.2) |
| ✅ | Node salvo na 0.13.x executa sem ser tocado | `Collection · Get Many` e `Schedule · Get Many`, os dois na cobaia |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de instância limpa — é do Alvaro |

---

## 7. O que está em aberto — e é decisão do Alvaro

| # | Em aberto | Situação |
|---|---|---|
| 1 | ~~O token da cobaia nova~~ | ✅ **Resolvida em 2026-07-29.** A empresa antiga expirou e foi excluída; a nova foi criada no mesmo dia e o token dela está no arquivo de ambiente. As duas empresas respondem (1.1). **Nada bloqueia o aceite** |
| 2 | ~~O padrão do teto de espera~~ | ✅ **Resolvida em 2026-07-29: `Wait for Authorization` ligada, `Authorization Timeout` de 300 s** (2c). Uma recomendação anterior de 120 s foi retirada por ficar **abaixo** da amostra mais lenta medida, 123,1 s — o Alvaro apontou a incoerência. Para quem emite em laço e não quer esperar por nenhuma, o caminho é a espera **desligada** + `Get` depois, e o README documenta isso |
| 3 | ~~Como a cobaia nova recusa a NFS-e~~ | ✅ **Resolvida em 2026-07-29.** Por **lista vazia**, não por erro: `GET /nfse/serviceprofiles` responde **200 `count: 0`** (1.1). É o mesmo formato da cobrança na 0.13.0, e a fatia 2 fica como estava desenhada |
| 4 | **Segunda nota num agendamento com uma Autorizada viva** | Não medido (1.11). Enquanto não for, o node não promete nem impede |
| 5 | **Se o tomador precisa ser o do agendamento** | Não medido. Muda a tela: se a API recusar, o campo pode nascer preenchido e a validação acontece antes da chamada (2h) |
| 6 | **A numeração** | **0.14.0** — capacidade nova é minor |

**O que está medido:** a rota, a chave de paginação, o registro campo a campo, os cinco códigos
de status, os campos de filtro um a um, a rota de cancelar, o formato do corpo, o ciclo inteiro
no relógio, e **como a cobaia recusa a NFS-e**. As duas empresas de teste respondem.

**O que está decidido:** o recorte (2a a 2h), os padrões da espera (2c) e a numeração.

**Os itens 4 e 5 continuam em aberto e nenhum dos dois trava nada** — são medições que
*acrescentariam* comportamento (uma guarda, um campo preenchido sozinho), não que mudariam o que
está desenhado. Enquanto não forem medidos, o node não promete nem impede.

**Nada mais depende de decisão. A fatia 1 pode começar.**

---

## 8. O que foi construído e aceito — 2026-07-29

As cinco fatias estão escritas, cada uma com commit próprio e gate local verde:
`lint`, `lint:community`, **941 testes**, `build` e `pack`. O pacote está em **0.14.0**.

**Uma correção do plano, achada pela própria construção.** A 1.9 lista os campos que filtram e
**não diz a forma do literal de cada um** — e três campos de cara numérica discordam entre si,
medidos um a um antes de a fatia 1 ser escrita:

| Campo | Tipo na API | Literal |
|---|---|---|
| `number` — o número da nota | **`Edm.String`** | `number eq '35'` · `number eq 35` é **500** |
| `rpsNumber` | `Edm.Int32` | nu — e o inverso do de cima |
| `rpsSeries` | **`Edm.String`** | entre aspas outra vez |

Um menu montado por analogia teria posto os três como número e produzido 500 em dois deles.

### 8.1 O aceite de leitura — 17 itens, todos verdes

Dirigindo os handlers de `dist/` com um `IExecuteFunctions` real, nunca `curl`. **Nenhuma
escrita.**

**Contra a cobaia** — o caminho vazio, que é o que ela existe para provar: `Get Many` devolve
lista vazia sem erro; `Get Many Service Profiles` **e** a lista do campo recusam com a mesma
frase, *"This organization does not issue NFS-e"*, com certificado e prefeitura na descrição;
`Get` de um ID inexistente cita o ID; e `Collection · Get Many` e `Schedule · Get Many` seguem
executando sem ser tocados.

**Contra a empresa de produção** — só leitura: 5 notas, **42 campos** na união delas (os 41 do
plano, mais os que um estado terminal traz e o outro não); a nota que passou pela autorização
carrega número, PDF e XML **e continua carregando depois de cancelada**, enquanto as três negadas
nunca os ganharam; `Get` pelo ID; o filtro por `schedule/id` com **GUID nu** achando as 3 notas do
mesmo agendamento (1.11 confirmado no aceite); `status/code` nu; o número da nota **entre aspas** e
o do RPS **nu**, cada um achando a própria nota; o perfil com código de serviço e ISS; e a lista
recusando-se a carregar no modo de token por item.

### 8.2 🔴 O aceite de escrita — e os dois códigos que a 1.6 dizia não ter visto

Autorizado pelo Alvaro em **2026-07-29**, depois do aceite de leitura: um agendamento de R$ 5 sobre
o mesmo contato de teste, uma nota emitida **pelo node**, sem tocar em `Options`.

| Momento | Estado |
|---|---|
| `+0,5s` | `1` Em fila de processamento |
| `+1,6s` | `2` Em processamento de autorização |
| **`+23,3s`** | **`3` Autorizada**, nº **2842**, com PDF e XML |

Bate com a 1.7 (22,8 s naquela nota) e prova os dois padrões da 2c **em produção**: sem tocar em
`Options`, a espera ficou ligada e o teto foi 300 s.

🔴 **E o `Cancel` achou o que 941 testes verdes não achariam.** A releitura logo depois do 204 não
mostra `-4`: mostra **`-2` Em fila de cancelamento**. Acompanhada até o fim, a nota andou
**`-2` → `-3` Em processamento de cancelamento → `-4` Cancelada**.

**A 1.6 estava errada por omissão, e do jeito que ela mesma previu.** Ela escreveu que `-2` e `-3`
não tinham aparecido e que **não se afirmava que não existissem** — gotcha 14. Existem, e são o
**pipeline de cancelamento**, espelho de `1` e `2`:

| Entrada | Saída |
|---|---|
| `1` em fila *(transitório)* | `-2` em fila de cancelamento *(transitório)* |
| `2` em processamento *(transitório)* | `-3` em processamento de cancelamento *(transitório)* |
| `3` **Autorizada** | `-4` **Cancelada** |
| `-1` **Negada** | |

**Código negativo não é sinônimo de terminal**, que é exatamente o que a 2d e o `isTerminal` da
fatia 3 assumiam. Corrigido: a espera continua em `1`, `2`, `-2` e `-3`, e para no resto.

⚠️ **E a decisão da fatia 4 se provou no mesmo minuto.** O `Cancel` da cobrança **reprova** quando a
releitura não mostra o estado final; o da NFS-e foi escrito para **não reprovar**, porque cancelar
é ato de prefeitura e a única medição era de três segundos depois. Se ele tivesse copiado a
cobrança, teria reprovado **todo cancelamento real** — a nota está em `-2` naquele instante, sempre.

**Resíduo, declarado:** o agendamento `da479837…` foi apagado e conferido (releitura 500
*"Agendamento não encontrado"*). **A nota `ac9fc756…` fica**, em `-4 Cancelada`, nº 2842 — é a
segunda nota de sonda desta empresa, e era o custo dito antes e aceito. Seu **PDF continua
respondendo 200 `application/pdf` sem header nenhum**, medido depois do cancelamento, que é a
1.12 confirmada no aceite.

### 8.3 🔴 O que falta, e por que parou aqui

**Um item só: a instalação real (regra 7)**, que é do Alvaro e fecha toda versão deste projeto —
`npm install` na tela Community Nodes de uma instância limpa.

**E uma decisão que fica em aberto, sem travar nada.** Agora que se sabe que o cancelamento tem
fila própria, o `Cancel` **poderia** esperar até `-4`, como o `Issue` espera pela autorização. Ele
não espera: devolve o registro com `_niboCancellationPending` dizendo que foi aceito e que `-4` vem
em segundos. Esperar seria comportamento que este plano não desenhou e pediria opção própria —
fica para o Alvaro decidir, numa 0.14.1 se ele quiser.

**O resíduo desta versão na empresa de produção:** duas notas de sonda, ambas `Cancelada` — a de
1.16 (nº 2841) e a do aceite (nº 2842). Nenhum agendamento. Fica escrito porque escrita em produção
não se declara limpa sem dizer onde.
