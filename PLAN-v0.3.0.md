# PLANO DE IMPLEMENTAÇÃO — v0.3.0

> **Não é spec.** A spec é o `DESIGN.md` (repo de planejamento) — aqui valem principalmente
> **§3.2, §3.3 e §8.1** — e este plano não a reconta. Convenção igual à do `PLAN-v0.2.0.md`.
>
> 🔒 Escrito para ser seguro em repositório público (CLAUDE §6, regra 8): nenhum nome de
> cliente, ID de workflow, ID de credencial ou contagem da operação interna.

**Escopo da v0.3.0** (roteiro do DESIGN §9): o **modo de autenticação por item**. Nenhum
recurso novo, nenhuma operação nova — continua `Customer: Get Many`, continua só leitura.
O que muda é de onde vem o token:

- o node ganha o campo **Authentication**, com **Credential** (como hoje) e
  **API Token (Per Item)**;
- no modo novo o token é lido **por item**, com `getNodeParameter('apiToken', i)`, o que
  permite um único node percorrer uma carteira inteira num laço, cada item lendo o livro
  contábil do seu próprio token;
- a credencial **some da UI** nesse modo e deixa de ser exigida (§3.2);
- entra o **intervalo entre chamadas** (decisão 3), que só faz sentido agora que um node
  pode disparar centenas de chamadas seguidas.

**Prova o quê** (DESIGN §9): o requisito arquitetural central. O campo `credentials` de um
node **não aceita expressão** — é resolvido uma vez por node, não por item. Sem este modo,
os workflows multi-empresa não têm como migrar para o node, e a arquitetura de "núcleo
compartilhado" perde a razão de existir.

**Fora de escopo:** Get/Create/Update-merge/Delete (v0.4.0), Supplier/Employee/Partner na
UI (pós-0.4.0), cofre de tokens (fase posterior, ver §3.3 do DESIGN e a ressalva na seção 5
deste plano), NFS-e/Schedules/etc.

---

## 1. Decisões de recorte — **travadas** (aprovadas pelo Alvaro em 2026-07-25)

1. **Rótulos.** Campo **`Authentication`** no topo do node, com as opções **`Credential`**
   (default) e **`API Token (Per Item)`**. Segue o padrão dos nodes oficiais, e "Per Item"
   diz o que de fato muda. Nome de parâmetro é contrato (CLAUDE decisão 9): fica assim
   desde a estreia.
2. **Endereço da API no modo por item: a constante padrão**
   (`https://api.nibo.com.br/empresas/v1`), sem campo na tela. Nesse modo não existe
   credencial para guardar o endereço, e a API nunca teve outro. Quem precisar de outro
   endereço usa o modo credencial, onde o campo `baseUrl` continua existindo.
3. **O intervalo entre chamadas entra nesta versão.** Campo **`Interval Between Requests`**,
   em milissegundos, **default 1000**, aplicado **entre** chamadas — nunca antes da
   primeira. `0` desliga. Motivo do default conservador: um laço de carteira inteira dispara
   centenas de chamadas seguidas, e a defesa tem que ser o comportamento padrão, não uma
   lembrança de quem monta o workflow.

**Decorrentes do desenho** (não precisaram de aprovação, ficam registradas):

4. **O índice do item atravessa o transporte.** `niboApiRequest` e `niboListRequest` passam
   a receber `itemIndex`. É o ponto inteiro da versão: `getNodeParameter(nome, i)` resolve a
   expressão **para o item `i`** — sem o índice viajando até a saída HTTP, o modo novo seria
   idêntico ao antigo.
5. **Token vazio no modo por item é erro do item**, com `itemIndex`, não do node inteiro —
   assim `continueOnFail` e a saída de erro continuam funcionando item a item (100% dos
   workflows críticos usam `onError: continueErrorOutput`).

---

## 2. Arquitetura — onde cada comportamento mora

Mantém a regra do DESIGN §2.2: **toda armadilha vive no transporte ou no handler, nunca
duplicada.** Autenticação é transversal, logo o peso é de novo no `transport/`.

