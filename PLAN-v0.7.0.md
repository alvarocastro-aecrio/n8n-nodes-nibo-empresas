# PLANO DE IMPLEMENTAÇÃO — v0.7.0

> **Não é spec.** A spec é o `DESIGN.md` e o `CONTRATO-API.md` (repo de planejamento).
> Convenção igual à dos planos anteriores: um documento só, que carrega as medições, as
> decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial — e **nenhum token**, nem o da empresa cobaia.

**Escopo da v0.7.0:** **descobrir uma categoria de dentro do node.** Um recurso novo,
**Category**, com Get Many; uma lista suspensa no campo `Category ID` dos agendamentos; e
a explicação do erro que a API dá quando a categoria é do tipo errado.

**Por que agora, e não como enfeite:** a 0.6.0 entregou Create de agendamento pedindo
`Category ID`, um GUID — e **não deixou nenhum jeito de descobrir esse GUID dentro do
node**. Na prática obriga um HTTP Request só para listar categorias, que é exatamente o
que este pacote existe para eliminar. Levantado pelo Alvaro em 2026-07-26, olhando a
0.6.0 na tela, e é um buraco de recorte da 0.6.0, não um pedido novo.

**Decidido com o Alvaro em 2026-07-26:** os dois caminhos (lista no campo **e** recurso
Category), a lista já filtrada pelo tipo do agendamento, e o node explicando o erro
enganoso quando alguém não usa a lista.

**Fora de escopo:** criar categoria (`POST /categories` nunca foi validado), grupos de
categoria (`/categorygroups` é 404 — o `group` já vem embutido em cada item), centros de
custo, e qualquer mudança nos recursos já publicados além do campo `Category ID`.

---

## 1. Medições — o que a API respondeu

### 1.1 De hoje (2026-07-26), contra a cobaia

| Medição | Resposta |
|---|---|
| Envelope de `/categories` | ✅ `{items, count}` — `count = 22` na cobaia |
| `$top` · `$orderby=id` · `$orderby=name` · `$skip` | ✅ 200 nas quatro |
| **`GET /categories/{id}`** | ❌ **404** `Resource not found` — não existe leitura por ID |
| `contains(name,…)` · `contains(tolower(name),…)` · `name eq …` | ✅ 200 |
| `startswith(referenceCode,…)` · `contains(referenceCode,…)` · `referenceCode eq …` | ✅ 200 |
| **`type eq 'in'` · `type ne 'in'`** | ✅ 200 — **enum de texto que compara**, ao contrário do `document/type` |
| `contains(group/name,…)` | ✅ 200 |
| `isEditable eq true` | ✅ 200 |
| `groupType eq 6` | ✅ 200 |
| **`isDeleted eq false`** | ❌ 500 — `Could not find a property named 'isDeleted'` |

Forma de um item, medida:

```
{ id, name, referenceCode, type: "in" | "out",
  group: { id, name, referenceCode }, isEditable, groupType }
```

`type: "in"` é receita (serve num **Credit Schedule**), `type: "out"` é despesa (serve num
**Debit Schedule**).

### 1.2 O erro que este plano existe para explicar

Medido criando agendamentos de verdade na cobaia, todos apagados em seguida:

| O que foi enviado | Resposta |
|---|---|
| `POST /schedules/credit` + categoria `type: "in"` | ✅ 200 |
| **`POST /schedules/credit` + categoria `type: "out"`** | ❌ 500 `validation_error` — **"Valor do agendamento deve ser positivo"** |
| `POST /schedules/debit` + categoria `type: "out"` | ✅ 200 |
| **`POST /schedules/debit` + categoria `type: "in"`** | ❌ 500 `validation_error` — **"Valor do agendamento de pagamento deve ser negativo"** |

**A mensagem culpa o valor, e a culpa é da categoria.** Quem digitou `100` positivo, como o
campo manda, lê que o valor deveria ser positivo. É o tipo da categoria que decide o sinal
da linha: uma categoria de despesa dentro de um recebimento torna o total negativo, e a
validação reclama do total. É a mesma classe do `Tipo de Stakeholder inválido` que na
verdade era encoding — erro que aponta para o lugar errado.

### 1.3 Pendente — medir no editor **antes** de confiar na fatia 4

| ☐ | Dentro de um `loadOptionsMethod`, o `this.getNodeParameter('resource')` enxerga o recurso escolhido? É o que decide se a lista consegue se filtrar sozinha entre receita e despesa |
| ☐ | Um `loadOptionsMethod` num campo que mora **dentro de um `fixedCollection`** é chamado pelo editor? |

