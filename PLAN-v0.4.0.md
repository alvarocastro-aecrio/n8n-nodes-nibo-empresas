# PLANO DE IMPLEMENTAÇÃO — v0.4.0

> **Não é spec.** A spec é o `DESIGN.md` (repo de planejamento) — aqui valem principalmente
> **§4, §4.1, §4.2 e §5.1** — e este plano não a reconta. Convenção igual à dos planos
> anteriores.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da empresa cobaia
> (regra 4; ver seção 2 sobre onde ele mora).

**Escopo da v0.4.0** (roteiro do DESIGN §9): **a primeira escrita**. O recurso Customer
ganha **Get, Create, Update (merge) e Delete**, somando-se ao Get Many que existe desde a
0.1.1. Nenhum recurso novo na UI — Supplier/Employee/Partner continuam fora.

**Prova o quê** (DESIGN §9): escrita, **inclusive a operação perigosa** — o `PUT` da API
zera todo campo omitido e aceita payload malformado com HTTP 200 sem aplicar nada. A
operação Update do node existe para tornar esse caminho impossível de trilhar por acidente.

**Fora de escopo:** Supplier/Employee/Partner na UI (pós-0.4.0), o `PUT` cru como operação
(DESIGN §4.2 — se um dia houver caso real, entra nomeado), upsert, NFS-e/Schedules/etc.

---

## 1. Decisões de recorte — **travadas** (aprovadas pelo Alvaro em 2026-07-25)

1. **Update sempre confere.** O ciclo é `GET → mescla → PUT → GET de conferência` — 3
   chamadas por item, custo aceito de propósito. A conferência relê o registro e verifica
   que **os caminhos alterados foram aplicados** (com normalização do documento, para não
   dar falso positivo com `Cnpj`/`CNPJ`); resposta `{"Messages":[""]}` no `PUT` é **erro**,
   nunca sucesso. É a defesa contra a maior fonte de bug silencioso da API.
2. **Update só mexe no que foi adicionado.** Os campos editáveis ficam em **Update Fields**
   (collection): o que não for adicionado, o node **não toca** — permanece o que está no
   Nibo. Campo adicionado e deixado **vazio grava vazio**: é assim que se apaga um dado de
   propósito. A mesclagem é profunda (um subcampo de `address` não apaga os irmãos).
3. **Create em uma chamada só, via `POST /customers/FormatType=json`.** A decisão original
   era criar e reler com um GET; a medição da seção 2 mostrou que o sufixo devolve **o
   cadastro completo** — a releitura morreu antes de nascer. A saída do Create é o registro
   como o Nibo o gravou (com `personType`, `isCompany` etc. que a API preenche sozinha).
4. **Delete é operação normal, sem trava extra** — como qualquer node do n8n, quem monta o
   workflow responde pelo que ele faz (o saneamento de cadastros já apaga hoje via HTTP
   Request). Saída: `{ id, deleted: true }`. `DELETE` responde **204 sem corpo** (medido).
5. **`document.type` normalizado para `CNPJ`/`CPF` na saída de todas as operações —
   inclusive o Get Many já publicado.** A API devolve `Cnpj`/`Cpf` na leitura e aceita
   `CNPJ`/`CPF` na escrita (DESIGN §4.1); o node uniformiza a saída e aceita qualquer caixa
   na entrada. ⚠️ **Mudança visível**: quem hoje compara com `'Cnpj'` para de bater. Vai
   destacada no README e no histórico de versões. Aprovada sabendo disso.

**Decorrentes do desenho** (não precisaram de aprovação, ficam registradas):

6. **O ciclo seguro mora no transporte, não no handler.** A 0.5.x vai precisar do mesmo
   `GET → mescla → PUT` para contas e agendamentos — o `PUT` que zera campo é armadilha da
   API inteira. A mesclagem é **função pura**, testável sem contexto de node.
7. **Parse defensivo do id num lugar só.** O `POST` cru devolve o id em formatos diferentes
   por recurso (seção 2). Mesmo com o Create usando `FormatType=json`, o parse existe no
   transporte como retaguarda — outros recursos virão.
8. **O intervalo não se aplica dentro do ciclo de um item.** As 2–3 chamadas de um Update
   são uma operação só; o `Interval Between Requests` continua valendo **entre itens** e
   **entre páginas**, como a 0.3.x documenta.
9. **A escrita herda os dois modos de autenticação de graça.** Toda chamada nova passa por
   `niboApiRequest` com `itemIndex` — Create/Update/Delete funcionam no modo por item sem
   uma linha a mais. O aceite prova isso (seção 7).

