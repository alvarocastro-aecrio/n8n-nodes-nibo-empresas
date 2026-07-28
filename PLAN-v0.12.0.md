# PLANO DE IMPLEMENTAÇÃO — v0.12.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público: nenhum nome de cliente, ID de
> workflow, ID de credencial — e **nenhum token**. Os GUIDs citados são de arquivos e
> agendamentos de sonda criados e apagados por este projeto na empresa de teste.

**Escopo da v0.12.0:** **arquivos e anotações** — o `POST /files`, o anexo no
agendamento, a rota de apagar que ninguém tinha achado, o download, e a anotação
write-only. É o item 5 do anexo A.2 do contrato, a fatia que a 0.11.2 passou na frente.

**Por que agora.** É a próxima pela ordem do contrato, e destrava ~19 nodes HTTP Request
nos dois workflows de NFS-e — que ficam **parcialmente** migrados: eles também precisam da
fatia 7 (NFS-e) para sair inteiros do HTTP Request. Esta versão entrega a metade que
existe, e é a metade que hoje é escrita à mão em todo workflow que anexa documento.

**Por que 0.12.0:** capacidade nova é minor, que é a regra escrita do projeto. A 0.11.2 foi
exceção consciente e declarada como tal — a convenção volta a valer aqui, como o plano
dela prometeu.

**Fora de escopo:** NFS-e (item 7) e Collections; anexo em `/payments` e `/receipts`
(não existe rota — 1.9); leitura de anotação (não existe, e desta vez foi caçada — 1.8);
apagar arquivo sem citar um agendamento (decisão 7); subir mais de um arquivo por chamada
(a API aceita, ninguém pediu — 1.1).

---

## 1. Medições — o que a API respondeu

Tudo medido **na cobaia, na noite de 2026-07-27 para 28**, com escrita liberada pelo
Alvaro e o resíduo declarado na 1.10. Toda escrita foi em dois agendamentos criados pelas
próprias sondas, apagados ao final.

### 1.1 O upload devolve um ARRAY, e o nome do campo não importa

`POST /files` responde **200 com um array de objetos**:

```json
[{ "fileId": "…", "fileName": "sonda.pdf" }]
```

Não é o GUID nu (como `POST /accounts`), não é o envelope `{items, count}`, não é
`{"data": …}`. É uma quarta forma, e o parse defensivo do projeto precisa conhecê-la.

| O que testei | O que respondeu |
|---|---|
| Um arquivo, campo `file` | ✔ array com 1 entrada |
| **Dois arquivos na mesma chamada** | ✔ array com **2 entradas** — a API aceita lote |
| Campo chamado `anexo` em vez de `file` | ✔ **igual** — o nome do campo é ignorado |
| Um `.exe` | ✔ aceito — **não há filtro de tipo** |
| Requisição sem corpo | 🔴 **411**, corpo em **HTML** |

O catálogo dizia "campo `file`" como se fosse exigência da API. Não é: é só o que os
workflows usam hoje.

### 1.2 🔴 O teto é 10 MB exatos, e ele falha de três jeitos, nenhum deles JSON

| Tamanho | Resposta |
|---|---|
| 3 · 4 · 5 · 8 · 9 MB | 200 |
| **10 MB − 1 KB** | **200** |
| **10 MB** | 🔴 **500** `internal_server_error` — *"O Nibo se comportou de forma inesperada."* |
| 12 MB | 🔴 500, igual |
| 30 MB | 🔴 **413**, corpo em **texto puro**: *"The page was not displayed because the request entity is too large."* |

O teto é o `maxRequestLength` clássico do ASP.NET: **10 485 760 bytes de requisição**. A
frase que a API devolve no 500 não menciona tamanho, arquivo, nem limite — é a mesma
mensagem de qualquer defeito interno. Quem receber isso não tem como saber o que fazer.

É a mesma família do 429 da 0.11.2: **um corpo de erro que não é JSON**, num transporte
que assume JSON. Com o agravante de serem três formas diferentes no mesmo endpoint (HTML
no 411, texto puro no 413, JSON no 500).