As duas são do n8n, não do Nibo, e se medem abrindo o node no n8n de dev — sem tocar na
API. Se a primeira falhar, o recorte muda: a lista passa a mostrar as duas metades com o
tipo escrito no rótulo, e a decisão 2 vira um aviso em vez de um filtro. **Nenhuma das duas
bloqueia as fatias 1, 2, 3 e 6.**

### 1.4 O que **não** precisa ser medido, e por quê

`/categories` não tem escrita neste escopo, então **nenhuma medição desta versão escreve na
API**. As da tabela 1.2 já foram feitas (2026-07-26) e a cobaia terminou com zero
agendamentos.

---

## 2. Decisões de recorte

1. **O `categoryId` continua guardando uma string.** O campo é publicado desde a 0.6.0;
   trocá-lo por um `resourceLocator` mudaria o valor guardado de `"guid"` para
   `{mode, value}` e quebraria todo node salvo. Ele vira `type: 'options'` com
   `loadOptionsMethod` — **a lista aparece, o valor guardado não muda**, e o botão de
   expressão do editor continua servindo para quem precisa calcular o ID.
   *(Nome de parâmetro é contrato — CLAUDE decisão 9; e o formato do valor também é.)*
2. **A lista vem filtrada pelo tipo do agendamento.** Credit Schedule carrega
   `type eq 'in'`, Debit Schedule `type eq 'out'`. Não é conveniência: é o que impede o
   erro da tabela 1.2 de acontecer.
3. **Ordenada por `referenceCode`, mostrando o código junto do nome.** Um plano de contas
   se lê pelo código (`1.1.001`, `1.1.002`, `2.1.001`), não em ordem alfabética. O linter
   do n8n exige ordem alfabética de listas **estáticas**; uma lista carregada da API não
   passa por ele.
4. **No modo API Token (Per Item) a lista não carrega, e o node diz por quê.** Duas razões,
   e a segunda é a que importa: quem carrega a lista é a credencial, e nesse modo não
   existe uma; e **o ID de categoria é de cada empresa**, então uma categoria escolhida na
   tela estaria certa para uma empresa e errada para todas as outras da carteira. A
   mensagem de erro do editor diz isso e manda usar o recurso Category.
5. **Category tem Get Many e nada mais.** `GET /categories/{id}` é 404 e `POST /categories`
   nunca foi validado — o node não inventa nenhuma das duas.
6. **O cardápio de filtro do Category é fechado e medido**, como nos outros recursos.
   `isDeleted` fica fora (500). `groupType` fica fora por ser um número sem significado
   para quem preenche.
7. **`type` ganha um tipo novo no construtor de filtro: `options`.** É um enum de texto
   fechado, com dois valores, e é *o* filtro que alguém vai querer aqui ("só as receitas").
   Oferecido como texto livre, viraria adivinhação entre `in` e `out`. O `IFilterField`
   ganha `choices`, o literal continua sendo o de texto — entre aspas, escapado — e nada
   dos outros tipos muda.
8. **A explicação do erro mora no handler dos agendamentos.** O `errors.ts` é puro e
   genérico desde a 0.2.0 e continua assim; quem sabe que "valor deve ser positivo" quer
   dizer "categoria do tipo errado" é o recurso, não o transporte.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.7.0 |
|---|---|
| `transport/odata.ts` | O tipo `options`: mesmo literal do texto, operadores `eq`/`ne` |
| `transport/paginate.ts` · `request.ts` · `save.ts` · `merge.ts` · `errors.ts` | **Nada** |
| `resources/shared/filter.ts` | `IFilterField.choices` e a caixa suspensa do tipo `options` |
| `resources/category/description.ts` **(novo)** | O recurso, Get Many e o cardápio medido |
| `resources/category/execute.ts` **(novo)** | Handler de uma operação só |
| `resources/category/load.ts` **(novo)** | O `loadOptions` da lista suspensa, usado pelos agendamentos |
| `resources/schedule/description.ts` | `categoryId` vira `options` com `loadOptionsMethod` |
| `resources/schedule/execute.ts` | A explicação do erro da tabela 1.2 |
| `NiboEmpresas.node.ts` | Roteia Category; declara `methods.loadOptions`; a credencial ganha o recurso novo |

---

## 4. Campos na UI

**Category — Get Many:** `returnAll` · `limit` · `filters` · `filterCombine` ·
`options.filter`, todos herdados do padrão 0.5.x/0.6.0.

