# PLANO DE IMPLEMENTAÇÃO — v0.8.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da cobaia.

**Escopo da v0.8.0:** **escolher o contato de um agendamento pela tela**, com busca no
servidor — o que a 0.7.0 fez pela categoria, agora para o `stakeholderId`.

**Por que é minor e não patch:** capacidade nova. Toda a série 0.7.1 → 0.7.8 refinou o que
a 0.7.0 entregou (recarga da lista, código de referência, datas sem hora, detalhe da
linha, rótulo). Aqui passa a existir algo que não existia.

**Decidido com o Alvaro em 2026-07-26:** o componente de busca do n8n (`resourceLocator`),
porque a lista simples não escala — as empresas dele têm **milhares** de clientes.

**Fora de escopo:** lista de contato em qualquer campo que não seja o do agendamento;
mudança nos recursos Customer/Supplier/Employee/Partner; e o conserto do scanner no CI.

---

## 1. Medições — o que a API respondeu

### 1.1 Quem pode ser contato de um agendamento (2026-07-26, na cobaia)

Matriz completa, criando de verdade e apagando cada registro criado:

| Contato | `POST /schedules/credit` | `POST /schedules/debit` |
|---|---|---|
| **Customer** | ✅ 200 | ❌ 500 `Stakeholder is not compatible` |
| **Supplier** | ❌ 500 `Stakeholder is not compatible` | ✅ 200 |
| **Employee** | ❌ 500 `Stakeholder is not compatible` | ✅ 200 |
| **Partner** | ✅ 200 | ✅ 200 |

**A regra é do Nibo, não do node.** O sócio entra nos dois — aporte de capital entra,
retirada sai. É o mesmo caso da categoria: filtrar a lista impede um erro que existe.

### 1.2 Escala, que é o que muda o desenho

| Fato | Consequência |
|---|---|
| O contrato registra uma empresa com **14.194 clientes** | Carregar tudo são ~28 chamadas só para abrir o campo |
| `contains(name,…)` em `/customers` responde 200 (medido na 0.5.0) | A busca pode ser **no servidor**, não no navegador |
| `$orderby=id` + `$skip` pagina os quatro stakeholders (medido na 0.2.0) | A paginação da busca já tem chave estável |

A lista simples da categoria (22 itens, tudo de uma vez) **não serve aqui**: ou trunca em
silêncio — que este projeto recusa — ou demora demais.

### 1.3 O que o n8n faz com um valor antigo (lido no fonte, 2026-07-26)

| ☑ | Pergunta | Resposta |
|---|---|---|
| ☑ | `getNodeParameters` descarta um texto puro num campo que virou `resourceLocator`? | ❌ **Não.** Ele copia o que estiver lá: `nodeValues[name] !== undefined ? deepCopy(...) : { __rl: true, ...default }` |
| ☑ | O editor sabe ler um valor que não é `{__rl,…}`? | ✅ Sim, e em vários pontos: `isResourceLocatorValue(x) ? x.value : x` |
| ☑ | Dá para pôr um `resourceLocator` dentro de um `collection` (o Update Fields)? | ✅ Sim — nodes oficiais desta versão fazem (Google Calendar) |

### 1.4 Medido no editor (2026-07-26) — o node antigo não perde nada

Um node salvo com `stakeholderId` em texto puro, aberto no navegador contra a 0.8.0
instalada num n8n 2.18.5 limpo:

| ☑ | O componente aparece? | ✅ Sim |
| ☑ | O ID antigo aparece? | ✅ **Sim, na caixa**: `2efffcd0-8730-…` está lá e legível |
| ☑ | O seletor de modo? | ⚠️ Fica **em branco** ("Mode…") em vez de marcar "By ID" |

**Conclusão: não quebra.** O valor sobrevive na tela e em execução — as duas formas foram
criadas de verdade na cobaia e caíram no contato certo. O único incômodo é cosmético: ao
abrir um node antigo, o modo está em branco e vale escolher "By ID" para deixar arrumado.

De brinde, a mesma tela confirmou três mudanças da 0.7.x rodando juntas: datas **sem
relógio** (`2026-12-01`), Description e Is Flagged **acima** de Categories, e a categoria
mostrando só o nome.

### 1.5 O contato pelo Update, medido na cobaia (2026-07-26)

O código **compilado** rodado contra a API, um agendamento de crédito criado, trocado de
contato quatro vezes e apagado no fim:

| ☑ | O que foi feito | O que a API respondeu |
|---|---|---|
| ☑ | Criar escolhendo o contato pela busca (`{__rl, mode:'list', value}`) | Caiu no cliente escolhido |
| ☑ | Update trocando o contato, na mesma forma do componente | Passou a ser o sócio |
| ☑ | Update com o ID em **texto puro** (o que um node de antes da 0.8.0 carrega) | Voltou a ser o cliente |
| ☑ | Update com o campo acrescentado e **vazio** | Recusado antes de qualquer chamada: *"This schedule names no contact"* |
| ☑ | Update de outro campo, sem citar o contato | Contato intacto, descrição alterada |
| ☑ | Apagar | Cobaia com **zero** agendamentos nos dois lados |

E a medição que autorizou o campo dentro do menu, refeita no n8n **2.18.5 desta máquina**:
**31 campos de nodes oficiais são `resourceLocator` dentro de `collection`** — Airtable,
Discord, Gong e Google Calendar entre eles.

---

## 2. Decisões de recorte