---

## 2. Medições de 2026-07-25 — empresa cobaia, ciclo CRUD completo

Feitas antes de qualquer código, com a cobaia em estado de fábrica e devolvida a **zero
registros** no fim. Duas correções entraram no `CONTRATO-API.md` e na cópia da skill (a
skill viva, em outra máquina, está **pendente de ressincronizar**):

| Operação | Resposta medida |
|---|---|
| `POST /customers` | **String JSON crua** `"<guid>"`, HTTP 200 — o contrato punha o recurso no grupo `{"data":…}`; estava desatualizado |
| `POST /customers/FormatType=json` | **O cadastro completo**, HTTP 200 — o veredito "sufixo redundante" valia para schedules e **não** para stakeholders |
| `GET /customers/{id}` | Objeto completo; `document.type` volta `"Cnpj"` |
| `PUT /customers/{id}` | Sucesso = **corpo vazio**, HTTP 200. Com sufixo → **404** (a conferência por GET continua necessária) |
| `DELETE /customers/{id}` | **204** sem corpo |

Curiosidade registrada: após gravar `communication.phone`, o GET passa a devolver também um
`phone` espelhado na raiz do objeto. O node não depende dele.

**Onde mora o token da cobaia** (regra 4): em arquivo de ambiente **fora deste
repositório**, na máquina de desenvolvimento (`~/.config/nibo/cobaia.env`, permissão 600),
e na credencial do n8n de dev quando o teste de instalação chegar. Nunca em código, teste,
fixture, commit — nem neste plano.

---

## 3. Arquitetura — onde cada comportamento mora

Mantém o DESIGN §2.2: **toda armadilha vive no transporte ou no handler, nunca duplicada.**

| Camada | O que ganha na 0.4.0 |
|---|---|
| `transport/merge.ts` **(novo)** | `deepMerge` puro: aplica só os caminhos presentes, valor vazio explícito sobrescreve, subcampo não apaga irmãos |
| `transport/save.ts` **(novo)** | `niboCreate` (POST com `FormatType=json` + parse defensivo do id como retaguarda) e `niboSafeUpdate` (o ciclo da decisão 1, incluindo o erro em `{"Messages":[""]}` e a conferência dos caminhos alterados) |
| `transport/request.ts` | **Nada** — já aceita qualquer método e carrega o `itemIndex` |
| `resources/stakeholder/normalize.ts` **(novo)** | `document.type` nos dois sentidos (decisão 5) |
| `resources/stakeholder/description.ts` | Operações Get/Create/Update/Delete e seus campos (seção 4) |
| `resources/stakeholder/execute.ts` | Roteia as cinco operações; normaliza a saída |
| `NiboEmpresas.node.ts` | **Nada** — subtitle e roteador já cobrem |
| `credentials/…` | **Nada** |

---

## 4. Campos na UI (nome de parâmetro é contrato — CLAUDE decisão 9)

| Operação | Campos |
|---|---|
| **Get** | `customerId` (obrigatório) |
| **Delete** | `customerId` (obrigatório) |
| **Create** | `name` e `documentNumber` + `documentType` (`CNPJ`/`CPF`) de primeira classe; resto em `additionalFields` |
| **Update** | `customerId` + `updateFields` (mesmo cardápio do Create, tudo opcional) |

Dentro de `additionalFields`/`updateFields`: `companyName`, `contactName`, `cellPhone`,
`phone`, `email`, `webSite` e o bloco `address` (`line1`, `number`, `line2`, `district`,
`city`, `state`, `zipCode`, `country`). **`email` é uma string única com vários endereços
separados por vírgula** (contrato da API — não é lista): descrito no campo e no README.

Armadilhas de linter já conhecidas: opções de `operation` em **ordem alfabética** (Create,
Delete, Get, Get Many, Update — o default continua `list`), `action` com caixa exigida, e
descrição de campo **não pode** citar `{{ $json… }}` (o linter reescreve "json" para
"JSON"; a lição 3 da 0.3.0 vale aqui).

---

## 5. Testes unitários (DESIGN §8, camada 1) — sem rede

