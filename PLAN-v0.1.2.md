# PLANO DE IMPLEMENTAÇÃO — v0.1.2

> **Não é spec.** Segue a convenção deste projeto (igual ao `PLAN-v0.1.0.md`): aponta para
> o `DESIGN.md`/`CLAUDE.md` do repo de planejamento e para o `STATUS-v0.1.0.md`, não os
> reconta. Escrito para ser seguro em repositório público (sem dado interno).

**Escopo da v0.1.2** (pendência 2/3 do `STATUS-v0.1.0.md`): deixar o **scanner oficial do
n8n limpo** — os 6 erros + 1 aviso do plugin `@n8n/eslint-plugin-community-nodes` — e
**criar um portão de verdade antes de publicar**, já que o scanner pós-publicação **sai com
código 0** mesmo reprovando (foi por isso que o CI da 0.1.1 ficou verde com 7 achados).

**O que a v0.1.2 NÃO faz:** nada de comportamento novo. Zero mudança na API, na UI de
operação, no que o node retorna. É polimento de metadados + higiene de CI. As entregas
funcionais são a v0.2.0 em diante.

---

## 1. Os 7 achados do scanner (fonte: `npx @n8n/scan-community-package`, contra a 0.1.1)

| # | Arquivo:linha | Regra | O que fazer |
|--:|---|---|---|
| 1 | `credentials/NiboEmpresasApi.credentials.ts:8` | `cred-class-field-icon-missing` + `icon-validation` | Adicionar `icon` à classe da credencial |
| 2 | `nodes/NiboEmpresas/NiboEmpresas.node.ts:14` | `node-usable-as-tool` | Definir `usableAsTool: true` — **aprovado pelo Alvaro em 2026-07-24** (expõe o node como ferramenta de agente de IA; inofensivo para um "listar clientes" só-leitura) |
| 3 | `nodes/NiboEmpresas/NiboEmpresas.node.ts:18` | `icon-prefer-themed-variants` *(aviso)* | Ícone em variante `{ light, dark }` |
| 4 | `nodes/NiboEmpresas/NiboEmpresas.node.ts:26` | `node-connection-type-literal` (inputs) | Usar `NodeConnectionTypes.Main` |
| 5 | `nodes/NiboEmpresas/NiboEmpresas.node.ts:27` | `node-connection-type-literal` (outputs) | Usar `NodeConnectionTypes.Main` |
| 6 | `nodes/NiboEmpresas/resources/stakeholder/execute.ts:55` | `require-node-api-error` | Não relançar `error` cru dentro do `catch` |

Nenhum afeta o funcionamento — são metadados e estilo. Todos verificados lendo o
código-fonte das regras em `@n8n/eslint-plugin-community-nodes@0.26.0`.

---

## 2. O conflito real que a v0.1.2 resolve (achados 4/5)

O linter **antigo** (`eslint-plugin-n8n-nodes-base`, que roda no `npm run lint`) **exige o
literal `'main'`** — foi ele que, na v0.1.0, obrigou a trocar `NodeConnectionTypes.Main` por
`['main']`. O scanner **novo** exige o **oposto**: `NodeConnectionTypes.Main`.

Os dois não podem estar certos ao mesmo tempo. Resolução: **usar o enum** (`NodeConnectionTypes.Main`)
e **desligar** as duas regras do linter antigo que exigiam o literal, com comentário
apontando o motivo. Sem isso, corrigir um quebra o outro em loop.

- Regras a desligar em `.eslintrc.js`: `node-class-description-inputs-wrong-regular-node`
  e `node-class-description-outputs-wrong`.
- Verificação: `npm run lint` (antigo) **e** o gate novo (seção 4) passam juntos.

---

## 3. Arquivos a mudar, na ordem

| # | Arquivo | Ação | Detalhe |
|--:|---|---|---|
| 1 | `nodes/NiboEmpresas/nibo.dark.svg` | **criar** | Cópia do `nibo.svg` com `fill` trocado de `#002d72` para `#ffffff` — variante para tema escuro (o próprio site do Nibo usa o logo branco em fundo escuro). Derivado do SVG que já temos; **sem download externo** |
| 2 | `credentials/nibo.svg` · `credentials/nibo.dark.svg` | **criar** | Cópias dos dois SVGs — o ícone de credencial é resolvido na pasta da credencial; o `gulpfile.js` já copia `credentials/**/*.svg` para `dist/` |
| 3 | `credentials/NiboEmpresasApi.credentials.ts` | modificar | `icon = { light: 'file:nibo.svg', dark: 'file:nibo.dark.svg' }` (achado 1) |
| 4 | `nodes/NiboEmpresas/NiboEmpresas.node.ts` | modificar | (a) importar `NodeConnectionTypes`; (b) `inputs`/`outputs` = `[NodeConnectionTypes.Main]` (achados 4/5); (c) `icon` → forma `{ light, dark }` (achado 3); (d) `usableAsTool: true` (achado 2) |
| 5 | `nodes/NiboEmpresas/resources/stakeholder/execute.ts` | modificar | Trocar `throw error` (linha 55) por relance seguro — ver 3.1 (achado 6) |
| 6 | `.eslintrc.js` | modificar | Desligar as 2 regras do conflito da seção 2, com comentário |
| 7 | `eslint.config.mjs` | **criar** | Config *flat* mínima que roda **só** o `@n8n/eslint-plugin-community-nodes` sobre `nodes/` e `credentials/` — é o gate da seção 4 |
| 8 | `package.json` | modificar | Versão → `0.1.2`; devDep `@n8n/eslint-plugin-community-nodes`; script `"lint:community"` |
| 9 | `.github/workflows/publish.yml` | modificar | Rodar `npm run lint:community` **antes** do `npm publish` (o gate real) |
| 10 | `README.md` | modificar | Linha da 0.1.2 no histórico de versões |

