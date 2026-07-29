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

**A escrita foi medida em produção, de novo, e de novo com exceção declarada.** A cobaia está
fora por dois motivos independentes: a empresa foi **trocada no meio desta versão** e o token
novo ainda não chegou às sondas, e a empresa nova **não emite NFS-e** (1.1). O Alvaro autorizou
explicitamente em **2026-07-29**:
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

**A cobaia nova está de pé e vazia**, e o token dela foi trocado na credencial do n8n. O que
ainda **não** aconteceu é a troca no arquivo de ambiente que as sondas leem — enquanto ela não
acontecer, medição e aceite contra a cobaia continuam parados. É o item 1 da seção 7, e é o
único bloqueio que resta nesta versão.

⚠️ **A empresa nova não serve para NFS-e** — informado pelo Alvaro em 2026-07-29. Fica
registrado como **informação dele, não como medição**, e a distinção tem consequência prática:

| Se a lista de perfis responder | O que significa para o node |
|---|---|
| **200 com `count: 0`** | É o caso de teste perfeito do `Get Many Service Profiles` — a frase *"esta empresa não emite NFS-e"* (1.10) tem onde ser provada |
| **403 ou 404** | É outra coisa, e o recurso precisa de tratamento próprio para ela |

São telas diferentes, e escrever uma sem medir é exatamente o erro que a 0.13.1 corrigiu. É a
**primeira** medição a fazer quando o token entrar.

**Por que isso não é surpresa:** emitir NFS-e depende de certificado digital válido e de perfil
de serviço homologado no município (1.10, 1.15) — a mesma classe de impedimento que tirou a
cobrança da cobaia na 0.13.0, onde era o provedor bancário contratado. Uma empresa recém-criada
não tem nenhum dos dois. **Foi por isso que a medição desta versão saiu inteira de produção**, e
não por escolha.

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

| Nota | Desfecho | Tempo |
|---|---|---|
| Sonda de hoje (R$ 5) | Autorizada | **22,8 s** |
| Nota do Alvaro, 03:02 | Autorizada | **4,6 s** |
| Negada por certificado vencido | Negada | 1,3 s |
| Negada pelo município (E0312) | Negada | 7,9 s |
| Nota de 2019 | Negada | 123 s |

**Quatro amostras, de 1,3 s a 123 s.** O Alvaro relata que pode chegar a **5 minutos**. Isso é
o suficiente para uma conclusão e não mais que isso: **o teto não pode ser fixo no código**, e o
padrão dele é decisão, não medição (seção 7, item 2).

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

| Opção | Comportamento |
|---|---|
| **Wait for Authorization** | Ligada, o node acompanha a nota até um estado terminal e devolve o registro final — com `number`, PDF e XML quando autorizada |
| **Authorization Timeout** | O teto, em segundos. Estourou, o node devolve o registro **como está** dizendo que a nota **foi emitida e ainda não foi autorizada** |

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
   inteiro e **não** como exceção (2d); com a espera desligada, o node devolve na hora.

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

🔴 **O aceite espera o token da cobaia nova chegar ao arquivo de ambiente** (1.1). Não é uma
ressalva desta versão: é a regra 3 e o arranjo de aceite do projeto inteiro — vale igual para
uma correção de qualquer outra versão. **As fatias 1 a 5 podem ser escritas, testadas e
commitadas antes disso**; só o aceite espera.

**Como será, quando destravar:** o arranjo de sempre — `IExecuteFunctions` real dirigindo os
handlers de `dist/`, nunca `curl`. Contra a **cobaia**, o caminho vazio — e ela serve melhor
para isso do que a anterior, porque foi criada do zero em 2026-07-29 e **não tem registro
nenhum**. Contra a **empresa de produção**, a leitura do registro, os filtros e — sob a mesma
exceção da seção 5, com R$ 5 — uma emissão, a espera, o cancelamento e a limpeza do agendamento.

⚠️ **Um item do aceite depende de uma medição que ainda não pôde ser feita:** o
`Get Many Service Profiles` contra a cobaia só é conferível depois de saber se ela responde
`count: 0` ou um erro (1.1). Se for erro, esse item do aceite muda, e a fatia 2 muda com ele.

