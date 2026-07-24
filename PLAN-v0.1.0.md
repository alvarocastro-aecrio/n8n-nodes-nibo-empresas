# PLANO DE IMPLEMENTAÇÃO — v0.1.0

> ⚠️ **Adendo (2026-07-24, após o 1º teste da regra 7):** a "4ª porta" do nome com ponto
> no escopo **falhou no teste real** — o carregador de tipos do n8n faz
> `fullNodeType.split('.')` e quebra o nome no primeiro ponto (`load-nodes-and-credentials`,
> confirmado também no master). O pacote foi **renomeado para `n8n-nodes-nibo-empresas`**
> (sem escopo, decisão do Alvaro) e republicado como **v0.1.1**, conforme a regra deste
> próprio plano ("falhou → corrige → v0.1.1"). Onde este documento citar o nome com
> escopo, vale o nome novo. Detalhes no `STATUS-v0.1.0.md` do repo de planejamento.

> **Este plano não é spec.** A spec é o `DESIGN.md` do repositório de planejamento
> (pasta irmã `../claude-n8n/community_node_nibo/`); as regras são o `CLAUDE.md` de lá.
> Referências abaixo no formato *DESIGN §n* / *CLAUDE §n* apontam para eles, não os recontam.
>
> 🔒 Este arquivo foi escrito para ser seguro em repositório público (CLAUDE §6, regra 8):
> não contém nome de cliente, ID de workflow, ID de credencial nem dado da operação.

**Escopo da v0.1.0** (DESIGN §9): esqueleto do pacote + credencial `niboEmpresasApi` +
operação **Customer: List** com `$orderby=id`. O que ela prova: a cadeia
**build → npm → instalação real** — inclusive a 4ª porta do nome com ponto no escopo
(`@alvarocastro.tech/…`, CLAUDE §3). Nada além disso; o anti-escopo está na seção 5.

**Estado do ambiente** (verificado 2026-07-24): Node v22.23.1 e npm 10.9.8 já instalados
na VPS de dev; remote `origin` → `alvarocastro-aecrio/n8n-nodes-nibo-empresas`; Docker 29.5.1.
A pendência "instalar Node 22" (CLAUDE §7) já está resolvida.

---

## 1. Arquivos a criar, na ordem

### 1.1 Suporte (antes de qualquer `.ts`)

| # | Arquivo | O que faz |
|--:|---|---|
| 1 | `.gitignore` | `node_modules/`, `dist/`, `*.tgz` — nenhum artefato local vai ao histórico |
| 2 | `package.json` | Nome `@alvarocastro.tech/n8n-nodes-nibo-empresas` v0.1.0 · keyword `n8n-community-node-package` · atributo `n8n` (credencial + node em `dist/`) · `files: ["dist"]` · **`dependencies: {}`** · `n8n-workflow` em peerDependencies · ferramentas só em devDependencies |
| 3 | `tsconfig.json` | TypeScript strict, CommonJS, saída em `dist/` |
| 4 | `.eslintrc.js` | `eslint-plugin-n8n-nodes-base` — o mesmo linter da verificação oficial (DESIGN §8) |
| 5 | `gulpfile.js` | Copia os `.svg` para `dist/` no build (layout do starter oficial, DESIGN §2.1) |
| 6 | `LICENSE` | MIT (DESIGN §6) |

### 1.2 Os `.ts`, na ordem de criação

| # | Arquivo | O que faz (uma linha) | Spec |
|--:|---|---|---|
| 1 | `credentials/NiboEmpresasApi.credentials.ts` | Credencial `niboEmpresasApi`: `apiToken` mascarado + `baseUrl` com default; autentica por header **`ApiToken`** (nunca `Authorization`); teste = `GET /categories?$top=1` | DESIGN §3.1 |
| 2 | `nodes/NiboEmpresas/transport/request.ts` | **Única saída HTTP do node**: `httpRequestWithAuthentication`, body/qs sempre **objeto JS** (UTF-8, `charset=utf-8` explícito), erro propagado com o corpo original preservado | DESIGN §2.2, §5 |
| 3 | `nodes/NiboEmpresas/transport/paginate.ts` | Camada de listagem do núcleo: injeta **`$orderby=id`** sempre, aplica `$top` (Limit), desempacota o envelope `{items, count}` → um elemento por item | DESIGN §5, §5.2 |
| 4 | `nodes/NiboEmpresas/resources/stakeholder/description.ts` | Campos de UI **em inglês** do recurso Customer: operação `List` + `Limit` (1–500, default 50) — só isso na v0.1.0 | DESIGN §2.3, §4 |
| 5 | `nodes/NiboEmpresas/resources/stakeholder/execute.ts` | Handler **parametrizado pelo tipo** (só `customers` exposto): resolve parâmetros por item, chama o transporte, emite itens com `pairedItem` e try/catch por item (`continueOnFail`) | DESIGN §2.2–2.3 |
| 6 | `nodes/NiboEmpresas/NiboEmpresas.node.ts` | Descrição do node (resource/operation) + roteador fino — nenhuma chamada HTTP, nenhuma regra da API fora do transporte | DESIGN §2.2 |