### 1.3 Anexar: 204, idempotente, e a rota de crédito serve para débito

`POST /schedules/credit/{id}/files/attach`, corpo `["<fileId>"]` → **204 No Content**.

- **Não duplica.** Anexei o mesmo `fileId` duas vezes; a lista continuou com `count: 1`.
  Ao contrário da anotação (1.8), o attach é idempotente por conta da API.
- **Funciona com ID de débito** — e `/schedules/debit/{id}/files` é **404**. É a mesma
  universalidade do `GET /schedules/credit/{id}` (assimetria 11 do contrato): existe uma
  rota só, e ela se chama "credit".
- **O mesmo arquivo pode estar em mais de um agendamento.** Anexar não consome o `fileId`.

`GET /schedules/credit/{id}/files` responde o **envelope de sempre** (`{items, count}`),
com `fileId`, `name`, `size` em bytes, `createDate` (a hora do upload), `referenceDate`
(a hora do anexo) e `url` (1.6).

### 1.4 🔴 O 204 que não anexa nada

Arquivo real + GUID de agendamento **inventado** → **204**, sem uma palavra.

A API confere o **arquivo** e **nunca confere o agendamento**: um `fileId` que não existe
responde 500 *"Arquivo não encontrado"*, mas um `scheduleId` que não existe passa reto.

E não dá para descobrir depois:

```
GET /schedules/credit/{guid-inventado}/files  →  200  {"items":[],"count":0}
```

**"Não tem arquivo" e "não existe esse agendamento" são a mesma resposta.** É a família do
`200` que não grava (1.5 do contrato) — a mesma armadilha do `POST /payments` sem conta,
que a 0.10.0 resolveu recusando antes de mandar.

### 1.5 🔴 Existe rota de apagar, não está documentada, e não é "desanexar"

**`DELETE /schedules/credit/{scheduleId}/files/{fileId}` → 204.** Não está no
`endpoints.md`, não está na documentação do Nibo, e não estava em suspeita nenhuma.

O que ela faz é mais do que o nome do caminho promete:

| Sonda | Resultado |
|---|---|
| Apagar citando um agendamento onde o arquivo **está** anexado | 204 — e some da lista |
| Apagar citando um agendamento onde ele **nunca esteve** | 🔴 **204** — o `scheduleId` é **ignorado** |
| Apagar citando um GUID de agendamento **só de zeros** | 🔴 **204** — idem |
| Depois de apagar, a lista do **outro** agendamento onde estava | `count: 0` — sumiu de lá também |
| Depois de apagar, reanexar o mesmo `fileId` | 500 *"Arquivo não encontrado"* |

Ou seja: **não é desanexar de um lançamento, é destruir o arquivo.** O agendamento no
caminho é decoração. Um node que chamasse isso de *Detach* estaria mentindo na tela.

⚠️ **E o arquivo continua baixando depois** — ver 1.6. O que o DELETE apaga é o registro
no Nibo, não o objeto no armazenamento.

Rotas que **não** existem, testadas na mesma leva: `POST …/files/detach`,
`POST …/files/remove`, `DELETE …/files` com array no corpo, `DELETE /files/{id}`,
`GET /files/{id}`, `GET /files`. **Não há como listar os arquivos de uma empresa** —
um arquivo que subiu e não foi anexado é invisível e não tem como ser achado de volta.

### 1.6 🔴 O `url` da lista é público — qualquer um baixa, sem token

O campo `url` que a lista devolve é
`https://arquivos.nibo.com.br/download/{fileId}?fileName=…`, e ele:

- responde **302** para um link assinado do Azure Blob (SAS de 7 dias, regerado a cada
  acesso) e **entrega o documento sem autenticação nenhuma** — conferido com `curl` limpo,
  sem header, sem cookie;
- **funciona sem o `?fileName=`**, e com um `fileName` trocado entrega o mesmo arquivo com
  o content-type certo — o nome na URL é decorativo, o tipo vem do que está guardado;
- **continua funcionando depois do DELETE da 1.5**;
- responde **404 com `application/problem+json`** para `fileId` inexistente — a quarta
  forma de corpo de erro deste conjunto de rotas.