| Alvo | Casos |
|---|---|
| **Mescla** (`merge`) | Profunda; campo não adicionado fica intacto; vazio explícito sobrescreve; subcampo de `address` não apaga os irmãos |
| **Create** (`save`) | Usa a URL com `FormatType=json`; devolve o objeto da API; retaguarda: id em string crua **e** em `{"data":…}` |
| **Update** (`save`) | Ordem GET → PUT → GET; o corpo do PUT é o objeto mesclado completo; `{"Messages":[""]}` → erro; conferência acusa caminho alterado que não aplicou; `Cnpj` na releitura **não** é falso positivo |
| **Normalização** (`normalize`) | `Cnpj`→`CNPJ` e `Cpf`→`CPF` na saída; qualquer caixa aceita na entrada |
| **Delete** (`execute`) | Envia DELETE no endpoint certo e devolve `{ id, deleted: true }` |
| **Erro por item** | Falha de escrita carrega `itemIndex`; `continueOnFail` segue item a item |

**Regra 4 nos testes:** nenhum token real em fixture — literais óbvios de mentira, como nas
versões anteriores.

---

## 6. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.4.0 |
|---|---|
| 3 — escrita só na cobaia | POST/PUT/DELETE entram no código, e **todo teste real usa exclusivamente o token da cobaia**. Nenhuma chamada de escrita a outra empresa, em nenhuma fase |
| 4 — nenhum token em código ou commit | O token da cobaia mora fora do repositório (seção 2). Nos testes, literais falsos |
| 5 — zero dep de runtime | Mescla e normalização são código próprio; `dependencies` segue `{}` |
| Decisão 9 — inglês | Operações, campos, descrições, erros e README |
| 7 — instalação real | A 0.4.0 fecha com a tabela da seção 7 |

---

## 7. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` — todos verdes.

**Teste de instalação real (regra 7)**, na instância limpa, com a **0.4.1** instalada pela
tela Community Nodes (a 0.4.0 reprovou — ver §9), **contra a empresa cobaia**:

| ☑ | Create devolve o cadastro completo, com `document.type: "CNPJ"` normalizado |
| ☑ | Get devolve o registro criado |
| ☑ | **A prova anti-zeramento:** Update de **um** campo (ex.: telefone) → o campo muda **e** nome, documento e endereço permanecem intactos, conferido por Get |
| ☑ | Delete remove; a lista volta ao tamanho anterior |
| ☑ | **Escrita no modo por item:** um Create com o token vindo do item (o da cobaia) — prova a decorrente 9 |
| ☑ | Regressão: Get Many segue funcionando nos dois modos (0.3.1), agora com `CNPJ` na saída |
| ☑ | CI verde; scanner oficial sem achados — **com uma ressalva**: o scanner roda limpo
      contra o pacote publicado (provenance ✅, análise ✅), mas **quebra dentro da própria
      ferramenta** no runner do GitHub (`Cannot read properties of undefined (reading 'Cjs')`,
      em `@typescript-eslint/typescript-estree`). Não é achado sobre o pacote: acontece
      idêntico na 0.3.1, e o passo do CI não é o portão — quem reprova antes de publicar é o
      `lint:community`. Fica como pendência de CI |
| ☑ | A cobaia termina o aceite com **zero registros de teste** — sobra só o contato
      `ALVARO CASTRO`, que já existia antes do aceite e não foi criado por ele |

---

## 8. Sequência sugerida

Fatias pequenas, teste antes do código, commit por fatia, push e tag **só com o OK do
Alvaro**:

1. `transport/merge.ts` (função pura) + testes
2. `transport/save.ts` (`niboCreate` + `niboSafeUpdate`) + testes
3. Get e Delete: description + execute + testes
4. Create e Update na UI + `normalize.ts` (inclusive a saída do Get Many) + testes
5. README (com a mudança `Cnpj`→`CNPJ` destacada) + bump 0.4.0
6. Publicar → aceite real na cobaia → fechar a tabela da seção 7

---

## 9. Execução (2026-07-25)

Fatias 1 a 5 construídas e commitadas na `main`, uma por commit, teste antes do código.
**Gate local verde:** `lint`, `lint:community`, `test` (100 testes, 8 suítes), `build`,
`pack`. Publicada a 0.4.0, instalada de verdade pela tela Community Nodes — e **o aceite
reprovou no primeiro Update**. Entregue pela **0.4.1**.

### A armadilha que só o aceite acharia: um GET não é um corpo de PUT

O `PUT` respondeu **HTTP 200 e não gravou nada**. Quem acusou foi a conferência do próprio
node ("Nibo did not apply the update to: communication.phone") — exatamente o que a
decisão 1 existe para fazer.

Causa, medida na cobaia com três `PUT` controlados (o registro do próprio aceite):

| Corpo enviado | Resultado |
|---|---|
| O registro inteiro, como o `GET` devolveu, com `communication.phone` trocado | 200, **nada muda** |
| O mesmo corpo **sem o `phone` da raiz** | 200, **grava** — e a raiz volta preenchida sozinha |
| Idem para `email` | Idêntico: com o espelho, ignora; sem, grava |

