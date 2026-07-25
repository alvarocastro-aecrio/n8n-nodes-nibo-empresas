# PLANO DE IMPLEMENTAÇÃO — v0.2.0

> **Não é spec.** A spec é o `DESIGN.md` (repo de planejamento). Este plano aponta para
> ele — principalmente **§5, §5.1, §5.2 e §8** — e não o reconta. Convenção de plano igual
> ao `PLAN-v0.1.0.md`. Seguro para repositório público.

**Escopo da v0.2.0** (roteiro do DESIGN §9): os **comportamentos transversais** da API, sem
recurso novo. Continua só o `Customer: Get Many`, mas agora ele:

- pagina **de verdade** com `Return All` (§5, §1.3 do contrato: `$top` satura em 500 mudo);
- expõe o `count` do servidor e **avisa quando há *drift*** de paginação (§5.2);
- **normaliza os erros** — 401 legível, e distingue `validation_error` de
  `internal_server_error` (§5.1);
- trata **`/employees` como array puro** dentro da paginação (§1.2) — já preparado no
  transporte, falta cobrir no laço;
- ganha a primeira camada de **testes unitários** (§8, camada 1).

**Prova o quê** (DESIGN §9): que o núcleo resolve o que um HTTP Request cru não resolve. É
a versão que dá sentido à arquitetura "núcleo compartilhado".

**Fora de escopo:** modo token-do-item (v0.3.0), Get/Create/Update-merge/Delete (v0.4.0),
Supplier/Employee/Partner na UI (pós-0.4.0), NFS-e/Schedules/etc.

---

## 1. Decisões de recorte — **travadas** (aprovadas pelo Alvaro em 2026-07-24)

O DESIGN deixava estas cinco em aberto. Ficam assim:

1. **Framework de teste: `jest`.** Padrão do ecossistema n8n, familiar a quem contribuir.
   Só devDependency — não fura a regra de zero dep de runtime.
2. **Aviso de *drift* (§5.2): avisar, não falhar.** Quando `count` inicial ≠ final:
   `this.logger.warn(...)` + campo `_niboPaginationWarning` no último item. O dado coletado
   é válido, só possivelmente incompleto — não justifica erro. **Toggle opcional**
   *"Fail on count drift"*, **desligado por padrão**, para quem quer rigor.
3. **`$filter` (OData) entra já na 0.2.0.** Campo **"Filter (OData)"** de texto livre
   (ex.: `contains(name,'LTDA')`), simples, sem construtor visual — filtrar é o valor
   inteiro de um "List".
4. **Sem retry próprio.** Classificar e propagar `NodeApiError` legível, e **documentar**
   que `internal_server_error` é seguro para o *Retry On Fail* nativo do n8n, enquanto
   `validation_error` não é. Menos código, mesmo resultado (YAGNI).
5. **`count` é sinal interno, não saída por item.** Usado para o *drift* e para detectar
   truncamento; não vira campo novo em cada item.

---

## 2. Arquitetura — onde cada comportamento mora

Mantém a regra do DESIGN §2.2: **toda armadilha vive no transporte ou no handler, nunca
duplicada.** A v0.2.0 quase não toca o node nem a credencial — o peso é no `transport/`.

| Camada | O que ganha na 0.2.0 |
|---|---|
| `transport/paginate.ts` | Laço real de `$skip` até esgotar; detecção de página curta (< 500 = fim); array-puro no laço; `count` inicial × final para *drift* |
| `transport/request.ts` | Normalização de erro: 401 legível; ler `body.error` e distinguir `validation_error` × `internal_server_error`; propagar `error_description` |
| `resources/stakeholder/description.ts` | `Return All` (boolean) + `Limit` (só quando `Return All` = falso) + `Filter (OData)` (decisão 3) |
| `resources/stakeholder/execute.ts` | Ler os novos parâmetros e chamar o paginador; sem lógica de API própria |
| `NiboEmpresas.node.ts` | Nada além de já herdar a descrição — roteador segue fino |

---

## 3. Arquivos, na ordem

| # | Arquivo | Ação | O que faz |
|--:|---|---|---|
| 1 | `transport/errors.ts` | **criar** | Função pura de classificação: recebe o corpo do erro, devolve `{ kind: 'auth'\|'validation'\|'server'\|'unknown', message }`. Sem `this`, sem rede — testável isolada |
| 2 | `transport/request.ts` | modificar | Usar `errors.ts` no `catch`: montar a mensagem legível e o `NodeApiError` com o corpo original preservado (§5.1) |
| 3 | `transport/paginate.ts` | modificar | `Return All`: laço `$skip += pageSize` até página < 500 ou atingir `limit`; comparar `count` início/fim → sinal de *drift* (decisão 2); array-puro dentro do laço (§1.2). Assinatura evolui para receber `returnAll`, `limit`, `filter` |
| 4 | `resources/stakeholder/description.ts` | modificar | Campos novos da UI (§4), **em inglês**: `Return All`, `Limit` (condicional), `Filter (OData)` |
| 5 | `resources/stakeholder/execute.ts` | modificar | Ler `returnAll`/`limit`/`filter` por item e repassar ao paginador |
| 6 | `nodes/**/__tests__/*.test.ts` | **criar** | Testes unitários (seção 4) |
| 7 | `package.json` | modificar | Versão → `0.2.0`; devDeps de teste (decisão 1); script `"test"`; jest/tsconfig de teste |
| 8 | `.github/workflows/publish.yml` | modificar | Rodar `npm test` no CI antes do publish |
| 9 | `README.md` | modificar | Operação atualizada (Return All, Filter); histórico de versões |

