# n8n-nodes-nibo-empresas

This is an [n8n](https://n8n.io/) community node. It lets you use the **Nibo Empresas API** in your n8n workflows.

[Nibo](https://www.nibo.com.br/) is a Brazilian financial management platform used by accounting firms and the businesses they serve. This package covers the **Empresas** API (`https://api.nibo.com.br/empresas/v1`), which reads and writes the financial records of one organization per API token.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

> **Status: early development (v0.1.x).** The package is published thin on purpose, growing one proven slice at a time. See [Version history](#version-history) for what works today.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is:

```
@alvarocastro.tech/n8n-nodes-nibo-empresas
```

## Operations

| Resource | Operation | Notes |
|---|---|---|
| Customer | Get Many | Returns up to one page of customers (the API caps every page at 500 records). A stable sort (`$orderby=id`) is always applied. |

Full pagination ("Return All"), richer error handling, per-item token authentication, and write operations are on the roadmap — see [Version history](#version-history).

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
| 0.1.0 | Package skeleton, `niboEmpresasApi` credential, Customer: Get Many (single page, `$orderby=id`) |
| 0.2.0 *(planned)* | Envelope/pagination internals, Return All, error normalization |
| 0.3.0 *(planned)* | Per-item API token mode (multi-organization loops) |
| 0.4.0 *(planned)* | Customer: Get, Create, Update (safe merge), Delete |
| 1.0.0 *(planned)* | Production acceptance against real workflows |

## Disclaimer

This is an independent community package and is **not** an official Nibo product. Nibo and the Nibo logo are trademarks of their respective owner, used here solely to identify the service the node integrates with.

## License

[MIT](LICENSE)