Consequência prática: **quem tem o `fileId` tem o documento do cliente.** Isso não é
defeito a consertar no node — é fato da API que quem usa precisa saber, e por isso vira
frase no README e na descrição do campo.

### 1.7 O anexo sobrevive ao agendamento

Apaguei o agendamento de sonda (`DELETE /schedules/debit/{id}` → 204). Depois disso:

| Leitura | Resposta |
|---|---|
| `GET /schedules/credit/{id}` (o agendamento) | **500** — some assim, não com 404 |
| `GET /schedules/credit/{id}/files` | **200, `count: 1`** — o anexo continua lá |
| A `url` do arquivo | **200**, baixa normalmente |

A lista de anexos é um armazenamento à parte, chaveado pelo `referenceId`, que não segue o
lançamento. Não muda o desenho do node; muda a limpeza de resíduo, e é o motivo de a
sonda ter apagado arquivo por arquivo em vez de confiar no `DELETE` do agendamento.

### 1.8 🔴 Anotação: write-only pior do que estava documentado

`POST /schedules/credit/{id}/annotations`, corpo `{"body": "…"}` → **200 com um GUID nu**.
O catálogo dizia só "cria"; ela devolve um **`annotationId`**.

**E esse ID não abre porta nenhuma.** Caçado como o gotcha 14 manda — 404 em todas:

```
GET    /annotations/{aid}                        GET /annotations
GET    /schedules/credit/{id}/annotations/{aid}  GET /schedules/annotations
DELETE /schedules/credit/{id}/annotations/{aid}  GET /schedules/credit/annotations
DELETE /annotations/{aid}                        GET /schedules/credit/{id}/annotation
PUT    /schedules/credit/{id}/annotations/{aid}  GET /customers/{id}/annotations
```

O registro do agendamento também não traz anotação (28 campos, nenhum deles). Desta vez a
capacidade **realmente** não existe: é um identificador que não serve para nada.

| Sonda | Resposta |
|---|---|
| O mesmo texto duas vezes | 🔴 dois IDs diferentes — **duplica**, confirmado |
| Em agendamento de **débito**, pela rota `/credit` | ✔ 200 |
| `{"body": ""}` ou `{}` | 500 *"Informe uma anotação."* |
| Acentos e URL, mandados via arquivo | ✔ 200 |
| 🔴 **Em agendamento inexistente** | 🔴 **200 com ID** — o mesmo buraco da 1.4 |

A API valida o **texto** e não valida o **agendamento**, exatamente como no attach. Só que
aqui não há releitura possível: uma anotação escrita no vazio **não tem como ser
descoberta depois**, nunca.

### 1.9 O resto do contorno

- Não há anexo em `/payments` nem `/receipts`: `GET /payments/{id}/annotations` é 404, e
  não há rota de arquivo nessas coleções. Anexo e anotação vivem **só** no agendamento.
- A lista de arquivos aceita `$top`, `$skip`, `$orderby` e `$filter` com **200** — mas o
  gotcha 16 vale (200 não prova que ordenou), e a coleção é minúscula. Não foi medido se
  ordenam de verdade, e o node não vai depender disso (decisão 4).
- Os corpos de erro `validation_error` vêm com ~10 KB de stack trace .NET junto. O
  `classifyNiboError` já lê o `error_description` e ignora o resto.

### 1.10 O que ficou na cobaia

Os **dois agendamentos de sonda foram apagados**, e todo arquivo cujo `fileId` eu capturei
foi apagado pela rota da 1.5 (conferido: as duas listas terminaram em `count: 0`).

⚠️ **Permanente, e declarado — 4 arquivos.** Na caça ao teto de tamanho (1.2) subi blocos
de 3, 4, 5 e 8 MB de bytes aleatórios **sem guardar os `fileId`**. Como `GET /files` é 404
(1.5), **não existe jeito de listá-los nem de achá-los de volta**. Não estão anexados a
lançamento nenhum e não aparecem em tela nenhuma; ocupam espaço no armazenamento da
cobaia e é só. O erro foi meu e está aqui porque resíduo não declarado é resíduo que
volta como surpresa.

