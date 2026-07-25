# n8n-nodes-nibo-empresas

This is an [n8n](https://n8n.io/) community node. It lets you use the **Nibo Empresas API** in your n8n workflows.

[Nibo](https://www.nibo.com.br/) is a Brazilian financial management platform used by accounting firms and the businesses they serve. This package covers the **Empresas** API (`https://api.nibo.com.br/empresas/v1`), which reads and writes the financial records of one organization per API token.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

> **Status: early development (v0.4.x).** Use **0.4.1 or later**: in 0.4.0 the Update operation could not write at all — it failed loudly rather than silently, but it failed. The package is published thin on purpose, growing one proven slice at a time. See [Version history](#version-history) for what works today.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is:

```
n8n-nodes-nibo-empresas
```

> Note: n8n cannot load community packages whose npm scope contains a dot (the
> node-type resolver splits type names on `.`), so this package is published
> unscoped.

## Operations

| Resource | Operation | Notes |
|---|---|---|
| Customer | Create | Adds a customer and returns it as Nibo stored it |
| Customer | Delete | Removes a customer and returns `{ id, deleted: true }` |
| Customer | Get | Returns one customer by ID |
| Customer | Get Many | Returns customers, paging through the collection when needed. A stable sort (`$orderby=id`) is always applied. |
| Customer | Update | Changes the fields you list and **leaves every other field as it is** — see [Update](#update) |

> **The document type has one spelling.** The API takes `CNPJ`/`CPF` when you write and answers `Cnpj`/`Cpf` when you read. Since 0.4.0 the node hands out the first spelling on **every** operation, Get Many included. If a workflow of yours compares `document.type` with `'Cnpj'`, that comparison has to become `'CNPJ'`.

**Get Many** takes:

| Field | What it does |
|---|---|
| **Return All** | Reads the whole collection instead of stopping at a limit |
| **Limit** | How many records to return when *Return All* is off. The API caps every page at 500 records silently, so a higher limit is collected in several pages |
| **Filter (OData)** | An OData expression sent as `$filter`, for example `contains(name,'LTDA')`. Accented text needs no special treatment |
| **Fail on Incomplete Results** | Off by default. See *Incomplete results* below |

### Create

**Name**, **Document Number** and **Document Type** are asked for up front; everything else lives under **Additional Fields**, and only the fields you add are sent. The customer comes back as Nibo stored it, with the fields the API fills in on its own (`personType`, `isCompany`, `initialsName`) already there.

Two details of this API worth knowing before you fill the form in:

- **Document Number takes digits only** — no dots, slashes or dashes.
- **Email is one string holding every address, separated by commas** (`billing@example.com,accounts@example.com`). This API keeps a customer's e-mails in a single field, not in a list.

### Update

The API's `PUT` takes the **whole** record: every field left out of the body is **zeroed**, silently and with HTTP 200. Worse, a payload it cannot read is answered with `{"Messages":[""]}` — HTTP 200, no error, and nothing written. It is the kind of failure nobody notices until someone asks why a customer lost its address.

So this operation never sends a bare `PUT`. For each item it:

1. reads the customer as it is stored;
2. merges the fields you added onto it;
3. writes the complete record back;
4. **reads it again and checks that the fields you changed really changed.**

Three calls where one would do, on purpose. If the API answers with `Messages`, or if the confirmation finds a field that did not take, the item fails and says which field — it never reports a write that did not happen as a success.

What that gives you:

| | |
|---|---|
| A field you **do not add** | Is not touched. The customer keeps whatever is in Nibo |
| A field you add and **leave empty** | Is written empty. That is how a stored value is erased on purpose |
| **Update Fields left empty** | The item fails instead of rewriting the record with itself |

The address is offered field by field (**Address City**, **Address Line 1**, …) rather than as one block, for the same reason: a block would submit every field it contains the moment you opened it, and this API would write exactly that.

### Delete

Takes the customer ID and removes it. The API answers 204 with no body, so the node returns `{ id, deleted: true }` as the confirmation. It is an ordinary operation with no extra guard rail — whoever builds the workflow answers for what it does.

### Interval between requests

Under **Options**, at the end of the node, **Interval Between Requests** is how long the node waits between two calls to the API, in milliseconds. It applies both between input items and between the pages of a single scan — never before the first call.

Leave it out and the node waits **1000 ms**. That default is deliberately conservative: one node looping over a portfolio of organizations fires hundreds of calls back to back, and that has to be handled by default rather than remembered by whoever builds the workflow. Add the option and set it to `0` to send the calls with no gap at all.

### Incomplete results

Paging by `$skip` cannot see records written while the scan runs: they land at an arbitrary position in the ordering and can fall behind the point already read, disappearing with no error at all. The node watches the record count the server reports at the start and at the end of the scan, and checks that at least as many records arrived as it announced.

When something does not add up, the records are still returned — they are valid, just possibly incomplete — and the last item carries a `_niboPaginationWarning` field describing what happened (the same text is logged as a warning). Turn on **Fail on Incomplete Results** to make the node stop with an error instead.

### Errors

The Nibo API answers **HTTP 500 for invalid requests too**, which makes a plain "the service failed" message useless. The node reads the response body and says which one it got:

| What happened | What the node does | Is *Retry On Fail* useful? |
|---|---|---|
| Token missing, expired or from another organization (HTTP 401) | Says the token was rejected | No — fix the token |
| `validation_error` (bad filter, unknown sort field, broken business rule) | Shows the API's own description of the problem | **No** — retrying repeats the same invalid request |
| `internal_server_error` | Shows the failure with the original body preserved | **Yes** — this one is a genuine server-side failure |

A write can also fail without the API saying so — see [Update](#update) for how that one is caught.

## Authentication

The **Authentication** field, at the top of the node, chooses where the token comes from:

| Mode | Use it when |
|---|---|
| **Credential** *(default)* | One organization per node. The stored credential holds the token and the base URL |
| **API Token (Per Item)** | Many organizations in one node. The token is read from the **API Token** field separately **for each input item** |

An n8n credential cannot be picked per item: the field accepts no expression and is resolved once per node. That is the whole reason the second mode exists. **API Token** is an ordinary parameter, so it does accept an expression, and every item resolves its own:

```
{{ $json.apiToken }}
```

Feed the node one item per organization — from a database, a spreadsheet, or a previous node — and each item reads the books of its own token. In this mode the credential is neither shown nor required, and the base URL is always `https://api.nibo.com.br/empresas/v1`: with no credential there is nowhere else to keep one. If you ever need a different address, use the credential mode.

An item that carries no token fails **on its own**, carrying its item index, so the rest of the run is unaffected. Set the node's *On Error* to **Continue (using error output)** to route those failures somewhere else instead of stopping the workflow.

> ⚠️ **The token is not hidden in the execution data.** n8n redacts credentials, not parameters, so a token resolved into this field stays visible in the workflow's execution history — exactly as it already does in an HTTP Request node carrying the same header. This mode does not make that worse and it does not fix it either. Where that matters, keep the tokens in credentials and use the credential mode.

## Credentials

You need a Nibo organization **API token**:

1. In Nibo, open the organization.
2. Go to **More options → Settings → API** and copy the token.
3. In n8n, create a **Nibo Empresas API** credential and paste the token.

Keep in mind that in this API **the token is the organization**: every request made with a token reads that organization's books. There is no organization parameter in any route — to work with another organization you use another token.

The credential test performs a lightweight `GET /categories?$top=1` call.

## Compatibility

Developed and tested against n8n **2.18.5** (self-hosted), on a clean instance, installed through the Community Nodes screen. Node.js ≥ 20.15 is required to build the package.

## Usage

Add the **Nibo Empresas** node to a workflow, select the credential, and run **Customer → Get Many**. Each customer becomes one n8n item.

Writing works the same way: **Create** takes a name and a document, **Update** takes the ID of a customer and only the fields you want changed, and **Delete** takes an ID. Each input item is one operation, and each answers with the record as Nibo has it.

To read several organizations in a single node, switch **Authentication** to *API Token (Per Item)*, point the **API Token** field at the token carried by each input item, and send one item per organization — see [Authentication](#authentication).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Nibo API documentation](https://nibo.docs.apiary.io/)

## Version history

| Version | Delivered |
|---|---|
| 0.1.1 | Package skeleton, `niboEmpresasApi` credential, Customer: Get Many (single page, `$orderby=id`). First working release — 0.1.0 was published under a scoped name (`@alvarocastro.tech/…`) that n8n turned out to be unable to load |
| 0.1.2 | Clean bill from the official n8n scanner (themed light/dark icons, credential icon, `usableAsTool`, `NodeConnectionTypes` enum, safe error rethrow) and a real pre-publish gate in CI (`lint:community`). No behavior changes |
| 0.1.3 | Dark-theme logo tone changed from white to light blue (`#9db9de`), picked against a live preview of the n8n dark canvas. Icon-only release |
| 0.1.4 | Load fix: tolerate stray old `n8n-workflow` copies that other community packages install into `~/.n8n/nodes` — they shadowed the real library and crashed class loading with "Class could not be found" (regression introduced by the scanner-mandated enum in 0.1.2) |
| 0.2.0 | Real pagination: **Return All** walks the collection with `$skip` past the silent 500-record cap, and a limit above 500 is collected in several pages. **Filter (OData)**. Warning when a scan may be incomplete, with an opt-in strict mode. Readable errors that tell an invalid request apart from a server failure. First unit tests (jest, no network), now part of the release gate |
| 0.2.1 | Dark-theme logo tone changed from light blue (`#9db9de`) to `#0653cd`. Icon-only release |
| 0.3.0 | **Per-item API token**: *Authentication* chooses between the stored credential and a token read from each input item, so one node can walk a whole portfolio of organizations in a loop. An item with no token fails alone, carrying its index, leaving the rest of the run untouched. **Interval Between Requests** (1000 ms by default), applied between items and between pages, never before the first call |
| 0.3.1 | Fix: in 0.3.0 the **Authentication** switch could not actually be moved to *API Token (Per Item)* in the editor. n8n reserves the parameter name `authentication` for its "main auth field", which it hides from the parameter list and redraws inside the credentials block — where every option must be backed by a credential, and the per-item mode is backed by none. The parameter is now named `authMode` internally; the field, its label and its options are unchanged. **A node saved in per-item mode under 0.3.0 must have the mode picked again** |
| 0.4.0 | **The first writes**: Customer **Create**, **Update**, **Delete** and **Get**. Update is a safe cycle — read, merge, write, then read back to confirm the change took — because this API's `PUT` zeroes every field left out of the body and answers a payload it cannot read with `{"Messages":[""]}`, HTTP 200 and nothing written. Fields you do not add are not touched; a field added and left empty is erased on purpose. ⚠️ **Visible change:** `document.type` now comes out as `CNPJ`/`CPF` on every operation, Get Many included, where reads used to answer `Cnpj`/`Cpf` |
| 0.4.1 | Fix, found by 0.4.0's own confirmation step on the first real run: **Update wrote nothing**. A read answers `phone` and `email` twice — once inside `communication`, once mirrored at the root of the record — and sending both back makes the root copy, which still carries the old value, win. The node now drops the two mirrors from the body it writes, and the API fills them back in. Also: the confirmation no longer reports a change as refused when the API pads the value it stored (`zipCode` comes back with a trailing space) |
| 0.4.2 | The node reads in the order it is filled in: **Authentication** now comes above the credential picker, **Interval Between Requests** moved into **Options** at the end (still 1000 ms when left out — a node that set it before keeps its value), **Document Type** is asked before **Document Number**, and **Company Name** is no longer offered for a CPF, since a person has no trading name |
| 1.0.0 *(planned)* | Production acceptance against real workflows |

## Disclaimer

This is an independent community package and is **not** an official Nibo product. Nibo and the Nibo logo are trademarks of their respective owner, used here solely to identify the service the node integrates with.

## License

[MIT](LICENSE)
