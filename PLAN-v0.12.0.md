# PLANO DE IMPLEMENTAÇÃO — v0.12.0

> **Não é spec.** Convenção igual à dos planos anteriores: um documento só, com as
> medições, as decisões de recorte e as fatias.
>
> 🔒 Escrito para ser seguro em repositório público: nenhum nome de cliente, ID de
> workflow, ID de credencial — e **nenhum token**. Os GUIDs citados são das contas de
> sonda da empresa de teste, criadas por este projeto.

**Escopo da v0.12.0:** **a escrita de contas bancárias** — `Bank Account · Create` e
`Bank Account · Update`, com o **`balanceLockDate`** (a trava do período contábil) como
campo de primeira classe.

**Por que agora.** A decisão 9 do PLAN-v0.11.0 deixou `POST /accounts` e
`PUT /accounts/{id}` de fora *"até haver uso real"*. A condição foi cumprida em
2026-07-27: o Alvaro os quer para **automações de fechamento contábil** — ao fechar o
mês, a automação avança a trava da conta. Files & Annotations, que seria a próxima fatia
pela ordem do contrato, passa a ser a 0.13.0.

**Por que é minor e não patch:** capacidades novas — duas operações que não existiam.
As 0.11.x publicadas são imutáveis, e a regra deste projeto desde a 0.11.0 é que
operação nova é minor.

**Fora de escopo:** limpar a trava (`balanceLockDate` → nada) — sem uso declarado, e
limpar por omissão é justamente o acidente que o merge existe para impedir (1.3);
oferecer `isArchived` no Update — o PUT ignora o campo (1.4), e oferecer seria vender o
que não existe; Files & Annotations; NFS-e; Collections.

---

## 1. Medições — o que a API respondeu

Tudo medido **na cobaia, em 2026-07-27**, com escrita liberada pelo Alvaro e o resíduo
declarado na 1.7. Toda escrita foi numa conta criada pelas próprias sondas — nunca nas
duas que os aceites anteriores usam.

### 1.1 O POST: o que aceita, o que ignora, e o que o saldo vira

`POST /accounts` responde **200 com o GUID nu no corpo** (string crua, sem envelope).

| Campo mandado | O que gravou |
|---|---|
| `name` | ✔ como mandado |
| `openBalance: 500` | ✔ — e **vira o `balance` da view de saldo** |
| `dateOfOpenBalance: "2026-07-01"` | 🔴 **`2026-06-30T00:00:00Z` — um dia ANTES** (ver 1.2) |
| `bankNumber: 341` | 🔴 **ignorado em silêncio** — gravou `0` |

O registro criado nasce com 26 campos, os demais preenchidos pela API (`isReconcilable:
true`, `canBeAutomated: true`, etc.). A view de saldo **não mostrou a conta nova de
imediato** — apareceu na leitura seguinte, minutos depois, com `balance: 500`.

### 1.2 🔴 O −1 dia é do POST; o PUT grava exato

| Operação | Mandado | Gravado |
|---|---|---|
| `POST` | `2026-07-01` (só a data) | **`2026-06-30T00:00:00Z`** |
| `PUT` | `2026-07-10` (só a data) | `2026-07-10T00:00:00Z` ✔ |
| `PUT` | `2026-07-10T00:00:00Z` | `2026-07-10T00:00:00Z` ✔ |

O deslocamento existe **só na criação**, e o PUT corrige com precisão. É o que decide o
desenho do Create (decisão 2): criar, reler, e **consertar com um PUT** quando a data
gravada não for a pedida. Não foi medido se o POST com sufixo `Z` evita o desvio —
medir custaria mais uma conta permanente (1.4), e o conserto por PUT cobre os dois casos.

### 1.3 O PUT: o eco é seguro, a trava anda para os dois lados, e a omissão LIMPA