⚠️ **Permanente — ~7 anotações**, nos dois agendamentos de sonda já apagados e uma num ID
inventado. Não há rota de apagar (1.8).

---

## 2. Decisões de recorte

1. **Três recursos novos, sete operações.** `File` (Upload · Upload and Attach ·
   Download), `Schedule File` (Get Many · Attach · Delete) e `Annotation` (Create). A
   divisão é a da 1.5 e da 1.6: o que é do arquivo em si fica em `File`, o que precisa de
   um agendamento fica em `Schedule File`.

2. **O binário sai do item do n8n, nunca do disco.** É requisito do programa de
   verificação e regra da arquitetura. `Upload` lê `helpers.getBinaryDataBuffer` da
   propriedade binária escolhida (padrão `data`), e `Download` devolve pelo mesmo caminho.
   Nenhum `fs` em lugar nenhum.

3. **Um arquivo por chamada, mesmo a API aceitando lote.** A 1.1 mediu que dois `-F` na
   mesma requisição sobem dois arquivos. Ninguém pediu isso, e o idioma do n8n é uma
   propriedade binária por item — quem tem N arquivos tem N itens. A medição fica
   registrada para quando o uso aparecer.

4. **`Schedule File · Get Many` lê numa chamada só, sem paginar.** A coleção é de unidades
   e o `$orderby` dela não foi provado (1.9); paginar com uma chave que talvez não ordene
   é como se lê um registro duas vezes e se perde outro. O node lê tudo, aplica o `Limit`
   no cliente, e a checagem de varredura incompleta que já existe compara com o `count`.

5. **Toda escrita confere o agendamento — cada uma do jeito que dá.** É a defesa contra a
   1.4 e a 1.8, e são dois remédios porque são dois problemas:
   - **`Attach` releia depois:** anexa e relê a lista, e só diz que deu certo se o
     `fileId` estiver lá. É o padrão de read-back da 0.10.0.
   - **`Annotation · Create` confere antes:** um `GET /schedules/credit/{id}` antes de
     escrever, porque **depois não existe conferência possível** (1.8). Uma chamada a mais
     por item é o preço de não escrever no vazio para sempre.

6. **`Upload and Attach` é uma operação e duas chamadas — e diz qual delas passou.** Se o
   attach falhar depois de o upload ter dado certo, a resposta informa que o arquivo
   **subiu**, com o `fileId`, para ninguém subir de novo. Mesma lição do "went through"
   da 0.10.0: a frase errada faz o workflow duplicar.

7. **`Delete` mora em `Schedule File` e pede o agendamento, mesmo a API ignorando.**
   Decisão do Alvaro em 2026-07-28. A rota exige um `scheduleId` no caminho e a 1.5 mediu
   que qualquer um serve — inclusive um GUID de zeros. Pedir o de verdade custa um campo e
   compra duas coisas: o node continua funcionando se o Nibo passar a conferir, e a tela
   não se apoia num detalhe não documentado de uma rota não documentada.

8. **O notice do `Delete` diz o que a rota faz, não o que o nome dela sugere:** apaga o
   arquivo de **todos** os lançamentos, e o link público continua servindo o documento
   depois (1.5, 1.6). Mesmo padrão dos notices de Categoria (0.9.0) e Conta (0.11.2).

9. **O `url` sai na resposta, com o aviso junto.** É o único jeito de buscar o arquivo, e
   esconder um link público não o torna privado. README e descrição do campo dizem, com
   todas as letras, que quem tem a URL baixa o documento sem token.

10. **`Upload` recusa antes de sair, e o corte é medido, não redondo.** O teto da 1.2 é
    da **requisição inteira** (10 485 760 bytes), não do arquivo; o envelope multipart
    entra junto. Como 10 MB − 1 KB passou e 10 MB reprovou, a margem cabe folgada em
    1 KB: o node recusa binário **≥ 10 484 736 bytes** e diz o limite na mensagem. O
    tamanho é conhecido antes da chamada (é o buffer) e a resposta da API para esse caso
    é *"O Nibo se comportou de forma inesperada"* — inútil para quem recebe.

