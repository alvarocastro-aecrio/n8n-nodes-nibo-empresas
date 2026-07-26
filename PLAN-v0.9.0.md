# PLANO DE IMPLEMENTAÇÃO — v0.9.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da cobaia. Também
> sem GUID de registro: os identificadores medidos ficam fora daqui porque não acrescentam
> nada à leitura.

**Escopo da v0.9.0:** **a família das classificações** — tudo que o node pode fazer com
categoria, mais o **centro de custo**, que é o outro classificador do Nibo e que o
agendamento aceita sem que o node ofereça.

**Por que não é a versão prevista.** O anexo A.2 do contrato punha *Payments & Receipts*
como a fatia seguinte. Decisão do Alvaro em 2026-07-26: a 0.9.0 fecha a família das
classificações primeiro. Pagamentos continuam sendo a fatia depois desta.

**Por que é minor e não patch:** capacidades novas — nove operações e um recurso que não
existiam.

**Fora de escopo:** Payment, Receipt e a recategorização de pagamento; NFS-e; anexos; e o
conserto do scanner no CI.

---

## 1. Medições — o que a API respondeu

Tudo abaixo foi medido **na cobaia, em 2026-07-26**, com o código ainda não escrito — curl
puro contra a API de produção, que é a única que existe.

### 1.1 Quatro capacidades que este projeto dava como inexistentes têm caminho

O catálogo do projeto marcava `POST /categories`, `PUT /categories/{id}`,
`DELETE /categories/{id}` e `GET /categories/{id}` como 404, medidos em 2026-07-26, e
concluía: *"categoria é somente leitura nesta API"*. A conclusão estava errada, e o
erro não foi a medição — foi o **caminho**. A família de escrita da categoria não mora em
`/categories`; mora em **`/schedules/categories`**. O Alvaro apontou a documentação
oficial, e a documentação venceu esta rodada:

| ☑ | Rota | Resposta | O que é |
|---|---|---|---|
| ☑ | `GET /schedules/categories/{id}` | **200** | O get-by-id que faltava desde a 0.7.0 |
| ☑ | `POST /schedules/categories` | **200** | **Criar categoria existe.** Corpo `categoryGroupId` + `name` + `type`, `subGroupId` opcional. Devolve o GUID puro, sem envelope |
| ☑ | `GET /schedules/categories/groups` | **200** | Os grupos do plano de contas — 5 na cobaia, envelope `{items,count}` |
| ☑ | `GET /schedules/categories/tree` | **200** | A hierarquia inteira, **array puro** |
| ☑ | `GET /categories/{id}` | 404 | *Controle:* o caminho antigo continua 404 — a medição de antes estava certa **sobre ele** |
| ☑ | `GET /categories?$top=1` | 200 | *Controle:* na mesma corrida, para provar que não é token nem URL base |

**A regra que fica:** um 404 prova a ausência **daquele caminho**, não a ausência da
capacidade. É irmã da regra 12 do CLAUDE (conferir pela API não prova que a tela do Nibo
lê o que foi gravado).

### 1.2 O que de fato não existe

| ☑ | Rota | Resposta |
|---|---|---|
| ☑ | `PUT /schedules/categories/{id}` | **404** |
| ☑ | `DELETE /schedules/categories/{id}` | **404** |

**Consequência de desenho, e ela é séria: criar categoria não tem volta pela API.** Não há
editar nem excluir em caminho nenhum. Quem errar o nome conserta na tela do Nibo, e o node
tem que dizer isso **antes** de a pessoa apertar o botão.

### 1.3 O registro de categoria muda conforme a porta

| Campo | `GET /categories` | `GET /schedules/categories/{id}` |
|---|:--:|:--:|
| `id` · `name` · `type` · `isEditable` · `groupType` · `group{}` | ✅ | ✅ |
| `shortName` · `referenceCode` | ✅ | ✅ |
| `order` | ✅ | ❌ |
| **`subgroupId` · `subgroupName`** | ✅ | ❌ **some** |
| `group.shortName` | ausente | presente, e **copiado do `shortName` da categoria** — defeito da API |