### 3.1 A correção do achado 6 (linha 55)

A regra `require-node-api-error` reprova **apenas** `throw <parâmetro-do-catch>` cru e
`throw new <classe-não-permitida>()`. Ela **aceita** `NodeApiError`/`NodeOperationError`.

Quando o `error` chega ao `catch`, ele **já é** um `NodeApiError` (vindo do
`transport/request.ts`) ou um `NodeOperationError` (dos dois `throw` de "not supported").
Relançá-lo é semanticamente correto — o que a regra quer evitar (perder o contexto HTTP)
**não acontece aqui**. A forma que satisfaz a regra e mantém o comportamento:

```ts
throw error instanceof NodeApiError
    ? error
    : new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
```

(É um `ConditionalExpression`, que a regra não sinaliza; e preserva o `NodeApiError`
original com todo o contexto HTTP em vez de re-embrulhar.) Requer importar `NodeApiError`
junto de `NodeOperationError`. **Verificação = re-rodar o scanner e o achado 6 sumir.**

---

## 4. O gate — resposta à pendência 3

**Problema medido:** `npx @n8n/scan-community-package` imprime "failed security checks" para
violações de ESLint mas **sai com código 0** (só sai ≠ 0 em falha de *provenance*/segurança
real). Logo, o passo de scan no CI **nunca reprova** por esses achados. Provar isso foi o
que a 0.1.1 fez sem querer.

**Solução:** trazer as regras para **antes** da publicação. As regras vêm de um plugin
ESLint instalável (`@n8n/eslint-plugin-community-nodes`). O `npm run lint` já falha o job
do CI quando há erro — basta uma segunda passada de lint com o plugin novo.

- Config *flat* **separada** (`eslint.config.mjs`), não misturada ao `.eslintrc.js` legado
  (o antigo é config legada; o plugin novo é *flat*). São duas invocações independentes,
  sem conflito de formato.
- `npm run lint:community` roda essa config. No CI, entra **antes** do `npm publish`.
- **Risco a verificar na execução:** o plugin (v0.26, ESM/flat) tem que carregar sob o
  ESLint 8.57 do projeto (`ESLINT_USE_FLAT_CONFIG=true`). Se não carregar, o plano B é
  fixar o ESLint 9 só para essa passada. Decisão de execução, verificável na hora.

O scanner pós-publicação **continua** no CI, como segunda malha (checa *provenance*, que o
lint não vê). Ele deixa de ser o gate; passa a ser a confirmação.

---

## 5. Onde cada regra inviolável continua atendida (CLAUDE §6)

| Regra | Na v0.1.2 |
|---|---|
| 3 — só leitura | Nenhuma chamada nova; superfície idêntica à 0.1.1 (`GET /customers` + teste `GET /categories`) |
| 5 — zero dep de runtime | `@n8n/eslint-plugin-community-nodes` entra em **devDependencies**; `dependencies` segue `{}` |
| Decisão 9 — inglês na UI | `usableAsTool` e ícones não têm texto; nada muda de idioma |
| 7 — instalação real | A 0.1.2 **também** passa pelo teste de instalação real antes de "pronta" (ver seção 6) |

## 6. Teste e aceite

**Gate local antes da tag:** `npm run lint` (antigo, verde) **e** `npm run lint:community`
(novo, verde) **e** `npm run build` **e** `npm pack` conferido.

**Publicação:** tag `v0.1.2` → CI (lint + lint:community + build + publish + scan).
**Critério novo desta versão:** o passo `npm run lint:community` **falha o job** se houver
achado (provar rodando uma vez com um erro proposital, depois corrigir — ou confiar no
verde após as correções).

**Teste de instalação real (regra 7), reduzido:** subir a instância limpa, instalar
`n8n-nodes-nibo-empresas@0.1.2`, confirmar que o node **carrega, aparece com ícone claro/escuro
e o `Get Many` ainda devolve os itens**. Não repete a bateria inteira da 0.1.1 — só garante
que o polimento não quebrou o que já passou.

| ☐ | `npx @n8n/scan-community-package n8n-nodes-nibo-empresas` → **0 achados** |
| ☐ | `npm run lint` e `npm run lint:community` verdes |
| ☐ | Node instala e carrega na instância limpa; ícone aparece |
| ☐ | `Get Many` devolve itens como na 0.1.1 (sem regressão) |

## 7. Pendências que a v0.1.2 encosta (não bloqueiam)

- **Trusted Publishing + revogar token** (pendência 1 do STATUS): melhor fazer **antes** da
  tag `v0.1.2`, para essa publicação já validar o caminho sem segredo. Ação do Alvaro.
- **Apagar o pacote morto** `@alvarocastro.tech/...` (janela de 72 h). Ação do Alvaro.