1. **O parâmetro continua se chamando `stakeholderId`** *(nome de parâmetro é contrato —
   CLAUDE decisão 9)*. Muda o tipo, não o nome.
2. **O handler lê as duas formas.** Objeto `{__rl, value}` ou texto puro, sem perguntar
   qual versão salvou. É o que garante que **em execução nada quebra**, independentemente
   do que o editor desenhe.
3. **A lista mostra só quem a API aceita** — clientes e sócios no crédito, fornecedores,
   funcionários e sócios no débito (tabela 1.1). Mesmo princípio da categoria: a regra é
   do Nibo e a lista a respeita.
4. **A busca é no servidor**, com `contains(tolower(name),…)`, e a paginação continua de
   onde parou. Nada de trazer tudo e filtrar no navegador.
5. **O tipo do contato vai no rótulo de cada opção** — "ACME LTDA" sozinho não distingue
   um cliente de um sócio quando os dois aparecem na mesma lista.
6. **O modo "por ID" continua existindo**, que é como um workflow que lê o ID do item
   anterior segue funcionando. Foi o que o Alvaro apontou: a lista não tira a expressão.
7. **O Update Fields ganha o mesmo campo**, já que `resourceLocator` dentro de
   `collection` é suportado (medição 1.3).

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.8.0 |
|---|---|
| `resources/stakeholder/search.ts` **(novo)** | O `listSearch`: quais coleções, a busca, a paginação, o rótulo |
| `resources/schedule/description.ts` | `stakeholderId` vira `resourceLocator` nos dois lugares |
| `resources/schedule/execute.ts` | Lê o ID das duas formas |
| `NiboEmpresas.node.ts` | Declara `methods.listSearch` |
| `transport/*` · `resources/category/*` · `resources/shared/*` | **Nada** |

---

## 4. Fatias, com teste antes do código

1. **`resources/stakeholder/search.ts`** *(commit próprio)*. Testes: crédito pede
   `/customers` e `/partners`, débito pede `/suppliers`, `/employees` e `/partners`; a
   busca vira `contains(tolower(name),…)` escapado; o rótulo diz o tipo; a paginação
   continua de onde parou e termina; no modo per-item recusa como a categoria faz.
2. **O campo vira `resourceLocator`** *(commit próprio)*. Testes: o parâmetro continua
   `stakeholderId`, continua obrigatório, tem os dois modos, e o método que ele nomeia
   existe no node.
3. **O handler lê as duas formas** *(commit próprio)*. Testes: objeto do componente, texto
   puro de um node antigo, e vazio recusado antes de qualquer chamada.
4. **Medição 1.4 + README + bump 0.8.0** *(commit próprio)*.
5. **O mesmo campo no Update Fields** *(commit próprio)* — a decisão 7, que as fatias 2 e 3
   deixaram de fora ao cobrirem só a tela de criação. Testes: dentro do menu o parâmetro
   continua `stakeholderId`, é `resourceLocator`, não é obrigatório e nomeia a mesma busca;
   e o handler lê as duas formas também no update, deixa o contato em paz quando o campo
   não foi acrescentado, e recusa o campo acrescentado e vazio — como já faz com as linhas
   de categoria.

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.8.0 |
|---|---|
| 3 — escrita só na cobaia | A matriz da 1.1 escreveu **só na cobaia**, e cada registro criado foi apagado |
| 4 — nenhum token em código ou commit | Nada novo toca token |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| Decisão 9 — inglês | Campos, rótulos e README |
| 7 — instalação real | A 0.8.0 fecha com a tabela da seção 6 |
| 8 — repo público | Este plano não nomeia cliente, workflow nem credencial |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test` (439), `npm run build`,
`npm pack` — todos verdes em 2026-07-26.

| ☑ | Item | Como foi conferido |
|---|---|---|
| ☑ | No Credit Schedule, o campo Stakeholder busca e lista **clientes e sócios** | A busca compilada contra a cobaia: 2 clientes + 1 sócio, cada opção dizendo o tipo |
| ☑ | No Debit Schedule, lista **fornecedores, funcionários e sócios** | Mesma corrida: 1 de cada, e nenhum cliente |
| ☑ | Digitar parte de um nome busca no servidor e traz o contato | `contains(tolower(name),'a')` foi para a API e voltou com os três do crédito |
| ☑ | O modo "por ID" aceita um GUID colado | O ID em texto puro criou e atualizou de verdade (1.5). A **expressão** resolve antes do node, no editor, e não foi rodada na tela |
| ☑ | Criar um recebimento com um contato escolhido da lista funciona na cobaia | Medição 1.5, item 1 |
| ☑ | **Um node salvo na 0.7.8, com o ID em texto puro, executa sem ser tocado** | Medição 1.4 (criação) e 1.5 (update) |
| ☑ | O que esse node antigo mostra na tela está documentado (medição 1.4) | Está na 1.4 e no README |
| ☑ | Regressão: categoria, datas e detalhe da linha como na 0.7.8 | Datas e ordem do formulário vistas na tela (1.4); o resto, pela suíte |
| ☑ | A cobaia termina com zero agendamentos | Conferido no fim da 1.5: crédito 0, débito 0 |
| ☑ | **Instalação real (regra 7)** | O pacote `.tgz` da 0.8.0 instalado no n8n 2.18.5 de dev: sobe sem erro, o node carrega do pacote e traz a busca nos dois formulários |
| ☐ | **Na tela**: o campo dentro de *Update Fields* abre a busca e escolhe um contato | Falta olhar no navegador — é a única parte que um comando não prova |
