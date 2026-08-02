# n8n-nodes-nibo-empresas

[![npm version](https://img.shields.io/npm/v/n8n-nodes-nibo-empresas.svg)](https://www.npmjs.com/package/n8n-nodes-nibo-empresas)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-nibo-empresas.svg)](https://www.npmjs.com/package/n8n-nodes-nibo-empresas)
[![license](https://img.shields.io/npm/l/n8n-nodes-nibo-empresas.svg)](LICENSE)

Automate the finances of a Brazilian company in [n8n](https://n8n.io/), through the
[Nibo](https://www.nibo.com.br/) **Empresas** API.

Contacts, accounts payable and receivable, settlements, bank accounts and transfers,
boletos with Pix, NFS-e service invoices, attachments and the chart of accounts —
**17 resources, 75 operations**, all of it without a single HTTP Request node.

Zero runtime dependencies. Published with npm provenance. Usable as an **AI Agent tool**.

---

## What it can do

| Resource | Operations |
|---|---|
| **Contact - Customer / Supplier / Employee / Partner** | Create · Get · Get Many · Update · Delete |
| **Schedule - Credit** — a receivable | Create · Get · Get Many · Update · Delete |
| **Schedule - Debit** — a payable | Create · Get · Get Many · Update · Delete |
| **Schedule - File** | Get Many · Attach · Delete |
| **Schedule - Annotation** | Create |
| **Transaction - Payment / Receipt** | Settle · Create · Get · Get Many · Delete |
| **Category** — the chart of accounts | Create · Get · Get Many · Get Many Groups · Get Tree |
| **Cost Center** | Create · Get · Get Many · Update · Delete |
| **Bank Account** | Create · Get Many · Get Balances · Import Bank Statement · Update |
| **Bank Transfer** | Create · Get Many · Delete |
| **File** | Upload · Upload and Attach · Download |
| **Collection** — a boleto with Pix | Create · Get · Get Many · Cancel · Get Many Profiles |
| **Service Invoice** — the NFS-e | Issue · Get · Get Many · Cancel · Get Many Service Profiles |

Every gap in that table is a gap in the API, not in the node: a category cannot be edited or
deleted, a settled entry cannot be updated, a bank account cannot be read one by one or
archived, and a stored file cannot be listed. Each is documented where you meet it.

### A receivable can be born complete

**Schedule - Credit · Create** does more than write a line. In the same operation it can:

- **generate the boleto** — immediately, or a number of days before the due date;
- **issue the NFS-e** — immediately, on settlement, or when the boleto goes out;
- **repeat** — as a recurrence (every N days, weeks, months or years, ending on a date, after
  N occurrences or never), or split into **installments** listed parcel by parcel.

Each of the three defaults to *no*, so a workflow that ignores them writes a plain schedule.
The created item comes back carrying its sibling parcels.

---

## Installation

In n8n, go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-nibo-empresas
```

Or follow the [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

The package has **no runtime dependencies** — nothing is pulled into your n8n instance
beyond the node itself. Every release is built in CI, gated on lint, the official n8n
community rules and a unit-test suite, then published with **npm provenance** and scanned
by `@n8n/scan-community-package`.

## Credentials

You need an organization **API token** from Nibo:

1. In Nibo, open the organization.
2. Go to **More options → Settings → API** and copy the token.
3. In n8n, create a **Nibo Empresas API** credential and paste it.

In this API **the token is the organization** — every request reads that company's books,
and there is no organization parameter in any route. To work with another company, use
another token.

> **Many companies in one node.** Set **Authentication** to *API Token (Per Item)* and the
> token is read from each input item (`{{ $json.apiToken }}`), so one node can walk a whole
> portfolio in a loop. An n8n credential cannot be selected per item — that is what this mode
> is for. Note that a token in a parameter stays visible in the execution history; where that
> matters, use credentials.

---

## What you get over a plain HTTP Request node

**Searchable pickers instead of GUIDs.** Contacts are searched on the server as you type —
an organization can hold thousands. Categories arrive grouped and ordered like the Nibo
screen, filtered to the half that fits the schedule. Cost centers, bank accounts, collection
profiles and service profiles all load from the credential on the node.

**A filter builder that writes the OData for you.** Pick a field, an operator and a value;
add as many conditions as you need and join them with *And* or *Or*. Each field menu holds
only what the API was verified to filter on, and each value gets the literal the API demands —
quoted for text, bare for IDs and amounts, apostrophes doubled. Filtering happens **on the
server**, so what does not match is never paged through.

Need something the conditions cannot say? **Filter (OData)** under *Options* takes a raw
expression, and using it takes over automatically.

**Pagination that survives the 500-record cap.** *Return All* walks the collection with
`$skip`, applying the stable sort key each collection actually requires. The node also
compares the record count the server reports before and after the scan and **fails if records
went missing** mid-scan — turn *Fail on Incomplete Results* off for reads where that does not
matter.

**Updates that cannot silently erase data.** The Nibo `PUT` takes the whole record and zeroes
every field left out of the body. So Update never sends a bare `PUT`: it reads the record,
merges your fields onto it, writes the whole thing back, and **reads it again to confirm the
change took**. A field you do not add is not touched; the item fails, naming the field, if a
write did not land.

**Errors you can act on.** This API answers **HTTP 500 for invalid requests too**, which makes
a generic failure message useless. The node reads the body and tells them apart:

| What happened | Retry helps? |
|---|---|
| Token rejected (401) | No — fix the token |
| `validation_error` — bad filter, broken business rule | No — the request is invalid |
| `internal_server_error` | Yes — a genuine server-side failure |
| Over 14 calls/second (429) | Yes — and see *Interval Between Requests* |

Failures are **per item**, carrying the item index, so one bad row does not take the run
down. Set the node's *On Error* to **Continue (using error output)** to route them elsewhere.

**Rate limiting by default.** *Interval Between Requests* waits **1000 ms** between calls —
between items and between pages, never before the first. Nibo allows 14 calls per second per
organization; the default stays well clear. Set it to `0` to remove the gap.

---

## Before you automate

The Nibo API does a few things quietly. These are the ones that cost money or cannot be undone.

> 🔴 **Issuing is real and immediate.** *Generate Boleto* and *Issue Invoice* set to
> *Immediately* fire as the schedule is created — the charge is issued, the NFS-e goes to the
> city hall. A note cannot be undone, only cancelled, and a cancelled note stays in the
> company's fiscal history.

> 🔴 **Public links.** The `url` of an attachment, the `url` of a charge and the `pdfFileUrl`
> / `xmlFileUrl` of a note all serve their content with **no token of any kind**. Cancelling a
> note does not take its documents down. Treat the link as the document.

> ⚠️ **An update disarms a pending automation.** Any `PUT` on a schedule wipes the boleto and
> NFS-e automations the creation programmed, and no read can rebuild them. Do the updates
> first and create with the automation last.

> ⚠️ **Some acts have no way back.** Creating a **category** and creating a **bank account**
> cannot be undone through this API — no edit, no delete, no archive. **Schedule - File ·
> Delete** destroys the document rather than detaching it. An **annotation**, once written,
> can never be read, edited or deleted.

> ⚠️ **Listings are eventually consistent.** A schedule the get-by-id already answers can be
> absent from its collection for a second or two, and a deleted one can linger. Chain by the
> ID the create hands back rather than by re-listing.

> ⚠️ **The sign of a debit belongs to the endpoint.** The same payable reads `-500` through
> **Get** and `+500` through **Get Many**; `openValue` is positive in both. The node forwards
> what the API answered rather than inventing a convention. Compare with `openValue`, or
> `Math.abs()`.

> ⚠️ **Two things need switching on in Nibo**, and nothing in the API says whether they are:
> splitting a schedule across **several categories**, and issuing charges or notes at all —
> those need a **collection profile** / **service profile**, which cannot be created through
> the API.

The node guards what it can: it refuses a settlement with no bank account (the API would
answer 200 and create an unsettled schedule instead), refuses a schedule ID of the wrong kind,
refuses a second charge on a schedule that already has one, checks the schedule exists before
attaching anything to it, and validates a bank-statement batch line by line — because that
import is accepted **half way, in silence**.

---

## Usage

Add the **Nibo Empresas** node, select the credential, pick a resource and an operation. Each
record becomes one n8n item; each input item is one operation.

**Read your customers**

> Contact - Customer · **Get Many** → *Return All* on, **Filters**: `Name` · *Contains* · `ACME`

**Bill a customer, with the boleto and the note**

> Contact - Customer · **Get Many** (filtered by name)
> → Schedule - Credit · **Create**: *Stakeholder* by ID from the previous item, a **Due Date**,
> an **Accrual Date**, one line under **Categories**, **Generate Boleto** = *Immediately*

**Mark a bill as paid**

> Schedule - Debit · **Get Many** → *Filters*: `Is Paid` · *Is* · ☐
> → Transaction - Payment · **Settle**: the `scheduleId`, a bank account and the date

**Walk a portfolio of companies**

> Set **Authentication** to *API Token (Per Item)*, point **API Token** at `{{ $json.apiToken }}`
> and feed the node one item per organization.

> **Accrual Date is worth filling in.** Left empty, the API silently copies the due date —
> which files the income or expense in the month the money moves rather than the month it was
> earned. It is on the screen, not behind a menu, for that reason.

---

## Compatibility

Developed and tested against **n8n 2.18.5** (self-hosted), installed through the Community
Nodes screen. Node.js **≥ 20.15** to build.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Nibo API documentation](https://nibo.docs.apiary.io/)
- [Changelog](CHANGELOG.md) — the full release history, and what was measured against the API
  to get there

## Disclaimer

This is an independent community package and is **not** an official Nibo product. Nibo and the
Nibo logo are trademarks of their respective owner, used here solely to identify the service
the node integrates with.

## License

[MIT](LICENSE)