11. **`Annotation · Create` avisa que duplica.** Não há leitura, não há idempotência
    possível (1.8); o notice diz que reprocessar o mesmo item grava a anotação de novo, e
    que o controle é de quem chama. É a frase que hoje falta nos workflows de NFS-e.

12. **413 e o 500-de-tamanho viram classificação no transporte.** `classifyNiboError`
    aprende o 413 com corpo não-JSON e o 500 com `internal_server_error` vindo do upload,
    e responde com o teto medido. Sem retry — só a frase certa no lugar da genérica.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.12.0 |
|---|---|
| `resources/file/description.ts` · `execute.ts` | **Novo.** Upload, Upload and Attach, Download; a leitura do binário e a guarda de 10 MB |
| `resources/scheduleFile/description.ts` · `execute.ts` | **Novo.** Get Many, Attach (com read-back), Delete (com o notice) |
| `resources/annotation/description.ts` · `execute.ts` | **Novo.** Create, com o `GET` de conferência e o notice de duplicação |
| `transport/request.ts` | Um **caminho binário**: hoje a função fixa `Content-Type: application/json` e `json: true` para todo mundo, e multipart não passa por ali. Ganha uma saída para corpo binário e outra para resposta binária, com os dois modos de autenticação intactos |
| `transport/errors.ts` | 413 e o 500 de upload grande (decisão 12) |
| `NiboEmpresas.node.ts` | Os três recursos na lista, nos handlers, e nos imports de `operations`/`fields` |
| Credencial | **Nada a fazer** — o `displayOptions.show` dela é montado de `RESOURCES.map(...)`, então recurso novo entra sozinho. A armadilha da seção 4.1 do CLAUDE.md já está desarmada por construção |
| `transport/paginate.ts` · `odata.ts` · `merge.ts` · `save.ts` | **Nada** |

---

## 4. Fatias, com teste antes do código

1. **Transporte: corpo binário, resposta binária, 413 e o 500 de tamanho**
   *(commit próprio)*. Testes: multipart monta a requisição com o binário e **sem** o
   `Content-Type: application/json`; os dois modos de autenticação continuam mandando o
   `ApiToken`; resposta binária não passa por `JSON.parse`; 413 com corpo texto puro e 500
   `internal_server_error` viram a mensagem do teto; os kinds existentes não mudam.

2. **`File · Upload` e `File · Download`** *(commit próprio)*. Testes: lê a propriedade
   binária escolhida e recusa a que não existe no item; **recusa o binário do corte da
   decisão 10 sem chamada nenhuma sair**, e o que fica um byte abaixo passa; a mensagem
   cita o limite; o array de resposta é lido (1.1) e vira `fileId` na saída;
   `Download` devolve binário com nome e mime; `fileId` inexistente vira erro legível.

3. **`Schedule File · Get Many`, `Attach` e `Delete`** *(commit próprio)*. Testes: a lista
   desempacota o envelope e devolve o `url`; `Attach` **relê e reprova quando o `fileId`
   não aparece** (é o teste da 1.4); anexar duas vezes não é erro (1.3); a rota usada é
   sempre `/schedules/credit/...`, inclusive para agendamento de débito; `Delete` chama a
   rota da 1.5 e o notice existe e fala em "every schedule" e no link público.

4. **`File · Upload and Attach`** *(commit próprio)*. Testes: as duas chamadas na ordem;
   attach que falha depois de upload que passou responde citando o `fileId` e dizendo que
   o arquivo subiu (decisão 6); a confirmação da fatia 3 vale aqui também.

5. **`Annotation · Create`** *(commit próprio)*. Testes: **o `GET` de conferência sai
   antes do `POST`** e um agendamento inexistente é recusado **sem a escrita sair** (o
   teste da 1.8); corpo vazio é recusado no node, não na API; o GUID nu da resposta é
   lido; o notice de duplicação existe.

