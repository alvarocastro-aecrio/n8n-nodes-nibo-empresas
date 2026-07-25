# n8n-nodes-nibo-empresas

This is an [n8n](https://n8n.io/) community node. It lets you use the **Nibo Empresas API** in your n8n workflows.

[Nibo](https://www.nibo.com.br/) is a Brazilian financial management platform used by accounting firms and the businesses they serve. This package covers the **Empresas** API (`https://api.nibo.com.br/empresas/v1`), which reads and writes the financial records of one organization per API token.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

> **Status: early development (v0.2.x).** The package is published thin on purpose, growing one proven slice at a time. See [Version history](#version-history) for what works today.

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
| Customer | Get Many | Returns customers, paging through the collection when needed. A stable sort (`$orderby=id`) is always applied. |

**Get Many** takes:

| Field | What it does |
|---|---|
| **Return All** | Reads the whole collection instead of stopping at a limit |
| **Limit** | How many records to return when *Return All* is off. The API caps every page at 500 records silently, so a higher limit is collected in several pages |
| **Filter (OData)** | An OData expression sent as `$filter`, for example `contains(name,'LTDA')`. Accented text needs no special treatment |
| **Fail on Incomplete Results** | Off by default. See *Incomplete results* below |

### Incomplete results

Paging by `$skip` cannot see records written while the scan runs: they land at an arbitrary position in the ordering and can fall behind the point already read, disappearing with no error at all. The node watches the record count the server reports at the start and at the end of the scan, and checks that at least as many records arrived as it announced.

When something does not add up, the records are still returned — they are valid, just possibly incomplete — and the last item carries a `_niboPaginationWarning` field describing what happened (the same text is logged as a warning). Turn on **Fail on Incomplete Results** to make the node stop with an error instead.

### Errors

The Nibo API answers **HTTP 500 for invalid requests too**, which makes a plain "the service failed" message useless. The node reads the response body and says which one it got:

| What happened | What the node does | Is *Retry On Fail* useful? |
|---|---|---|
| Token missing, expired or from another organization (HTTP 401) | Says the token was rejected | No — fix the credential |
| `validation_error` (bad filter, unknown sort field, broken business rule) | Shows the API's own description of the problem | **No** — retrying repeats the same invalid request |
| `internal_server_error` | Shows the failure with the original body preserved | **Yes** — this one is a genuine server-side failure |

Per-item token authentication and write operations are on the roadmap — see [Version history](#version-history).

## Credentials

You need a Nibo organization **API token**:

1. In Nibo, open the organization.
2. Go to **More options → Settings → API** and copy the token.
3. In n8n, create a **Nibo Empresas API** credential and paste the token.

Keep in mind that in this API **the token is the organization**: every request made with a token reads that organization's books. There is no organization parameter in any route — to work with another organization you use another token.

The credential test performs a lightweight `GET /categories?$top=1` call.

## Compatibility

Developed and tested against n8n **2.18.5** (self-hosted). Node.js ≥ 20.15 is required to build the package.

## Usage

Add the **Nibo Empresas** node to a workflow, select the credential, and run **Customer → Get Many**. Each customer becomes one n8n item.

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
| 0.3.0 *(planned)* | Per-item API token mode (multi-organization loops) |
| 0.4.0 *(planned)* | Customer: Get, Create, Update (safe merge), Delete |
| 1.0.0 *(planned)* | Production acceptance against real workflows |

## Disclaimer

This is an independent community package and is **not** an official Nibo product. Nibo and the Nibo logo are trademarks of their respective owner, used here solely to identify the service the node integrates with.

## License

[MIT](LICENSE)