| ☑ | O que foi feito | Resposta |
|---|---|---|
| ☑ | PUT do registro **inteiro como veio** (com `id`, `type`, `updateDate`…) | **204**, só `updateDate` muda — o eco é inócuo |
| ☑ | PUT com `balanceLockDate: "2026-07-15"` (para frente) | **204**, trava gravada |
| ☑ | PUT com `balanceLockDate: "2026-07-05"` (**para trás**) | **204** — 🔴 **destravar não tem guarda nenhuma na API** |
| ☑ | PUT **sem** `balanceLockDate` no corpo | **204** — 🔴 **a trava é LIMPA em silêncio** |
| ☑ | PUT **parcial** — só `{name}` | **500** SQL (*datetime2 out-of-range*), mascarado como *"O Nibo se comportou de forma inesperada."* — **nada gravado** |

O parcial ao menos falha alto (o `dateOfOpenBalance` ausente vira data mínima e o banco
recusa) — mas com a pior mensagem possível. E a linha da omissão é a que define o
Update: **qualquer PUT que não repita a trava destrava o período**, com 204 e sem uma
palavra. O merge do node (ler → mesclar → mandar o registro inteiro) preserva a trava
por construção.

### 1.4 🔴 Arquivar por API NÃO existe — e a sonda anterior quase concluiu o contrário