### 1.3 Suporte (depois dos `.ts`)

| # | Arquivo | O que faz |
|--:|---|---|
| 7 | `nodes/NiboEmpresas/nibo.svg` | Ícone **placeholder genérico** (sem a marca Nibo) — ver gate G1 na seção 4 |
| 8 | `README.md` | **Em inglês** (decisão 9): o que é, instalação via Community Nodes, credencial, operação disponível |
| 9 | `.github/workflows/publish.yml` | Tag `v*` → `npm ci` → lint → build → `npm publish --provenance --access public` → `npx @n8n/scan-community-package` (DESIGN §6, §8) |
| 10 | `docker-compose.dev.yml` | n8n **2.18.5** (mesma versão da produção), porta **`127.0.0.1:5679`** (nada exposto), SQLite em **volume nomeado** (zero bind mount, zero caminho absoluto), **teto de memória explícito** para nunca pressionar o Baserow | CLAUDE §5, §5.4 |

---

## 2. Decisões de recorte — os pontos que pedem seu OK

1. **Envelope já desempacotado na 0.1.0.** O roteiro põe "envelope" na 0.2.0, mas entregar
   a List devolvendo `{items, count}` cru e trocar o formato de saída na versão seguinte é
   quebra de contrato gratuita. Antecipo **só o desempacote** (3 linhas, no transporte, como
   manda CLAUDE §4); todo o resto do transversal fica na 0.2.0 (seção 5).
2. **`Limit` sem `Return All`.** Return All de verdade exige paginação com `$skip` — é a
   entrega da 0.2.0. Se o linter oficial exigir o par `returnAll`+`limit`, desabilito a
   regra pontualmente com comentário apontando o roteiro, em vez de implementar às pressas.
3. ~~Ícone placeholder genérico~~ → **decidido em 2026-07-24: usa o logo do Nibo**
   (aprovação do Alvaro; risco 2 do DESIGN §10 encerrado). SVG vetorizado a partir do
   símbolo oficial do site, cor `#002d72`. O gate G1 da seção 4 está fechado.
4. **Sem testes unitários na 0.1.0.** A validação desta versão é linter + scanner +
   instalação real (o que ela existe para provar). Unit tests entram na 0.2.0, junto com a
   lógica transversal que merece teste (DESIGN §8, camada 1).
5. **`continueOnFail` estrutural desde já** (try/catch por item no handler). A taxonomia
   fina de erro (401 amigável, `validation_error` × `internal_server_error`) é 0.2.0 —
   na 0.1.0 nenhum erro é engolido: propaga com o corpo original.

---

## 3. Onde cada regra inviolável é atendida

| Regra (CLAUDE §6) | Onde a v0.1.0 a atende |
|---|---|
| 1 — Não encostar no `baserow` | Compose próprio com serviço único; `mem_limit` explícito; nenhum comando Docker genérico em nenhum passo deste plano |
| 2 — Docker com alvo explícito | Todos os comandos da seção 4 escritos por extenso com `-f docker-compose.dev.yml -p n8ndev` |
| 3 — **Só leitura** | Superfície total da versão = `GET /customers` + teste de credencial `GET /categories?$top=1`. **Não existe código de POST/PUT/DELETE no pacote** — a regra é estrutural, não disciplinar |
| 4 — Nenhum token em código/commit | Token só dentro da credencial do n8n de dev, colado na hora do teste; zero fixture, zero exemplo com token real; `.gitignore` desde o 1º commit |
| 5 — **Zero dependência de runtime** | `dependencies: {}` no `package.json`; `n8n-workflow` como **peerDependency**; TypeScript/ESLint/gulp só em devDependencies; HTTP exclusivamente pelos helpers do n8n |
| 6 — Sem estado no host, sem caminho absoluto | `docker-compose.dev.yml` versionado no repo, volume **nomeado** do Docker (SQLite descartável), zero bind mount — migrar continua sendo `git clone` + um comando |
| 7 — Instalação real | Seção 4 — é o gate de "pronta" da v0.1.0; nada é considerado entregue antes dele |
| 8 — Fronteira privado/público | README e este plano escritos do zero; nada copiado do `CONTRATO-API.md`; este arquivo não contém dado interno |
| Decisão 9 — **Inglês na UI** | `displayName`, nomes de parâmetro, descrições, textos de ajuda, mensagens de erro e README em inglês **desde o primeiro arquivo** (nome de parâmetro é contrato); docs internos, como este plano, seguem em português |
| **UTF-8** (CLAUDE §4) | Estrutural: `transport/request.ts` é a única saída HTTP e só aceita **objeto JS** — não existe lugar no código onde JSON seja montado como string |