| Camada | O que ganha na 0.3.0 |
|---|---|
| `transport/request.ts` | Escolhe o modo e autentica: credencial (`httpRequestWithAuthentication`) ou header `ApiToken` montado com o token do item (`httpRequest`). O `try/catch` e a normalização de erro continuam num lugar só |
| `transport/paginate.ts` | Repassa o `itemIndex`; espera o intervalo **entre páginas** |
| `resources/stakeholder/execute.ts` | Passa o `i` do laço ao transporte; espera o intervalo **entre itens** |
| `NiboEmpresas.node.ts` | Campos `Authentication`, `API Token` e `Interval Between Requests`; credencial declarada com `displayOptions` para sumir no modo por item |
| `credentials/NiboEmpresasApi.credentials.ts` | **Nada.** A credencial não muda |

### 2.1 Duas armadilhas conhecidas antes de começar

**A regra `no-http-request-with-manual-auth` do scanner oficial.** Ela reprova
`this.helpers.httpRequest()` **dentro de uma função que também chame
`this.getCredentials()`** — e é exatamente o que uma implementação ingênua faria, já que a
função de hoje lê a credencial para montar a URL. A saída não é `eslint-disable`: é separar
em duas funções privadas, uma por modo, com o despachante não chamando nenhuma das duas
coisas diretamente. Sai mais limpo *e* passa no gate.

**`password: true` não protege o token nos dados de execução** (DESIGN §3.3). O n8n redige
credenciais, **não parâmetros**: o token resolvido continua visível no histórico da execução
— exatamente como já acontece hoje com o HTTP Request. O modo **não piora nada e também não
resolve exposição**; tem que estar escrito no README, em inglês, para quem chegar depois.

---

## 3. Arquivos, na ordem

| # | Arquivo | Ação | O que faz |
|--:|---|---|---|
| 1 | `transport/request.ts` | modificar | `itemIndex` na assinatura; despachante lê `authentication` e chama uma de duas funções privadas — `requestWithCredential` (credencial + `httpRequestWithAuthentication`) ou `requestWithItemToken` (`getNodeParameter('apiToken', itemIndex)` + header `ApiToken` via `httpRequest`, URL padrão da decisão 2). Token vazio → `NodeOperationError` com `itemIndex` (decisão 5). O `try/catch` com `classifyNiboError` fica **no despachante**, valendo para os dois modos |
| 2 | `transport/paginate.ts` | modificar | Recebe e repassa `itemIndex`; `interval` entra em `INiboListOptions` e é esperado entre páginas com o `sleep` do `n8n-workflow` (peer dependency — **não** cria dependência de runtime) |
| 3 | `resources/stakeholder/execute.ts` | modificar | Passa o `i` do laço; lê `requestInterval` por item e espera entre itens (nunca antes do primeiro) |
| 4 | `NiboEmpresas.node.ts` | modificar | `Authentication` (`name: 'authentication'`, options, `noDataExpression: true`, valores **`credential`** — default — e **`field`**, conforme DESIGN §3.2) como **primeiro** campo; `API Token` (`name: 'apiToken'`, string, `typeOptions: { password: true }`, obrigatório, só no modo `field`); `Interval Between Requests` (`name: 'requestInterval'`, number, `minValue: 0`, default `1000`, unidade na descrição — `(ms)` no rótulo vira `(Ms)` no linter); credencial com `displayOptions` mostrando só no modo `credential` |
| 5 | `nodes/**/__tests__/*.test.ts` | modificar/criar | Casos da seção 4 |
| 6 | `README.md` | modificar | O modo novo, com exemplo de expressão; a ressalva de exposição do token (§2.1); o intervalo; histórico de versões |
| 7 | `package.json` | modificar | Versão → `0.3.0` |

> `.github/workflows/publish.yml` **não muda**: o gate (lint, lint:community, test, build)
> já cobre o que esta versão acrescenta.

---