A leitura devolve `phone` e `email` **duas vezes**: dentro de `communication` e espelhados
na raiz do objeto. Devolvendo os dois no `PUT`, **o espelho vence** — e o espelho carrega o
valor **antigo**, que acabou de ser lido. Ou seja: o caminho "GET → mescla → PUT", feito da
forma óbvia, é garantia de escrita silenciosamente perdida. A curiosidade registrada na
seção 2 ("o GET passa a devolver também um `phone` espelhado na raiz") não era curiosidade.

**Correção (0.4.1):** o transporte passa a receber um `writeBody` — do mesmo jeito que já
recebia o `normalize` — e o recurso entrega o seu: derruba os dois espelhos e mais nada.
Todo o resto que a leitura devolve (`id`, `personType`, `isCompany`, `initialsName`,
`updateDate`) foi medido como inofensivo na volta, e omitir campo nesta API nunca é de
graça.

### Segunda descoberta da mesma bateria: a API preenche o que grava

Pedindo `zipCode` `"22000000"`, toda leitura seguinte devolve `"22000000 "` — com um espaço
no fim. A conferência comparava exato e acusaria "não aplicou" em toda troca de CEP. Passou
a comparar sem espaços nas pontas (e a tratar um branco preenchido como branco).

### Três decisões que saíram diferentes do plano

**1. O endereço é campo a campo, não um bloco.** A seção 4 pedia "o bloco `address`". Na
UI do n8n, um bloco (`fixedCollection`) **envia todos os seus campos, com os valores
padrão, assim que é aberto** — quem só quisesse corrigir o CEP mandaria rua vazia e número
0 junto, e o `PUT` grava exatamente isso. Seria a decisão 2 furada pelo próprio formulário.
Viraram `Address City`, `Address Line 1`, … — agrupados na lista alfabética e sujeitos à
mesma regra de "só vai o que foi adicionado".

**2. Update sem nenhum campo falha o item.** O plano não previa o caso. Reescrever o
registro com ele mesmo é uma escrita como outra qualquer nesta API, e fazer isso em
silêncio contraria o espírito da versão.

**3. A conferência precisa de tolerância medida, não de rigor cego.** Além do espaço no
CEP: um campo apagado de propósito volta como `null`, e números podem voltar como texto.
Os três casos são resposta normal da API, não recusa — e um comparador ingênuo
transformaria a defesa em alarme falso constante.

### O que veio depois, na mesma linha 0.4.x

| Versão | O que entregou | Como foi verificada |
|---|---|---|
| **0.4.2** | Os quatro ajustes de UI pedidos pelo Alvaro (Authentication acima da credencial, intervalo virando *Option*, tipo de documento antes do número, Company Name fora quando é CPF) | Ciclo CRUD completo do Customer na cobaia, verde |
| **0.4.3** | `Fail on Incomplete Results` desce para *Options* e passa a vir **ligado** | Testes unitários; sem caminho novo de API |
| **0.4.4** | **Supplier, Employee e Partner** — os quatro stakeholders | Ciclo completo dos três na cobaia: criar, ler, mudar um campo, reler, listar com o registro dentro, apagar, listar de novo |

**A 0.4.4 achou uma diferença real entre as coleções**, e achou porque o aceite rodou: o
sufixo `/FormatType=json` do POST **não existe** em `/employees` nem em `/partners` — responde
404. O node passou a receber do recurso a informação de quem tem o sufixo e, onde não tem,
faz `POST` normal + `GET` de releitura, para o Create devolver sempre o mesmo formato.
Registrado como armadilha 10 no `CLAUDE.md` da sala de comando. A 11 veio junto: `/partners`
também devolve **array puro**, coisa que o catálogo atribuía só a `/employees`.

### Pendências abertas (nenhuma trava a 0.4.4)

1. **Regra 7 para a 0.4.2 em diante.** A instalação pela tela Community Nodes foi feita com a
   **0.4.1**. Da 0.4.2 à 0.4.4 a verificação usou o pacote instalado por linha de comando na
   instância de dev — mesma rota de arquivos, mas **não** é o teste da regra 7. Falta o
   Alvaro clicar em *Update* uma vez (a 0.4.4 contém as três).
2. **O passo do scanner no CI quebra dentro da própria ferramenta** (ver a ressalva na seção
   7). Vale fixar a versão do scanner ou do Node nesse passo, para que ele volte a significar
   alguma coisa.
