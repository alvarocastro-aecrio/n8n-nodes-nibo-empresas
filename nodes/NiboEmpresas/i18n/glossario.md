# Glossário — o vocabulário da Nibo

Vale para todos os arquivos de `i18n/pt-BR/`. Onde a Nibo tem palavra própria, é ela que
manda: o usuário reconhece a palavra que vê na tela do sistema dele, não a tradução
literal do inglês.

| Inglês (no código) | Português | Observação |
|---|---|---|
| Stakeholder | Contato | guarda-chuva dos quatro abaixo |
| Customer | Cliente | |
| Supplier | Fornecedor | |
| Partner | Sócio | |
| Employee | Funcionário | |
| Schedule (credit) | Conta a Receber | |
| Schedule (debit) | Conta a Pagar | |
| Payment | Pagamento | baixa de conta a pagar |
| Receipt | Recebimento | baixa de conta a receber |
| Collection | Cobrança | boleto/Pix |
| Category | Categoria | |
| Cost Center | Centro de Custo | |
| Bank Account | Conta Bancária | |
| Bank Transfer | Transferência Bancária | |
| Transaction | Lançamento | |
| Service Invoice | Nota Fiscal de Serviço | "NFS-e" quando couber no rótulo |
| Annotation | Anotação | |
| File | Arquivo | |
| Schedule File | Anexo da Conta | anexo de conta a pagar/receber |
| Get Many | Buscar Várias | operação de listagem |
| Get | Buscar | |
| Create | Criar | |
| Update | Atualizar | |
| Delete | Excluir | |
| Return All | Retornar Tudo | |
| Additional Fields | Campos Adicionais | |
| Update Fields | Campos a Atualizar | |
| Options | Opções | |
| Filters | Filtros | |

## Intocáveis

Jargão que fica em inglês, porque a tradução vira ruído: **webhook, token, ID, OData,
JSON, PDF, XML, API, endpoint, timeout, base64, GUID**.

E o sufixo **"Name or ID"** no fim de um `displayName`, exatamente assim. A regra
`node-param-display-name-wrong-for-dynamic-options` do lint do n8n exige aquele literal e
roda no `prepublishOnly`. Traduz-se o resto do rótulo: `'Category Group Name or ID'` vira
`'Grupo de Categoria Name or ID'`.

## Registro — a voz do repositório

As descrições deste repo são frases inteiras, com julgamento e travessão, não legenda de
manual. Traduza a frase toda, preservando o tom; não resuma.

> `'Open a new account in the organization — an act this API gives no way back from'`
> vira
> `'Abre uma conta nova na organização — um ato que esta API não desfaz'`,
> e **não** `'Cria conta'`.

## Convenções de forma

- `displayName` e `name` de opção usam Maiúsculas Em Cada Palavra Principal, como o
  original: `'Get Many'` → `'Buscar Várias'`.
- `description` **não** termina com ponto final — é a convenção do n8n e o lint cobra.
  (Ponto no meio da frase, quando o texto tem mais de um período, é normal.)
- Nunca se altera a CHAVE do objeto (a string à esquerda dos dois-pontos) nem o NOME do
  campo (`displayName`, `description`, `name`, `action`, `placeholder`, `hint`). As
  chaves saem do código, por `scripts/i18n-skeleton.js`; mudar uma quebra a tradução em
  silêncio.
- `value` de opção e `name` de parâmetro não aparecem aqui de propósito: são o que o
  workflow grava e o que o roteador despacha.