**Cardápio do filtro** (alfabético, como o linter exige):

| Na UI | Caminho | Tipo |
|---|---|---|
| Group Name | `group/name` | texto |
| Is Editable | `isEditable` | sim-ou-não |
| Name | `name` | texto |
| Reference Code | `referenceCode` | texto |
| Type | `type` | **lista** (`in` = Revenue, `out` = Expense) |

**Agendamentos —** o `categoryId` de dentro de `categories` deixa de ser caixa de texto e
vira lista. Nome do parâmetro, lugar e valor guardado **não mudam**.

---

## 5. Fatias, com teste antes do código

1. **`transport/odata.ts` — o tipo `options`** *(commit próprio)*. Testes: escreve
   `type eq 'in'` entre aspas; `ne` também; apóstrofo escapado como no texto; vazio
   ignorado; operador fora do cardápio falha.
2. **`resources/shared/filter.ts` — a caixa suspensa** *(commit próprio)*. `IFilterField`
   ganha `choices`; o tipo `options` desenha um `options` com essas escolhas. Testes: os
   recursos existentes não mudam nada (os testes 0.5.x/0.6.0 são o critério); um cardápio
   com `choices` desenha a lista e não a caixa de texto.
3. **`resources/category/*` — o recurso** *(commit próprio)*. Testes: Category no menu e na
   lista da credencial; uma operação só; `$orderby=id`; cardápio medido, sem `isDeleted`;
   Type é lista com dois valores.
4. **`resources/category/load.ts` — a lista suspensa** *(commit próprio)*. Testes: pede
   `type eq 'in'` no recurso de crédito e `'out'` no de débito; ordena por
   `referenceCode`; o rótulo traz código e nome; no modo per-item falha com a mensagem da
   decisão 4; uma categoria sem `referenceCode` ainda entra na lista.
5. **`resources/schedule/description.ts` — o campo vira lista** *(commit próprio)*.
   Testes: `categoryId` continua se chamando assim, continua dentro de `categories`,
   continua `default: ''`, e agora tem `loadOptionsMethod`.
6. **A explicação do erro** *(commit próprio)*. Testes: um `validation_error` falando de
   valor positivo/negativo num Create de agendamento chega ao usuário com a frase sobre a
   categoria; um `validation_error` de outro assunto chega intacto; um erro de Get Many
   não ganha frase nenhuma.
7. **README + bump 0.7.0** *(commit próprio)*.

---

## 6. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.7.0 |
|---|---|
| 3 — escrita só na cobaia | **Esta versão não escreve nada**: `/categories` é leitura, e as medições de escrita da 1.2 já foram feitas e limpas |
| 4 — nenhum token em código ou commit | Nada novo toca token |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| Decisão 9 — inglês | Campos, operadores, descrições e README |
| 7 — instalação real | A 0.7.0 fecha com a tabela da seção 7 |
| 8 — repo público | Este plano não nomeia cliente, workflow nem credencial |

---

## 7. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` — todos verdes.

**Teste de instalação real (regra 7)**, com a 0.7.0 instalada pela tela Community Nodes:

| ☐ | Category · Get Many devolve as categorias; filtro por *Type é Revenue* devolve só receitas |
| ☐ | No Credit Schedule · Create, o campo Category abre a lista e mostra **só receitas**, com o código junto do nome |
| ☐ | No Debit Schedule · Create, a mesma lista mostra **só despesas** |
| ☐ | Escolher pela lista e criar funciona na cobaia; a categoria escolhida volta no registro |
| ☐ | Colar um ID de categoria do tipo errado falha com a frase sobre a categoria, não só com a da API |
| ☐ | No modo API Token (Per Item), a lista não carrega e a mensagem manda usar o recurso Category |
| ☐ | Um node salvo na 0.6.0, com o GUID digitado à mão, continua funcionando sem ser tocado |
| ☐ | Regressão: agendamentos e os quatro stakeholders como na 0.6.0 |
| ☐ | CI verde; **scanner oficial conferido pela linha de sucesso**, não pelo código de saída |
| ☐ | A cobaia termina com zero agendamentos |

---

## 8. Sequência

Fatias pequenas, teste antes do código, commit por fatia, push a cada fatia, tag e
publicação **só com o OK do Alvaro**:

1. Tipo `options` no construtor → 2. caixa suspensa no filtro compartilhado →
3. recurso Category → 4. a lista suspensa → 5. o campo dos agendamentos vira lista →
6. explicação do erro → 7. README + bump → 8. publicar → aceite real → fechar a seção 7.