## 4. Testes unitários (DESIGN §8, camada 1) — sem rede

| Alvo | Casos |
|---|---|
| **Despacho** (`request`) | modo `credential` → chama `httpRequestWithAuthentication` com `niboEmpresasApi`; modo `field` → chama `httpRequest`, com header `ApiToken` e a URL padrão |
| **Token por item** (`request`) | numa mesma execução, item 0 e item 2 mandam **tokens diferentes** — é o teste que prova a resolução por item; token vazio → `NodeOperationError` citando o item |
| **Erro** (`request`) | 401 no modo por item também vira mensagem legível: a classificação não depende do modo |
| **Intervalo** (`paginate`) | espera o valor configurado entre páginas; **não** espera antes da primeira chamada; `0` não espera nunca |
| **Índice** (`execute`) | o `i` do laço chega ao transporte (item 3 → transporte recebe 3) |

**Regra 4 do CLAUDE vale nos testes:** nenhum ApiToken real em fixture. Os tokens dos testes
são literais óbvios de mentira (`'token-of-item-0'`), e o teste que importa é o de índice,
que nem precisaria de token de verdade para provar o que prova.

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.3.0 |
|---|---|
| 3 — só leitura | Ainda só `GET /customers`. Nenhum POST/PUT/DELETE entra no código |
| 4 — nenhum token em código ou commit | Tokens só em credencial ou em expressão do workflow; nos testes, literais falsos. **O modo novo não muda isso**, mas ver a ressalva de exposição em §2.1 |
| 5 — zero dep de runtime | `sleep` vem do `n8n-workflow`, que já é peer dependency. `dependencies` segue `{}` |
| Decisão 9 — inglês | `Authentication`, `Credential`, `API Token (Per Item)`, `API Token`, `Interval Between Requests`, descrições, erros e README |
| 7 — instalação real | A 0.3.0 fecha com a tabela da seção 6, incluindo o teste negativo de 3 itens |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` — todos verdes.

**Teste de instalação real (regra 7)**, contra a instância limpa, com a 0.3.0 instalada pela
tela Community Nodes:

| ☐ | **O teste negativo de 3 itens** (DESIGN §8.1): um node, uma execução, item 1 com token válido, item 2 com token **inválido de propósito**, item 3 com token válido. Esperado: **só o item 2 falha**, com 401 legível, pela saída de erro |
| ☐ | Modo `Credential` continua funcionando igual (regressão da 0.2.x) |
| ☐ | `Return All` funciona também no modo por item |
| ☐ | Intervalo observável: a mesma varredura de várias páginas demora visivelmente mais com 2000 ms do que com 0 |
| ☐ | `npm test` verde no CI; scanner oficial sem achados |

> **Por que o item 2 falhar sozinho prova tudo:** se o node resolvesse a autenticação uma
> vez por node, os três itens se comportariam igual — ou todos passam, ou todos falham.
> Falhar **um**, entre dois que passam, só é possível se cada item estiver usando o seu
> próprio token. É conclusivo, binário, e não toca em dado real de cliente nenhum.

**Complemento read-only opcional** (DESIGN §8.1): um quarto item com token de outra empresa
real, em `Get Many`. Dois tokens válidos distintos devolvendo `count` diferente mostram que
cada item leu o livro contábil do seu próprio token. Leitura não fere a regra 3.

---

## 7. Sequência sugerida

Fatias pequenas, teste antes do código, commit por fatia, push e tag **só com o OK do
Alvaro**:

1. `request.ts`: `itemIndex` + os dois modos + testes (o `itemIndex` atravessa
   `paginate.ts` e `execute.ts` na mesma fatia, senão não compila)
2. UI: `Authentication`, `API Token`, credencial condicional — conferir carregando o node
   compilado, como foi feito na 0.2.0
3. Intervalo: campo + espera entre páginas e entre itens + testes
4. README (inclusive a ressalva de exposição do token); bump 0.3.0
5. Publicar → teste de instalação real → fechar a tabela da seção 6