| ☐ | Item | Como conferir |
|---|---|---|
| ☐ | `Get Many` chama `/nfse` e pagina por `id` | Produção |
| ☐ | O menu de filtro não oferece `status/description` nem `isDeleted` | Unitário — os dois são 500 (1.9) |
| ☐ | O filtro por `schedule/id` monta o GUID **sem aspas** | Produção — 500 se errar |
| ☐ | `Get` de um ID inexistente diz "não encontrado" com o ID | Produção |
| ☐ | `Get Many Service Profiles` mostra código de serviço e ISS | Produção |
| ☐ | Lista de perfis vazia vira "esta empresa não emite NFS-e" | Cobaia — **depende da medição de 1.1**: só vale assim se ela responder `count: 0` |
| ☐ | **Os 41 campos de um registro real batem** | Produção (1.3) |
| ☐ | `Issue` monta o corpo em PascalCase e sem valor | Unitário + produção |
| ☐ | A espera atravessa `1` → `2` → `3` e devolve o `number` | Produção, R$ 5 |
| ☐ | Teto estourado diz **emitida, não autorizada** — nunca "falhou" | Unitário, com teto de 0 s |
| ☐ | Nota negada sai como **item**, com o texto da prefeitura | Unitário |
| ☐ | `Cancel` chama `POST …/cancel` e a releitura mostra `-4` | Produção (1.8) |
| ☐ | O notice diz que PDF e XML seguem públicos **depois** do cancelamento | 1.12 |
| ☐ | Resíduo conferido: agendamento apagado, nota cancelada declarada | Toda sonda de escrita fecha assim |
| ☐ | Node salvo na 0.13.x executa sem ser tocado | `Collection · Get Many` e `Schedule · Get Many` |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de instância limpa |

---

## 7. O que está em aberto — e é decisão do Alvaro

| # | Em aberto | Situação |
|---|---|---|
| 1 | 🔴 **O token da cobaia nova não está no arquivo de ambiente** | A empresa antiga expirou e foi excluída; a nova foi criada em 2026-07-29 e o token dela entrou na credencial do n8n, mas **não** em `/root/.config/nibo/cobaia.env`, que é de onde as sondas leem (regra 4). Até lá, toda rota responde 401 (1.1). **Bloqueia o aceite desta versão e de qualquer outra** — não bloqueia escrever o código. É a única pendência que impede a versão de fechar |
| 2 | **O padrão do teto de espera** | Medido: 1,3 s a 123 s em quatro amostras, e o Alvaro relata até 5 min (1.7). Minha recomendação: **120 s ligado por padrão** — cobre o que foi medido com folga, e quem trabalha com município lento sobe o número. O contra é um laço de 50 notas segurando o worker; para esse caso o README documenta emitir com a espera **desligada** e conferir depois com `Get`. **Não é medição: é escolha, e é sua** |
| 3 | **Como a cobaia nova recusa a NFS-e** | O Alvaro informou que ela **não serve** para NFS-e, e a razão é plausível (certificado e perfil homologado — 1.1). O que falta não é *se*, é **como**: `count: 0` e `403`/`404` pedem telas diferentes, e a fatia 2 depende disso. **Primeira medição assim que o item 1 destravar** |
| 4 | **Segunda nota num agendamento com uma Autorizada viva** | Não medido (1.11). Enquanto não for, o node não promete nem impede |
| 5 | **Se o tomador precisa ser o do agendamento** | Não medido. Muda a tela: se a API recusar, o campo pode nascer preenchido e a validação acontece antes da chamada (2h) |
| 6 | **A numeração** | **0.14.0** — capacidade nova é minor |

**O que não depende de decisão:** a rota, a chave de paginação, o registro campo a campo, os
cinco códigos de status, os campos de filtro um a um, a rota de cancelar, o formato do corpo, e o
ciclo inteiro no relógio. Está tudo medido. **A fatia 1 pode começar com o OK do Alvaro** — e as
fatias 1 a 5 podem ser escritas e testadas antes do token da cobaia voltar; só o aceite espera.