`PUT` com `isArchived: true` responde **204 e ignora o campo**: a conta segue na lista,
com `isArchived: false`, em três releituras. `$filter=isArchived eq true` responde 200 e
vazio. A especulação da 1.10 do PLAN-v0.11.0 (*"arquivar por PUT talvez sirva de
saída"*) está **derrubada**: conta criada é **permanente e visível**, e arquivar é só
pela tela do Nibo.

O quase-erro merece registro: a primeira sonda "viu" a conta sumir da lista após o
`isArchived: true` — mas as três leituras tinham levado **429** (1.5), cujo corpo é
texto, e o parser leu texto como lista vazia. A releitura com pausa desfez a conclusão.
**Um 429 não reconhecido fabrica um falso resultado** — não é só um erro a repassar.

### 1.5 🔴 O limite de taxa que nunca tinha aparecido: 14 por segundo

Sondas disparadas em rajada responderam **HTTP 429** com corpo **texto puro** (não
JSON): `API calls quota exceeded! maximum admitted 14 per Second.` É a primeira vez que
esta API responde 429 ao projeto, em ~12 versões de medições.

- O intervalo padrão do node (1000 ms) passa longe do limite; as esperas do read-back
  (500–2500 ms) também.
- Mas o `classifyNiboError` de hoje não conhece 429 nem corpo-texto: cairia no genérico.
  Vira fatia (decisão 6).

### 1.6 O resto do contorno

- `GET /accounts/{id}` segue **404** — o Update lê pela lista, `id eq <guid nu>`.
- A leitura pós-PUT em `/accounts` é **imediata** (toda sonda releu a mudança na hora);
  quem atrasa é a view de saldo (1.1, e já era o gotcha da 0.11.0).
- `DELETE /accounts/{id}` segue 404 (medido na 0.11.0; não repetido).

### 1.7 O que ficou na cobaia

⚠️ **Permanente, e declarado:** **uma conta** — `SONDA CONTA 0.12.0 ESCRITA` — criada
pela sonda do POST. Saldo **zerado por PUT** ao final (`openBalance: 0`, conferido na
view), sem trava, sem lançamento. Não sai por API (1.4); se incomodar, arquiva-se pela
tela. O aceite da fatia 2 criará **mais uma** (decisão 8), também declarada.

---

## 2. Decisões de recorte

1. **Duas operações novas em `Bank Account`, nenhum recurso novo.** `Create` e
   `Update`. O menu fica: Get Balances · Get Many · **Create** · Import Bank Statement ·
   **Update** (ordem alfabética de rótulo, como o linter pede).

2. **`Create` relê e conserta a data.** O fluxo é `POST` → releitura pela lista → se o
   `dateOfOpenBalance` gravado ≠ pedido (1.2), **um PUT corretivo** → releitura final. O
   usuário pede uma data de abertura e recebe **aquela** data, não a véspera. A resposta
   é o registro como ficou.

3. **`Create` pede `Name`; `Opening Balance` e `Opening Balance Date` são opcionais; e
   `bankNumber` NÃO é oferecido** — a API o ignora em silêncio (1.1), e um campo que a
   tela aceita e o servidor joga fora é uma mentira de formulário.

4. **`Create` avisa que é um ato sem volta, antes do botão.** `DELETE` é 404 e arquivar
   por API não existe (1.4) — o notice diz exatamente isso, incluindo que a saída é a
   tela do Nibo. Mesmo padrão do notice de Categoria (0.9.0).

5. **`Update` é o merge de sempre, adaptado à porta que existe.** Lê pela lista (o
   get-by-id é 404), mescla por cima, manda o **registro inteiro** (o eco é seguro,
   1.3), relê e confirma. Campos oferecidos: `Name`, `Opening Balance`, `Opening
   Balance Date`, `Balance Lock Date`. A trava atual **sobrevive por construção** a um
   update que não fala dela — que é a defesa contra a 1.3.

6. **Recuar a trava é recusado por padrão.** Avançar (`fechamento`) passa; pedir uma
   `Balance Lock Date` **anterior à atual** é recusado com a explicação do que isso
   destravaria — a API aceita sem uma palavra (1.3), e destravar período fechado é
   decisão de gente, não efeito colateral. A option **`Allow Moving the Lock Back`**
   (opt-in, em Options, padrão de UI §4.1) libera para quem sabe o que está fazendo.

7. **429 vira classificação no transporte.** `classifyNiboError` reconhece o status 429
   e o corpo-texto, e responde com o limite (14/s) e o conselho (o intervalo padrão já
   protege; não zere o intervalo em lote grande). Sem retry automático nesta versão —
   só a mensagem certa no lugar do genérico.

8. **O aceite do `Create` cria uma conta permanente — declarada aqui, antes.** Não há
   como aceitar uma criação sem criar (1.4: não se apaga nem se arquiva por API). Nome:
   `SONDA CONTA 0.12.0 ACEITE`, saldo zero. O aceite do `Update` usa a conta de sonda
   que já existe (1.7) — resíduo novo nenhum.

9. **A numeração é 0.12.0.** O pedido original era "ainda na 0.11", e a ordem foi
   honrada — esta versão sai **antes** de Files & Annotations. O rótulo, porém, segue a
   regra escrita do projeto: versão publicada é imutável e capacidade nova é minor.

---

## 3. Arquitetura — onde cada comportamento mora

| Camada | O que ganha na 0.12.0 |
|---|---|
| `resources/bankAccount/description.ts` | `Create` e `Update`, os campos e os dois avisos (sem volta; trava) |
| `resources/bankAccount/execute.ts` | O ciclo do Create (POST → relê → conserta) e o merge do Update (lê pela lista → `deepMerge` → PUT inteiro → confirma) |
| `transport/errors.ts` | Reconhece **429** e corpo-texto (decisão 7) |
| `transport/merge.ts` | **Nada** — o `deepMerge` já serve |
| `transport/save.ts` | **Nada** — o `niboSafeUpdate` é acoplado ao get-by-id, que aqui não existe; adaptá-lo custaria mais que o ciclo local no resource |
| `NiboEmpresas.node.ts` · credencial | **Nada** — o recurso já está declarado |
| `transport/paginate.ts` · `odata.ts` | **Nada** |

---

## 4. Fatias, com teste antes do código

1. **429 no transporte** *(commit próprio)*. Testes: status 429 + corpo-texto →
   mensagem citando o limite e o intervalo; um 429 embrulhado pelo helper também é
   reconhecido; os kinds existentes não mudam.
2. **`Bank Account · Create`** *(commit próprio)*. Testes: POST com os três campos e
   nunca `bankNumber`; resposta 200-GUID-cru é lida; releitura pela lista com GUID nu;
   **data gravada ≠ pedida dispara o PUT corretivo e a releitura final**; data gravada =
   pedida não dispara PUT nenhum; sem data pedida, nada é conferido; o notice existe e
   fala em "cannot be deleted or archived".
3. **`Bank Account · Update`** *(commit próprio)*. Testes: lê pela lista e recusa ID
   sem registro; manda o registro **inteiro** mesclado; a trava atual sobrevive a um
   update só de nome; **recuar a trava é recusado sem a option e passa com ela**;
   avançar passa sempre; primeiro fechamento (sem trava atual) passa; a confirmação
   relê e compara os caminhos pedidos; `isArchived` não é campo oferecido.
4. **README, catálogo e bump 0.12.0** *(commit próprio)*. `endpoints.md`/`payloads.md`:
   o POST e seus campos (com o `bankNumber` ignorado e o −1 dia), o PUT exato, a
   omissão que limpa a trava, o `isArchived` ignorado, o 429 de 14/s e o falso-sumiço
   que ele fabrica; `SKILL.md`: gotchas novos + triagem; a nota de ressincronização do
   CLAUDE.md.

---

## 5. Onde cada regra inviolável continua atendida

| Regra | Na v0.12.0 |
|---|---|
| 3 — escrita só na cobaia | Sondas da seção 1 e aceites: só a cobaia, com liberação explícita de 2026-07-27; resíduo na 1.7 e na decisão 8 |
| 4 — nenhum token em código ou commit | Sondas leram de variável de ambiente |
| 5 — zero dep de runtime | `dependencies` segue `{}` |
| 6 — nada de caminho absoluto | Sondas descartáveis no scratchpad |
| Decisão 9 (projeto) — inglês | Campos, rótulos, mensagens, README |
| 7 — instalação real | A 0.12.0 só fecha depois da tela Community Nodes |
| 8 — repo público | Este plano não nomeia cliente nem credencial |

---

## 6. Teste e aceite

**Gate local:** `npm run lint`, `npm run lint:community`, `npm test`, `npm run build`,
`npm pack` verdes antes de cada commit de fatia.

**Aceite:** pelo arranjo de sempre — `IExecuteFunctions` real dirigindo os handlers de
`dist/` contra a cobaia, nunca curl.

| ☐ | Item | Como conferir |
|---|---|---|
| ☐ | `Create` cria com nome, saldo e data — e a data fica **a pedida** | Releitura; é o teste do conserto (1.2) |
| ☐ | `Create` sem saldo/data também funciona | Contra a cobaia |
| ☐ | `Update` renomeia sem tocar no resto | Diff completo do registro |
| ☐ | `Update` avança a trava (o caso do fechamento) | Trava gravada, releitura imediata |
| ☐ | `Update` recusa recuar a trava **sem chamada sair** | Sem a option |
| ☐ | `Update` recua com a option ligada | Decisão 6 |
| ☐ | Trava sobrevive a um update que não fala dela | A defesa da 1.3 |
| ☐ | 429 forçado responde a mensagem nova | Rajada controlada na cobaia |
| ☐ | Node salvo na 0.11.x executa sem ser tocado | `Get Balances` e `Import Bank Statement` |
| ☐ | Resíduo conferido: as duas sondas com saldo 0, sem trava | 1.7 e decisão 8 |
| ☐ | Uma conta criada pelo node aparece **certa na tela do Nibo** | Regra irmã da 7 |
| ☐ | **Instalação real (regra 7)** | Tela Community Nodes de instância limpa |

---

## 7. O que ficou decidido

| # | Estava em aberto | Ficou |
|---|---|---|
| 1 | Se `POST/PUT /accounts` entram | **Entram já, antes de Files** — decisão do Alvaro, 2026-07-27, para automações de fechamento |
| 2 | Escrita na cobaia para medir | **Liberada**, resíduo declarado (1.7) |
| 3 | A numeração | **0.12.0** (decisão 9) — 0.11.x publicadas são imutáveis |

Nada mais depende de decisão. A fatia 1 pode começar com o OK do Alvaro.