E a terceira porta: **`GET /categories?$filter=id eq <guid>` responde 200** com o registro
completo. **Com aspas em volta do GUID é 500** (*"Found operand types 'Edm.Guid' and
'Edm.String'"*) — é o oposto do que todo outro texto desta API exige, e por isso está
medido em vez de suposto.

### 1.4 Centro de custo — a família inteira, e ela é reversível

| ☑ | Operação | Rota | Resposta |
|---|---|---|---|
| ☑ | Listar | `GET /costcenters` | 200, envelope `{items,count}` |
| ☑ | Buscar por ID | `GET /costcenters/{id}` | 200 |
| ☑ | Criar | `POST /costcenters` | 200, devolve o GUID puro |
| ☑ | Editar | `PUT /costcenters/{id}` | **204**, sem corpo |
| ☑ | Excluir | `DELETE /costcenters/{id}` | **204** |

- **Corpo de escrita:** `description` é **obrigatório** — omitir dá 500 *"A descrição é
  obrigatório."* — e `externalCode` é opcional e grava.
- **A chave é `costCenterId`, não `id`:** `$orderby=id` → **500**; `$orderby=costCenterId`
  → 200. É a chave de paginação.
- **Filtros medidos com 200:** `contains(description,…)`, `contains(tolower(description),…)`,
  `externalCode eq '…'`, `costCenterId eq <guid sem aspas>`, `$orderby=description`.
  **`isDeleted` → 500**: *"Could not find a property named 'isDeleted'"* — o campo não
  existe nesta view, como já não existia em `/categories`.

### 1.5 O rateio por centro de custo dentro do agendamento

O achado que sozinho justifica a versão: **o agendamento aceita centro de custo, e o node
não oferece nada disso na tela.**

| ☑ | O que foi feito | O que a API respondeu |
|---|---|---|
| ☑ | `costCenterValueType: 1` + `costCenters:[{costCenterId, percent}]` | **200** — 1 é **percentual** |
| ☑ | `costCenterValueType: 0` + `costCenters:[{costCenterId, value}]` | **200** — 0 é **valor** |
| ☑ | Tipo 0 com `percent` (o par errado) | 500 *"A soma dos valores totais dos Centros de Custo deve ser igual ao valor do agendamento."* |
| ☑ | Duas linhas, 60% + 30% | 500 *"A soma do percentual total dos Centros de Custo deve ser de 100%"* |
| ☑ | **Duas linhas, 60% + 40%** | **200** |
| ☑ | `PUT` que **não cita** `costCenters` | 204, e o rateio **desaparece** do registro |
| ☑ | `PUT` devolvendo `costCenters` **na forma exata em que o `GET` entrega** | 204, e o rateio **sobrevive** |

Dois pontos que decorrem disso:

1. **Rateio em várias linhas de centro de custo não depende de configuração da empresa** —
   ao contrário do rateio de **categorias**, que a 0.7.7 mediu exigir a chave ligada no
   Nibo (*"Utilize apenas uma categoria"*). A cobaia tem o de categoria desligado e aceitou
   duas linhas de centro de custo na mesma corrida.
2. **O node de hoje não perde rateio nenhum.** O Update dele é `GET → merge → PUT` mandando
   o registro inteiro de volta, o `GET` devolve `costCenters`, e a forma-espelho que ele
   devolveria — `{costCenterId, percent, value, costCenterDescription}`, com os dois números
   e o nome junto — foi **medida e aceita** (204, rateio intacto). Não há defeito em
   produção esperando por esta versão; há uma capacidade ausente da tela.

O `GET` entrega `costCenters:[{costCenterId, percent, value, costCenterDescription}]` e
`costCenterValueType` na raiz do registro.

### 1.6 A árvore

`GET /schedules/categories/tree` responde **array puro** — sem `{items,count}`, como
`/employees` e `/partners`. Um nó por grupo, com `children` dentro, e **subgrupos**
aninhados no meio: a cobaia tem **3 subgrupos e 51 categorias-folha**, e nenhum dos três
subgrupos aparece em `GET /categories` — só o `subgroupId`/`subgroupName` de quem está
dentro deles. Cada folha traz `type`, `isEditable`, `isSubgroup`, `order` e `isDeleted`;
`groupType` **não** vem aqui, e o `referenceCode` do grupo vem **número** onde
`/categories` manda **texto**.

Os dois parâmetros da doc respondem 200 e o segundo filtra de verdade:
`IncludeDeletedCategory` e `CanComposeNFSeValueOnly` — este último derruba juros, multas e
"Outras receitas" da resposta e revela um subgrupo que a chamada sem ele não mostrava.

### 1.7 Subgrupo na criação

| ☑ | O que foi feito | O que a API respondeu |
|---|---|---|
| ☑ | `subGroupId` inexistente | 500 *"Subgroupo não encontrado."* |
| ☑ | `subGroupId` de um subgrupo real | **200**, e a categoria nasce dentro dele |
| ☑ | Como ela volta em `/categories` | Com `subgroupId` e `subgroupName` |
| ☑ | Como ela volta no get-by-id | **Sem sinal nenhum do subgrupo** (é a assimetria da 1.3) |

Uma categoria recém-criada volta **sem `referenceCode` e sem `order`** — os dois são do
plano padrão do Nibo, não de quem cria.

### 1.8 O que ficou na cobaia

**Duas categorias permanentes**, autorizadas pelo Alvaro em 2026-07-26 sabendo que não há
como apagá-las: `SONDA CATEGORIA 0.9.0` (grupo *Despesas operacionais e outras receitas*) e
`SONDA SUBGRUPO 0.9.0` (dentro do subgrupo *Pagamento de impostos retidos*). São evidência
de medição, não sujeira acidental — e não podem ser removidas por ninguém pela API.

**Todo o resto foi apagado**: cinco centros de custo e cinco agendamentos criados nas
sondas, cada um com seu `DELETE` confirmado em 204. A cobaia terminou com
`GET /costcenters` respondendo `count: 0`.

---

## 2. Decisões de recorte

1. **Um recurso `Category` com cinco operações**, não dois recursos *(decidido pelo Alvaro
   em 2026-07-26, vendo os dois menus lado a lado)*. Grupos e árvore entram como
   **Get Many Groups** e **Get Tree** em vez de virarem um recurso `Category - Group`, que
   ficaria esquisito ao lado de um `Category` sozinho e alongaria o menu que a 0.8.2 acabou
   de arrumar.
2. **`Category · Get` lê pela lista filtrada (`id eq`), não pelo get-by-id.** É a única
   forma de Get e Get Many devolverem o **mesmo registro** — pelo get-by-id o subgrupo
   sumiria só no Get, uma assimetria que o node estaria inventando (medição 1.3). Uma lista
   vazia vira *"não encontrado"* aqui, já que para a API isso não é erro.
3. **Criar categoria avisa que não tem volta.** A tela diz, antes do botão, que a API não
   oferece editar nem excluir e que o conserto é na tela do Nibo (medição 1.2).
4. **Create relê o registro depois de criar.** A API devolve só o GUID; o node entrega o
   registro inteiro, que é o que a 0.4.4 já faz com Employee e Partner. A releitura usa a
   lista filtrada, pela decisão 2.
5. **Cost Center sai no molde dos contatos**, com as cinco operações e o ciclo seguro de
   Update. A paginação usa **`costCenterId`** (medição 1.4), e o filtro assistido oferece
   **Description**, **External Code** e **ID** — os três medidos, e nada além disso.
6. **O rateio entra no corpo da criação e dentro do *Update Fields*** — exatamente onde a
   0.7.1 e a 0.7.7 puseram Description, Is Flagged e as linhas de categoria. Não é ajuste
   operacional (CLAUDE §4.1, item 2); é dado do registro.
7. **`costCenterValueType` vira um seletor chamado *Apportion By*** com *Percentage* e
   *Value*, porque `0` e `1` não são o que ninguém escreveria. **Nada é enviado quando não
   há linha nenhuma**, então todo agendamento existente segue idêntico.
8. **O node explica os dois 500 do rateio.** *"A soma do percentual … deve ser de 100%"* e
   *"A soma dos valores totais … deve ser igual ao valor do agendamento"* dizem o que
   aconteceu mas não que o par tipo↔campo pode estar trocado; o node acrescenta isso, como
   já faz com a categoria de tipo errado desde a 0.7.0.
9. **Subgrupo entra na tela, medido** *(decidido pelo Alvaro em 2026-07-26, ciente do
   custo)*. A medição 1.7 custou a segunda categoria permanente da cobaia e é o que
   autoriza o campo a existir.
10. **Nenhuma lista nova carrega no modo token-por-item.** Grupos, subgrupos e centros de
    custo têm ID **por empresa**, igual à categoria: no modo que caminha uma carteira, a
    lista recusa carregar e diz por quê, apontando a operação que lê o ID por empresa. É a
    regra que a 0.7.0 estabeleceu, aplicada aos três campos novos.
11. **O transporte não muda.** Paginação, envelope detectado por formato, merge seguro,
    erros legíveis e OData já servem os dois recursos novos sem uma linha a mais.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.9.0 |
|---|---|
| `resources/category/description.ts` | As quatro operações novas, seus campos e seus filtros |
| `resources/category/execute.ts` | Get pela lista filtrada, Create com releitura, Groups, Tree |
| `resources/category/load.ts` | As listas de **grupo** e **subgrupo** do formulário de criação |
| `resources/costCenter/description.ts` **(novo)** | O recurso, cinco operações, filtro assistido |
| `resources/costCenter/execute.ts` **(novo)** | As cinco, com o ciclo seguro no Update |
| `resources/costCenter/load.ts` **(novo)** | A lista de centros de custo do agendamento |
| `resources/schedule/description.ts` | *Cost Centers* e *Apportion By*, na criação e no menu |
| `resources/schedule/execute.ts` | Monta `costCenters`/`costCenterValueType` e traduz os dois 500 |
| `NiboEmpresas.node.ts` | Declara o recurso novo e os `loadOptions` novos — **e a credencial**, que precisa citar `resource` para o bloco cair no lugar (CLAUDE §4.1, item 1) |
| `transport/*` · `resources/shared/*` · `resources/stakeholder/*` | **Nada** |

---

## 4. Fatias, com teste antes do código

1. **`Category · Get` + `Get Many Groups` + `Get Tree`** *(commit próprio)*. Leitura pura,
   nenhuma escrita envolvida. Testes: Get monta `id eq` **sem aspas** e recusa um ID que não
   é GUID; lista vazia vira "não encontrado"; Groups desempacota o envelope e pagina com
   `$orderby`; Tree aceita **array puro** e não procura `items`; os dois parâmetros da
   árvore só viajam quando ligados; o registro do Get tem os mesmos campos do Get Many.
2. **`Category · Create`** *(commit próprio)*. Testes: o corpo leva `categoryGroupId`,
   `name` e `type`, e `subGroupId` só quando escolhido; a resposta-GUID é relida e o item
   entregue é o registro inteiro; as listas de grupo e subgrupo recusam carregar no modo
   token-por-item, com a explicação da decisão 10; o texto da tela diz que não há volta.
3. **`Cost Center`, o recurso inteiro** *(commit próprio)*. Testes: paginação por
   `costCenterId` e nunca por `id`; o filtro assistido só oferece os três campos medidos;
   Create exige Description e manda External Code quando informado; o Update é o ciclo
   `GET → merge → PUT` e trata o **204 sem corpo**; Delete confirma pelo que a API não
   devolve.
4. **O rateio na criação do agendamento** *(commit próprio)*. Testes: sem linha nenhuma,
   nem `costCenters` nem `costCenterValueType` saem no corpo; *Percentage* manda `percent`
   e *Value* manda `value`, nunca os dois; as duas mensagens de soma da API ganham a
   explicação do node; a lista de centros de custo recusa carregar no modo token-por-item.
5. **O rateio dentro do *Update Fields*** *(commit próprio)*. Testes: o campo não
   acrescentado deixa o rateio **intacto** — que é a medição 1.5 virando teste —; as linhas
   acrescentadas **substituem** a lista inteira, como o merge faz com todo array; e
   *Apportion By* sozinho, sem linha, não troca nada.
6. **README, CLAUDE/contrato e bump 0.9.0** *(commit próprio)*. Inclui corrigir o catálogo
   de endpoints e o gotcha que dizia "categoria é somente leitura" — a correção da 1.1 vale
   para a skill viva e para o `CONTRATO-API.md`, não só para este repositório.

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.9.0 |
|---|---|
| 3 — escrita só na cobaia | Todas as sondas da seção 1 rodaram **só na cobaia**; tudo que tinha `DELETE` foi apagado, e as duas categorias que não têm estão declaradas na 1.8 |
| 4 — nenhum token em código ou commit | Nada novo toca token; as sondas leram o da cobaia de variável de ambiente |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| 6 — nada de caminho absoluto | As sondas são descartáveis e não viraram estado do repositório |
| Decisão 9 — inglês | Campos, rótulos, mensagens de erro e README |
| 7 — instalação real | A 0.9.0 só fecha depois da tela Community Nodes, com a seção 6 preenchida |
| 8 — repo público | Este plano não nomeia cliente, workflow, credencial nem GUID |

---

## 6. Teste e aceite

**Gate local (a cumprir):** `npm run lint`, `npm run lint:community`, `npm test`,
`npm run build`, `npm pack` — todos verdes antes da publicação.

| ☑ | Item | Como será conferido |
|---|---|---|
| ☐ | `Category · Get` devolve o mesmo registro que o Get Many, subgrupo incluído | Contra a cobaia, com a categoria-sonda que tem subgrupo |
| ☐ | `Category · Get Many Groups` traz os cinco grupos | Contra a cobaia |
| ☐ | `Category · Get Tree` traz os subgrupos que o Get Many não mostra | Contra a cobaia, conferindo os três |
| ☐ | `Category · Create` cria com grupo, e cria com subgrupo | **Na tela do n8n**, e o registro olhado **na tela do Nibo** (regra irmã da 7) |
| ☐ | A tela avisa que criar categoria não tem volta | Lido na tela |
| ☐ | `Cost Center` — as cinco operações contra a cobaia, com limpeza no fim | Cada uma criada e apagada de verdade |
| ☐ | Um agendamento criado com rateio percentual aparece **certo na tela do Nibo** | Criado pela tela do n8n, olhado no Nibo |
| ☐ | Um agendamento criado com rateio por valor idem | Idem |
| ☐ | Somas erradas dão a explicação do node, não só o 500 da API | Nas duas formas |
| ☐ | Um agendamento **sem** rateio continua igual ao da 0.8.2 | Regressão, na tela |
| ☐ | Um agendamento com rateio, editado pelo *Update Fields* **sem** citar rateio, mantém o rateio | Regressão, contra a cobaia |
| ☐ | Um node salvo na 0.8.2 executa sem ser tocado | Criação e update de agendamento, e Category · Get Many |
| ☐ | A cobaia termina sem centro de custo e sem agendamento de sonda | `count: 0` nos dois |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de uma instância limpa, com o pacote vindo do npm |