> **Observação:** o `transport/paginate.ts` **já** detecta array puro (`Array.isArray`) e
> **já** injeta `$orderby` — a 0.1.x deixou o alicerce pronto. A 0.2.0 constrói o laço em
> cima, não reescreve.

---

## 4. Testes unitários (DESIGN §8, camada 1) — sem rede

Ferramentas em `devDependencies` (não ferem a regra 5). Cobrem a lógica pura, com o cliente
HTTP **mockado** — nenhuma chamada real ao Nibo (respeita a regra 3 por construção):

| Alvo | Casos |
|---|---|
| **Envelope** (`paginate`) | `{items,count}` → array; array puro (`/employees`) → array; `items` ausente → `[]` |
| **Paginação** (`paginate`) | 3 páginas cheias + 1 curta → para no fim; respeita `limit` < 500; `$orderby=id` sempre presente; `$skip` cresce certo |
| **Drift** (`paginate`) | `count` 100→100 sem aviso; 100→90 emite o aviso da decisão 2 |
| **Classificação de erro** (`errors`) | 401 → `auth`; body `validation_error` → `validation`; `internal_server_error` → `server`; corpo estranho → `unknown` |
| **Query OData** | `Filter` informado entra no `qs`; vazio não injeta `$filter` |

Meta honesta: cobrir **o núcleo transversal**, que é onde mora o risco. Não perseguir 100%
de cobertura da UI.

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.2.0 |
|---|---|
| 3 — só leitura | Ainda só `GET /customers`. Nenhum POST/PUT/DELETE entra no código |
| 5 — zero dep de runtime | jest e afins só em `devDependencies`; `dependencies` segue `{}` |
| Decisão 9 — inglês | Todos os campos novos (`Return All`, `Limit`, `Filter`), *hints* e mensagens de erro em inglês |
| UTF-8 (CLAUDE §4) | Inalterado — o transporte segue passando objeto JS ao helper |
| 7 — instalação real | A 0.2.0 fecha com o teste de instalação real completo (seção 6) |

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community` (herdado da 0.1.2), `npm test`,
`npm run build`, `npm pack` — todos verdes.

**Teste de instalação real (regra 7), completo,** contra a instância limpa:

| ☐ | `Return All` ligado traz **mais de 500** clientes numa empresa de grande volume (prova a paginação; §5.2 mediu 14.194) |
| ☐ | `Return All` desligado com `Limit 5` traz exatamente 5 |
| ☐ | `Filter` `contains(name,'…')` restringe o resultado (acento incluso) |
| ☐ | Token inválido → erro **401 legível** (não 500 genérico) |
| ☐ | Consulta malformada (ex.: filtro inválido) → mensagem de **validação legível**, sem retry |
| ☐ | `npm test` verde no CI; scanner oficial sem achados |

**Complemento read-only opcional** (DESIGN §8.1): comparar o `count` de duas empresas reais
diferentes — leitura, não fere a regra 3. Só se você quiser.

## 7. Sequência sugerida

Fatias pequenas, commit por fatia, push e tag **só com seu OK**:

1. `errors.ts` + testes → `request.ts` usa
2. `paginate.ts` (Return All + drift) + testes
3. UI (`description.ts`) + `execute.ts`
4. CI roda `npm test`; README; bump 0.2.0
5. Publicar → teste de instalação real → marcar pronta

---

## 8. Execução (2026-07-25)

Fatias 1 a 4 construídas e commitadas na `main`, uma por commit, com teste antes do
código. **Gate local verde:** `npm run lint`, `npm run lint:community`, `npm test`
(29 testes, 4 suítes), `npm run build`, `npm pack` — o tarball tem só `dist/`,
sem teste nenhum.

### Duas coisas saíram diferentes do plano

**1. O toggle da decisão 2 chama-se "Fail on Incomplete Results", não "Fail on count
drift".** O comportamento é o da decisão 2, mas cobre **dois** sinais de resultado
incompleto, não um: o `count` mudar do início para o fim da varredura **e** chegarem
menos registros do que o servidor anunciou (a defesa do §1.3 do contrato contra o teto
mudo de 500). Como nome de parâmetro é contrato — renomear depois quebra workflow, é a
mesma razão da decisão 9 —, o nome foi escolhido para descrever os dois casos já na
estreia. Segue **desligado por padrão**, e o aviso continua sendo aviso: `logger.warn`
mais `_niboPaginationWarning` no último item.

**2. O erro chega ao node já embrulhado, e o embrulho não pode ser refeito.** Lendo o
`n8n-core` publicado: `httpRequestWithAuthentication` lança `new NodeApiError(node,
error)` antes de o pacote ver qualquer coisa, e a mensagem vira a da tabela de status
HTTP — *"The service was not able to process your request"* para **todo** 500, que é
justamente onde esta API esconde erro de validação. Pior: o construtor do `NodeApiError`
**devolve a mesma instância** quando recebe uma, então re-embrulhar com a mensagem boa
seria silenciosamente ignorado. O transporte remonta o erro a partir do corpo — que o
embrulho preserva em `context.data` — em vez de re-embrulhar. Sem isso a §5.1 não sairia
do papel.

### Falta para fechar a versão

O **teste de instalação real (regra 7)** e a tabela de aceite da seção 6, que só rodam
depois de publicar. Publicação e tag seguem esperando o OK do Alvaro.