---

## 4. Teste de instalação real (regra 7)

**Gates antes da tag** (nesta ordem):

- **G1 · Ícone** — ✅ **fechado (2026-07-24)**: logo do Nibo, por decisão do Alvaro.
- **G2 · Autorização de publicação** — Trusted Publisher configurado no npm apontando para
  este repo + `publish.yml`, **ou** secret `NPM_TOKEN` no GitHub (DESIGN §6). Nos dois
  casos o token do npm nunca chega à VPS.
- **G3 · Verde local** — `npm run lint` e `npm run build` limpos; pré-flight de pacote:
  `npm pack` e conferência do tarball (`dist/` completo, atributo `n8n` apontando para
  arquivos que existem dentro dele). Não substitui a regra 7 — só evita queimar número de
  versão com erro grosseiro.

**O teste em si** (fazemos juntos — eu aviso quando o código chegar aqui):

1. **Publicar**: com seu OK, `git tag v0.1.0` + push da tag → o `publish.yml` roda
   lint → build → publish com *provenance* → scanner oficial.
2. **Subir a instância limpa** (na VPS):
   `docker compose -f docker-compose.dev.yml -p n8ndev up -d`
3. **Túnel no seu PC**: `ssh -L 5679:localhost:5679 <usuario>@<vps>` → abrir
   `http://localhost:5679` → criar a conta owner descartável do dev.
4. **Instalar de verdade**: Settings → Community Nodes → Install →
   `n8n-nodes-nibo-empresas` → aceitar o aviso de risco.
   *(A 4ª porta do nome com ponto no escopo foi provada aqui — e reprovou; ver o adendo.)*
5. **Node na paleta**: "Nibo Empresas" aparece na busca, com ícone.
6. **Credencial**: criar "Nibo Empresas API"; você cola **na hora** um ApiToken (leitura —
   permitido pela regra 3; nada de token é pedido antes disso, e ele não toca arquivo
   nenhum) → botão de teste da credencial **verde**.
7. **Fumaça**: workflow Manual Trigger → Nibo Empresas (Customer · List · Limit 5) →
   executar.
8. **Encerrar**: `docker compose -f docker-compose.dev.yml -p n8ndev down`
   (volume preservado; Baserow intocado do início ao fim).

**Critérios de aceite** — a v0.1.0 só é "pronta" com todos:

| ✔ | Critério |
|---|---|
| ☐ | Instalação pela UI conclui sem erro de validação de nome (ponto no escopo) |
| ☐ | Node visível na paleta, com ícone |
| ☐ | Teste da credencial verde (bate em `/categories?$top=1`) |
| ☐ | List devolve **um item n8n por cliente** (5 com Limit 5, ou o total se menor) |
| ☐ | Acentuação dos nomes intacta na saída (spot-check UTF-8 de leitura) |
| ☐ | Sem token válido, o erro exibido é o 401 da API com corpo preservado — nada engolido |

Falhou qualquer um → corrige → `v0.1.1`. O roteiro só avança para a 0.2.0 com a tabela cheia.

---

## 5. O que a v0.1.0 deliberadamente NÃO faz

| Fora | Entra em (DESIGN §9) |
|---|---|
| `Return All`, paginação `$skip`, `count` como metadado, aviso de drift | 0.2.0 |
| Taxonomia de erro (`validation_error` × `internal_server_error`, 401 amigável) | 0.2.0 |
| Exceção array puro de `/employees` | 0.2.0 |
| `$filter`/OData na UI | 0.2.0+ |
| Testes unitários | 0.2.0 |
| Modo **token do item** | 0.3.0 |
| Get · Create · Update-merge · Delete | 0.4.0 |
| Supplier / Employee / Partner na UI (uma linha cada no handler, DESIGN §2.3) | pós-0.4.0 |
| API `accountant` | nunca (decisão permanente) |

Commits pequenos por fase (1.1 → 1.2 → 1.3); push e tag só com seu OK.