6. **README, catálogo e bump 0.12.0** *(commit próprio)*. `endpoints.md`/`payloads.md`: o
   array do upload e o campo ignorado, o teto de 10 MB e as três formas de falhar, o
   attach idempotente e universal, o **204 que não anexa**, a **rota de DELETE que não
   está em documentação nenhuma**, o link público, o anexo que sobrevive ao lançamento, e
   a anotação com ID que não abre porta. `SKILL.md`: gotchas novos + triagem. A nota de
   ressincronização do CLAUDE.md.

---

## 5. Onde cada regra inviolável continua atendida

| Regra | Na v0.12.0 |
|---|---|
| 3 — escrita só na cobaia | Sondas da seção 1: só a cobaia, liberação explícita de 2026-07-27; resíduo na 1.10 |
| 4 — nenhum token em código ou commit | Sondas leram de variável de ambiente |
| 5 — zero dep de runtime | `dependencies` segue `{}` — multipart e binário saem dos helpers do n8n |
| 6 — nada de caminho absoluto | Sondas descartáveis no scratchpad; **nenhum `fs` no node** (decisão 2) |
| Decisão 9 (projeto) — inglês | Campos, rótulos, notices, mensagens, README |
| 7 — instalação real | A 0.12.0 só fecha depois da tela Community Nodes |
| 8 — repo público | Este plano não nomeia cliente nem credencial |
| Verificação — um serviço só | `arquivos.nibo.com.br` é o mesmo serviço, e é o host que a própria API devolve no `url` |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` verdes antes de cada commit de fatia.

**Aceite:** pelo arranjo de sempre — `IExecuteFunctions` real dirigindo os handlers de
`dist/` contra a cobaia, nunca curl. Um agendamento de sonda novo, apagado no fim, e cada
arquivo apagado pelo `fileId` **capturado na hora** (foi o que faltou na 1.10).

| ☐ | Item | Como conferir |
|---|---|---|
| ☐ | `Upload` sobe um PDF vindo do binário do item | `fileId` na saída |
| ☐ | `Upload` recusa 10 MB **sem chamada sair** | Decisão 10 |
| ☐ | `Upload and Attach` sobe e anexa numa operação | Lista do agendamento |
| ☐ | `Attach` reprova em agendamento inexistente | É o teste da 1.4 — hoje a API diz 204 |
| ☐ | `Attach` funciona em agendamento de **débito** | Pela rota `/credit` (1.3) |
| ☐ | `Get Many` lista com `url`, `size` e as duas datas | Contra a cobaia |
| ☐ | `Download` traz o arquivo de volta e ele abre | Binário no item seguinte |
| ☐ | `Delete` apaga, e a lista fica vazia | 1.5 |
| ☐ | `Annotation · Create` recusa agendamento inexistente | **Sem a escrita sair** (1.8) |
| ☐ | `Annotation · Create` grava, e a anotação aparece **na tela do Nibo** | Regra irmã da 7 — é a única leitura que existe |
| ☐ | Node salvo na 0.11.x executa sem ser tocado | `Get Balances` e `Schedule · Get Many` |
| ☐ | Resíduo conferido: agendamento apagado, arquivos apagados | 1.10 |
| ☐ | Um anexo feito pelo node aparece **certo na tela do Nibo** | Regra irmã da 7 |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de instância limpa |

---

## 7. O que ficou decidido

| # | Estava em aberto | Ficou |
|---|---|---|
| 1 | Escrita na cobaia para medir | **Liberada** em 2026-07-27; resíduo declarado (1.10) |
| 2 | Se o `Download` entra | **Entra** — decisão do Alvaro, 2026-07-28: ciclo fechado subir → anexar → listar → baixar |
| 3 | Onde mora o `Delete` e se pede o agendamento | **`Schedule File · Delete`, pedindo os dois IDs** — decisão do Alvaro, 2026-07-28 (decisão 7) |
| 4 | A numeração | **0.12.0** — capacidade nova é minor; a exceção da 0.11.2 não se repete |

Nada mais depende de decisão. A fatia 1 pode começar com o OK do Alvaro.
