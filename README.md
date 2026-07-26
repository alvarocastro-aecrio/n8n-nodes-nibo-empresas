# n8n-nodes-nibo-empresas

This is an [n8n](https://n8n.io/) community node. It lets you use the **Nibo Empresas API** in your n8n workflows.

[Nibo](https://www.nibo.com.br/) is a Brazilian financial management platform used by accounting firms and the businesses they serve. This package covers the **Empresas** API (`https://api.nibo.com.br/empresas/v1`), which reads and writes the financial records of one organization per API token.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

> **Status: early development (v0.9.x).** Use **0.4.1 or later**: in 0.4.0 the Update operation could not write at all — it failed loudly rather than silently, but it failed. The package is published thin on purpose, growing one proven slice at a time. See [Version history](#version-history) for what works today.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is:

```
n8n-nodes-nibo-empresas
```

> Note: n8n cannot load community packages whose npm scope contains a dot (the
> node-type resolver splits type names on `.`), so this package is published
> unscoped.

## Operations

Eight resources in four families. Within a family the API gives every resource an identical contract, so the node treats the family as one:

| Family | Resources, as the menu names them | What they are |
|---|---|---|
| **Contacts** | Contact - Customer · Contact - Employee · Contact - Partner · Contact - Supplier | Who you buy from, sell to, employ or share the company with |
| **Schedules** | Schedule - Credit · Schedule - Debit | Accounts receivable and accounts payable — an amount due on a date |
| **Category** | Category | The chart of accounts a schedule is filed under. Everything but **Update** and **Delete**, which this API does not have |
| **Cost Center** | Cost Center | The part of the company an amount belongs to. All five operations |

The family word is part of each name on purpose: the editor builds its **Actions** tab from the Resource menu in the order it is declared, so the names are what put a family together there instead of scattering it alphabetically between the others. It is a label and nothing else — the value the workflow stores (`customer`, `creditSchedule`, …) has never changed.

Contacts, schedules and cost centers have the same five operations each. **Category has no Update and no Delete**, because the API has no route for either — see [Categories](#categories).

| Operation | Notes |
|---|---|
| Create | Adds a record and returns it as Nibo stored it |
| Delete | Removes it and returns `{ id, deleted: true }` |
| Get | Returns one record by ID |
| Get Many | Returns the collection, paging through it when needed. A stable sort is always applied, and the key differs per collection — `$orderby=id` for a contact or a category, `$orderby=scheduleId` for a schedule, `$orderby=costCenterId` for a cost center. |
| Update | Changes the fields you list and **leaves every other field as it is** — see [Update](#update) |

Category adds two of its own, **Get Many Groups** and **Get Tree**, for the two levels `Get Many` cannot show.

Every resource that works on a single record has its own ID field (**Customer ID**, **Supplier ID**, **Credit Schedule ID**, …), so a workflow that already names one keeps working when others are added.

### Contacts

**Employee** is offered only a CPF: an employee is a person, and the API would otherwise happily store a company in the payroll.

> **The document type has one spelling.** The API takes `CNPJ`/`CPF` when you write and answers `Cnpj`/`Cpf` when you read. Since 0.4.0 the node hands out the first spelling on **every** operation, Get Many included. If a workflow of yours compares `document.type` with `'Cnpj'`, that comparison has to become `'CNPJ'`.

### Schedules

**Credit Schedule** is money coming in, **Debit Schedule** is money going out. They are two resources rather than one resource with a type field, because the type is not a setting of the operation — it is which set of books the operation is about.

Creating one asks for what the API refuses a creation without: the **Stakeholder**, the **Due Date**, the **Schedule Date** and at least one line under **Categories**. **Description** and **Is Flagged** are on the form too, since a schedule with no description is a line nobody can read later in Nibo. **Reference** lives under *Additional Fields*.

On **Update** those two are back inside *Update Fields*, and that is deliberate: there, a field on the screen is a field that gets written, so a visible empty Description would erase the stored one every time anything else changed.

#### Apportionment across cost centers

A schedule can also be split across **cost centers**, which is a different question from the category: a category says *what* an amount is, a cost center says *whose* it is. **Apportion By** decides how each line is read and **Cost Centers** holds the lines.

| Apportion By | Each line carries | The API requires |
|---|---|---|
| **Percentage** | A share of the whole | The shares to add up to **100** |
| **Value** | An amount | The amounts to add up to the **amount of the schedule** |

There is one **Share** box per line rather than one per kind, and that is the point: which of the two the number becomes is decided once, above the lines, so a line can never carry both. Sending both is the mistake this API reports worst — it answers *"A soma dos valores totais dos Centros de Custo deve ser igual ao valor do agendamento"* to somebody who typed percentages, complaining about the sum and never about the pair. When either sum error comes back, the node keeps the API's sentence and adds that underneath.

Unlike splitting across **categories**, several cost center lines need nothing turned on in Nibo.

> ⚠️ **Do not read the `value` of a cost center line — it comes back as the percentage applied twice.** Measured against a real organization on 2026-07-26: on a schedule of 1000, a 60% line answers `value` **360** instead of 600, and a line asked for as `value` 300 answers `percent` 30 with `value` **90**. It is `percent × percent × total`, every time. The **`percent` is right in every case**, including when it is worked out from the amounts you typed, so that is the field to read. The node does not repair this — the record a workflow receives is the one the API answered, as everywhere else — and its own update confirmation compares the cost centers rather than the shares because of it.

Both fields are on the creation form and inside *Update Fields*. **With no line at all, neither reaches the API** — so a schedule created or updated without an apportionment is written exactly as it was before this existed, and an existing apportionment survives an update that does not mention it.

> On an update, adding **Cost Centers** without **Apportion By** fails rather than picking one for you. The same number means 70% under one and R$ 70 under the other, and guessing would quietly turn the amounts of a value apportionment into percentages.

**The contact is searched for, not pasted.** Type part of a name and the search runs **on the server** — an organization can hold thousands of customers, so nothing is loaded up front and nothing is silently capped. The list offers only the kinds the API accepts on that side, which is a rule of Nibo's and not of this node:

| Schedule | Contacts offered |
|---|---|
| **Credit Schedule** | Customer · Partner |
| **Debit Schedule** | Supplier · Employee · Partner |

The partner is on both sides because capital is put in and drawn out. Anything else is refused by the API with *"Stakeholder is not compatible"*.

**By ID** is the other mode, and it is what a workflow chaining one node into the next has always used: paste the ID, or put an expression there.

The same search is inside *Update Fields*, so changing the contact of a schedule is choosing one too. Left out of the menu the contact is not touched; added and left empty it is refused before anything is written, since a schedule with no contact is not a schedule this API keeps.

> **Upgrading from 0.7.x?** Nothing to redo. A node saved before 0.8.0 stores the contact as a plain ID, and both the node and the editor go on reading it — measured, in a clean n8n and against the API. The only cosmetic loose end is that such a node opens with the mode selector blank; pick **By ID** when you are next in there.

**The category is picked from a list** that reads like the Nibo screen: the name, with its group underneath. The options come clustered by group, in the sequence a chart of accounts is read — revenue, costs, expenses, investing, financing — and within a group in whatever order the organization arranged them in Nibo. Only the half that fits is offered: revenue categories under a Credit Schedule, expense ones under a Debit Schedule — see [Categories](#categories) for why that matters more than tidiness.

> **Two organizations show the same category names.** Every Nibo organization starts from the same chart of accounts, so the list looks identical whichever credential is selected; what differs is the ID behind each name. The list is always read with the credential selected on the node, and **switching the credential clears this field** — that blank is how you can tell the list was read again.

> ⚠️ **The list leaves out the categories Nibo fills in itself.** An organization starts with 50 categories and owns only 22 of them; the other 28 are Nibo's — interest, fines, discounts, the withheld taxes. Three of those families cannot carry a schedule, measured one by one against the API and then looked at on Nibo's own screen: **discounts** are refused outright (*"Categoria de juros, multa ou desconto invalida"*), and the **withheld-tax** categories and **"Outras receitas"** are accepted by the API and then **show up broken in Nibo** — the schedule displays one category inside it and another, without a value, outside. Those are not offered. **Interest, fines and the "payment of withheld tax" categories are**, because each was created the same way and reads correctly on the Nibo screen — the rule is those three families, measured one at a time, not "everything automatic". If you need a category the list does not show, the field still takes an ID from an expression.

**There is no total to type.** The amount of a schedule is the sum of its category lines, and each line can carry a **Detail** of its own — what Nibo's own screen calls *Detalhamento*. Type the line amounts **positive on both kinds** — that is what the API takes, and it signs them itself.

> ⚠️ **Splitting across several categories has to be enabled in Nibo**, and it is not by default. Measured both ways: with it off, a creation with two lines is refused with *"Utilize apenas uma categoria"*; with it on, the two lines are accepted and the schedule's amount comes back as their sum. Nothing in the API says whether it is on, so the field offers as many lines as you like and the node explains that refusal when it arrives — turn the split on in Nibo, leave one line, or make one schedule per category.

> **Accrual Date is on the screen, not in a menu, and that is deliberate.** Leave it empty and the API **silently copies the due date**, which files the income or the expense in the month the money moves rather than the month it was earned or incurred. It is the single most expensive default in this API, so the node puts it next to the due date where the decision gets taken.

**Get** reads a schedule of either kind through one address: `GET /schedules/credit/{id}` is the get-by-id of this API, and `/schedules/debit/{id}` is a 404 as a route, not as a record. That address answers a debit ID with a debit record, cheerfully, under the credit resource — same fields, same shape, opposite meaning. The node checks what came back and **refuses an ID of the other kind, naming which resource it belongs to**, rather than handing a workflow a payable where it asked for a receivable.

> ⚠️ **The sign of a debit belongs to the endpoint, not to the record.** Measured against the API: the same debit, in the same minute, is `value: -500` read by **Get** and `value: +500` listed by **Get Many**. `openValue` is positive in both, and the server's own filter on the debit collection compares the **positive** number — `value eq 500` finds it, `value eq -500` finds nothing. The node passes all of it through untouched: a node that flipped a financial value would add up differently from the API it wraps, and every reconciliation built on the difference would be wrong in a way nobody could see. Compare with `openValue`, or with `Math.abs()`, when a workflow has to treat both kinds alike.

Two more behaviors of this API that a workflow will meet:

- **A deleted schedule read by ID answers HTTP 500**, carrying `Agendamento não encontrado` — a *not found* wearing a server error. The node reads the body and hands the sentence over (see [Errors](#errors)), so it is legible rather than "the service failed".
- **The listing is eventually consistent, in both directions**, and this is the one a workflow trips over. Measured: a schedule the get-by-id already answers is **absent from its collection for a second or two** after being created, and a schedule that `DELETE` answered 204 for is still **in** the collection for a few seconds after. A **Create** followed straight by a **Get Many** can miss what it just made, and a **Delete** followed straight by a **Get Many** can still show it. Chain by the ID the create hands back — **Get** is consistent immediately — rather than by re-listing.

**Due Date**, **Schedule Date** and **Accrual Date** are asked as days, with no clock on them: a schedule falls due on a date, and this API takes `YYYY-MM-DD`. A node saved before 0.7.6 still carries a full timestamp in those fields and goes on working — the day is taken from it, cut rather than converted, because `2026-08-10T00:00:00.000-03:00` is the 9th in UTC and a schedule that falls due one day early is a schedule that is overdue one day early.

### Categories

The chart of accounts. Five operations, where 0.8.x had one:

| Operation | What it reads or writes |
|---|---|
| **Get Many** | The categories of the organization, filtered and paged like any other collection |
| **Get** | One category by ID |
| **Get Many Groups** | The groups the chart of accounts is divided into — five on a new organization |
| **Get Tree** | The whole hierarchy: groups, **subgroups** and the categories inside them |
| **Create** | Adds a category under a group, and optionally inside a subgroup |

> ⚠️ **Creating a category cannot be undone.** This API has no way to edit or delete one — `PUT` and `DELETE` are 404 at every address that was tried. A category created with the wrong name stays until somebody fixes it on Nibo's own screen. The node says so above the fields rather than in a footnote.

Up to 0.8.2 this section said a category was read-only, because `POST`, `PUT`, `DELETE` and `GET /categories/{id}` all answer 404. The 404s were real; the conclusion was not. **The rest of the family lives under `/schedules/categories`**, where creating, reading one by ID, listing the groups and reading the tree all answer 200. Update and delete are genuinely absent — 404 in both paths.

**Get** reads through the list filtered by ID rather than through the route that reads one record, so that Get and Get Many hand back the very same record. That route exists and answers 200, but it drops `subgroupId` and `subgroupName` — a node that answered one shape here and another there would be inventing a difference the API does not have.

**Get Tree** is the only place a **subgroup** exists. They appear in no answer of `GET /categories` — only the `subgroupId` of the categories that sit inside them. It takes two flags, both optional and both off unless you turn them on: **Include Deleted Categories**, and **Only Service Invoice Categories**, which narrows the tree to what an NFS-e amount can be composed of.

Each category carries a `name`, a `referenceCode`, a `group` and a `type` — `in` for revenue, `out` for expense. The assisted filter offers **Name**, **Reference Code**, **Type**, **Group Name** and **Is Editable**; *Type* is a list, since `in` and `out` are not what anyone would guess for revenue and expense.

> **Why a category cannot be picked once and reused across organizations.** A category ID belongs to **one** organization. In the *API Token (Per Item)* mode — one item per company — a category chosen on the screen would be right for one of them and wrong for every other, so the list does not load there at all, and the node says so instead of showing an empty box. That is what this resource is for: look the ID up per organization, and put an expression in the schedule's Category field.

> ⚠️ **A mismatched category is reported as a problem with the amount.** Put an expense category on a receivable and the API answers HTTP 500 *"Valor do agendamento deve ser positivo"* — to a form where you typed a positive number. The category's type is what signs the line, so the total goes negative and the validation complains about the total. Picking from the list makes this unreachable; when an expression sets the ID instead, the node adds the explanation underneath the API's own sentence.

**Get Many** takes:

| Field | What it does |
|---|---|
| **Return All** | Reads the whole collection instead of stopping at a limit |
| **Limit** | How many records to return when *Return All* is off. The API caps every page at 500 records silently, so a higher limit is collected in several pages |
| **Filters** · **Combine Conditions** | The conditions to narrow the result by, joined by *And* or by *Or* — see [Filtering](#filtering) |

Under **Options**, at the end of the node, live **Filter (OData)** — for an expression written by hand — and **Fail on Incomplete Results**, which *Return All* brings with it (see *Incomplete results* below).

### Cost centers

The other classifier this API has. A category says **what** an amount is; a cost center says **which part of the company** it belongs to — a branch, a project, a team. A schedule can carry both, and [Apportionment across cost centers](#apportionment-across-cost-centers) is where that is filled in.

All five operations, and unlike a category this family is **reversible**: create, edit and delete all answer. Creating one asks for a **Description**, which the API refuses a creation without, and offers an **External Code** under *Additional Fields* — a code of your own, from whatever system the company already keeps them in.

The assisted filter offers **Description**, **External Code** and **ID**, and nothing else: those are the three that were checked against the API.

> **A cost center is read by `costCenterId`, not by `id`.** That is what this collection calls its key — `$orderby=id` is an HTTP 500 here — and it is the field to read the ID out of.

> **An organization starts with no cost center at all.** Unlike the chart of accounts, which arrives filled in, these are something somebody creates. An empty list on a schedule's apportionment field says so rather than showing an empty box.

### Filtering

The filter is narrowed **on the server**, so what does not match is never paged through in the first place. There are two ways to write it, and you never choose between them in a menu: the second one takes over the moment you use it.

**Conditions** — what the node asks for. Pick a **Field**, an **Operator** and a **Value**, add as many conditions as you need, and join them with *And* or *Or*. The node writes the OData expression for you:

| You pick | What is sent |
|---|---|
| Name · Contains · `ACME` | `contains(name,'ACME')` |
| Name · Contains (Ignoring Case) · `ACME` | `contains(tolower(name),'acme')` |
| Is Company · Is · ☑ | `isCompany eq true` |
| Updated At · On or After · `2026-07-01` | `updateDate ge 2026-07-01T00:00:00.000Z` |
| Value · Greater Than · `100.50` | `value gt 100.50` |

The operators you are offered depend on the field: text gets *Contains*, *Contains (Ignoring Case)*, *Equals*, *Not Equals*, *Starts With* and *Ends With*; a yes-or-no field gets *Is* and *Is Not*; a date gets *After*, *On or After*, *Before* and *On or Before*; an amount gets all six comparisons. A condition whose value is left empty is ignored — except an amount, which is sent even at zero, since zero is an answer.

> **The apostrophe.** A name such as `D'ALESSANDRO` typed into a raw expression closes the literal early, and the API answers HTTP 500 — *"unterminated literal"* — with nothing in the answer pointing at the quote. In an expression it has to be doubled: `contains(name,'D''ALESSANDRO')`. **Conditions does that for you**, which is the reason this mode exists.

The fields on offer are the ones the API actually filters on, checked against it one by one, and each family has its own menu:

| Family | Fields you can filter on |
|---|---|
| **Contacts** | Name · Document Number · Email · Phone · Trading Name · City · State · Is Company · Is Archived · Updated At |
| **Schedules** | Description · Reference · Stakeholder Name · Value · Due Date · Schedule Date · Accrual Date · Created At · Updated At · Is Paid · Is Overdue · Is Flagged · Has Invoice |
| **Category** | Name · Reference Code · Type · Group Name · Is Editable |
| **Cost Center** | Description · External Code · ID |

What is deliberately missing from each is missing for a measured reason. On a contact, the **document type**: `document/type eq 'Cpf'` is an HTTP 500, because that enum does not compare — filter by **Document Number** instead. On a schedule, the **type** (a constant inside either collection, so it could only ever answer "yes" or "nothing"), **`isDeleted`** (a 500 — the field is not on this view) and **`costCenterValueType`** (a 500, the same enum problem as the document type). On a category and on a cost center, **`isDeleted`** again.

> **An ID is the one value this API takes unquoted.** `costCenterId eq '2efffcd0-…'` is an HTTP 500 naming the two types it could not compare — *'Edm.Guid' and 'Edm.String'* — and the same expression without the quotes answers 200. It is the exact opposite of what every text field here requires, so **ID** is a kind of its own: the node writes the literal bare, and refuses a value that is not an ID before sending it, because a condition the server rejects is a scan that returns nothing and reads as "no records".

Worth noticing across those two lines: a category's **Type** *is* offered, while a contact's document type is not, even though both are enums of text. One compares and the other answers 500. Neither was assumed — each was asked.

> **Value is an amount, and amounts are not quoted.** `value gt '100'` is an HTTP 500 naming the two types it could not compare — *'Edm.Decimal' and 'Edm.String'*. The node writes the literal bare and keeps your cents. An amount arriving through an expression as `100,50` is read as the amount it means; `1.234,56` is refused instead of guessed at, because read one way it is a thousand and read the other it is one and a bit, and nothing in the value says which.

**Filter (OData)** — under **Options**, at the end of the node, for everything the conditions cannot say: a nested group such as `(contains(name,'ACME') or contains(name,'LTDA')) and isCompany eq true`. The expression goes to the API as you wrote it, so quoting and escaping are yours to get right: accented text needs no treatment (`contains(name,'SERVIÇOS')`), an apostrophe does.

**Writing one in is the switch.** The moment that box carries an expression, the conditions leave the screen — and leave the request with them, so a field you cannot see is never filtering underneath one you can. Empty the box or remove the option and the conditions are back, exactly as you left them.

> **Upgrading from 0.4.x or 0.5.x?** Nothing to redo. A node saved with a **Filter (OData)** goes on filtering by that expression exactly as it did, even though the box now lives under *Options*.

### Create

What the API refuses a creation without is asked for up front; everything else lives under **Additional Fields**, and only the fields you add are sent. The record comes back as Nibo stored it, with whatever the API fills in on its own already there.

**For a contact** that is **Name**, **Document Number** and **Document Type**, and two details of this API are worth knowing before you fill the form in:

- **Document Number takes digits only** — no dots, slashes or dashes.
- **Email is one string holding every address, separated by commas** (`billing@example.com,accounts@example.com`). This API keeps a contact's e-mails in a single field, not in a list.

**For a schedule** it is the **Stakeholder**, the **Due Date**, the **Schedule Date** and the **Categories** lines — plus **Accrual Date**, which is optional and still on the screen. See [Schedules](#schedules) for why.

**For a cost center** it is the **Description**, which the API refuses a creation without.

**For a category** it is the **Category Group**, the **Name** and the **Type**, with **Subgroup** under *Additional Fields*. This is the one creation of this node that **cannot be undone** — see [Categories](#categories).

### Update

The API's `PUT` takes the **whole** record: every field left out of the body is **zeroed**, silently and with HTTP 200. Worse, a payload it cannot read is answered with `{"Messages":[""]}` — HTTP 200, no error, and nothing written. It is the kind of failure nobody notices until someone asks why a contact lost its address.

So this operation never sends a bare `PUT`. For each item it:

1. reads the record as it is stored;
2. merges the fields you added onto it;
3. writes the complete record back;
4. **reads it again and checks that the fields you changed really changed.**

Three calls where one would do, on purpose. If the API answers with `Messages`, or if the confirmation finds a field that did not take, the item fails and says which field — it never reports a write that did not happen as a success.

On a schedule the two reads go to the get-by-id every schedule shares and the `PUT` goes to the collection the record actually belongs to, because those are two different addresses in this API. The confirmation also knows three things the API does to a value on its way through, none of which is a refusal: a date asked for as the 20th comes back as a moment, a debit line asked for as 300 comes back as −300, and **every `PUT` recreates the category lines with new line IDs**. What a workflow receives is untouched by any of that — it is the record as the API answered it.

What that gives you:

| | |
|---|---|
| A field you **do not add** | Is not touched. The record keeps whatever is in Nibo |
| A **text** field you add and leave empty | Is written empty. That is how a stored value is erased on purpose |
| A **date** or a **category line** you add and leave empty | Is ignored. There is no empty date to write, and an unfinished row is not a change |
| **Update Fields left empty** | The item fails instead of rewriting the record with itself |

The address of a contact is offered field by field (**Address City**, **Address Line 1**, …) rather than as one block, for the same reason: a block would submit every field it contains the moment you opened it, and this API would write exactly that.

### Delete

Takes the ID and removes it. The API answers 204 with no body, so the node returns `{ id, deleted: true }` as the confirmation. It is an ordinary operation with no extra guard rail — whoever builds the workflow answers for what it does.

### Interval between requests

Under **Options**, at the end of the node, **Interval Between Requests** is how long the node waits between two calls to the API, in milliseconds. It applies both between input items and between the pages of a single scan — never before the first call.

Leave it out and the node waits **1000 ms**. That default is deliberately conservative: one node looping over a portfolio of organizations fires hundreds of calls back to back, and that has to be handled by default rather than remembered by whoever builds the workflow. Add the option and set it to `0` to send the calls with no gap at all.

### Incomplete results

Paging by `$skip` cannot see records written while the scan runs: they land at an arbitrary position in the ordering and can fall behind the point already read, disappearing with no error at all. The node watches the record count the server reports at the start and at the end of the scan, and checks that at least as many records arrived as it announced.

When something does not add up, the scan **fails**, saying what it saw. That is the default and it is deliberate: a list that quietly lost two records is exactly the sort of thing a workflow deletes by, and there is no way to tell from the data that anything is missing.

For a read where that does not matter — a report, a spreadsheet, a lookup — add **Fail on Incomplete Results** under **Options** and turn it off. The records are then returned anyway (they are valid, just possibly incomplete) and the last item carries a `_niboPaginationWarning` field describing what happened; the same text is logged as a warning.

One honest limit: the check reads what the record count denounces, not every possible gap. If one customer is created and another deleted mid-scan, the count matches at both ends and the swap goes unnoticed. It is a good net, not a guarantee — for a guarantee, scan when nobody is writing.

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

Add the **Nibo Empresas** node to a workflow, select the credential, pick a resource — the menu reads *Category*, then the four *Contact - …*, then *Schedule - Credit* and *Schedule - Debit* — and run **Get Many**. Each record becomes one n8n item.

Writing works the same way: **Create** takes what that resource cannot be created without, **Update** takes an ID and only the fields you want changed, and **Delete** takes an ID. Each input item is one operation, and each answers with the record as Nibo has it.

A common pair: read the contact with **Customer · Get Many**, filtered by name, then feed its `id` into **Credit Schedule · Create** — switch **Stakeholder** to *By ID* and put the expression there, which is what that mode is for. Pick the category from the list on that same form — or, when the workflow walks several organizations, read it per organization with **Category · Get Many** and set the field by expression.

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
| 0.4.3 | **Fail on Incomplete Results** moves into **Options** and is now **on by default**: a scan that may have missed records fails instead of handing back a list that looks whole. Add the option and turn it off for reads where that does not matter. A node saved while it was a field of its own keeps the choice its author made |
| 0.4.4 | **Employee, Partner and Supplier** join Customer, with the same five operations each — the API gives the four an identical contract, and the handler has been parameterized by type since 0.1.0, so this cost no new logic. Each resource carries its own ID field, and Employee is offered only a CPF |
| 0.5.0 | **The assisted filter**: Get Many builds the OData expression from conditions — field, operator and value, joined by *And* or *Or* — instead of taking one written by hand. It exists for a defect, not for comfort: a name carrying an apostrophe (`D'ALESSANDRO`) made an invalid expression, and the API answered HTTP 500 with nothing pointing at the quote. Each type now gets the literal the API demands, quoted or bare, and the menu of fields holds only what the API was checked to filter on — the document type is not one of them. **Filter (OData)** is unchanged, undeprecated and still on screen, so a node saved before this version keeps filtering exactly as it did, with nothing to redo |
| 0.5.1 | **Filter (OData)** moves into **Options**, at the end of the node, where the other operational adjustments already are: the body asks only what the operation needs, and writing OData by hand is the exception rather than the way in |
| 0.5.2 | The **Filter Type** selector is gone, and writing an expression into **Filter (OData)** is the switch itself: fill it in and the conditions leave the screen — and leave the request with them, so nothing filters from behind a field you cannot see. Empty it and the conditions are back. 0.5.1 had put the box behind that selector, which meant it was not on the *Add option* list until you had already chosen a mode — a switch you had to find before you could find the thing it switched |
| 0.6.0 | **Credit Schedule and Debit Schedule** — accounts receivable and payable — with the same five operations each. The second family, and the first one the core built up to 0.5.x paid for: paging, the safe update cycle, the assisted filter and the readable errors were already there. What is genuinely new is what this family does differently — the paging key is `scheduleId` (`$orderby=id` is a 500 here), a schedule of either kind is read through **one** get-by-id, so **Get refuses an ID of the other kind instead of quietly handing back the wrong record**, and the filter builder learned what an amount is. **Accrual Date** is on the screen rather than in a menu, because leaving it out makes the API copy the due date silently. ⚠️ **The sign of a debit belongs to the endpoint**: the same record reads `-500` through Get and `+500` through Get Many, and the node passes both through untouched |
| 0.7.0 | **Category**, and the list behind the schedule's category field. A hole 0.6.0 left: Create asked for a category ID, a GUID, and the node gave no way to learn one — which forced an HTTP Request node to list them, the thing this package removes. The field now offers the categories that **fit the kind of schedule**, by code and name, and that is not tidiness: an expense category on a receivable is refused with *"Valor do agendamento deve ser positivo"*, blaming an amount you typed positive, because the category's type is what signs the line. Where an expression sets the ID instead of the list, the node adds that explanation to the API's own words. **Category · Get Many** is the other half, and the one that matters in a portfolio: a category ID belongs to one organization, so it has to be looked up per organization rather than picked once. The Category ID parameter keeps its name, its place and its stored shape, so nothing saved under 0.6.0 changes |
| 0.7.1 | Three things found by using the 0.7.0 form. **Description** and **Is Flagged** move onto the creation form, out of *Additional Fields* — on Update they stay in the menu, because there a field on the screen is a field that gets written. And the fix that matters: **the category list did not reload when the resource changed**, so switching between Credit Schedule and Debit Schedule kept whichever half of the chart of accounts had loaded first. The editor refetches a list on three things only — the refresh button, a change of credential, and a change in `loadOptionsDependsOn` — and that last one named nothing |
| 0.7.2 | The category list says what it is. It is read with the credential selected on the node and filtered to the half that fits the schedule — neither fact is visible, and **every Nibo organization starts from the same chart of accounts**, so the same names appear whichever organization is selected and only the IDs behind them differ. That cost an afternoon of chasing a bug that was not there. An empty answer now explains itself instead of showing an empty box, and the field says that switching the credential clears it — which is how you can tell the list was read again |
| 0.7.3 | The category list reads like the Nibo screen: **the name, with its group underneath, and no reference code**. That code is real — the API sends it on every category — but it belongs to Nibo's standard chart of accounts and appears nowhere in Nibo's own interface, so unfamiliar numbers in front of familiar names only made a working list look like another company's. The options now come clustered by group, in the sequence a chart of accounts is read, and within each group in whatever order the organization arranged them in Nibo (`order`, sorted by the server) |
| 0.7.6 | **Due Date, Schedule Date and Accrual Date lose the clock.** They are days — the API takes `YYYY-MM-DD` and none of them has an hour — so offering a time was offering a decision that does not exist, and one with a wrong answer: the editor hands over the moment with its offset, and midnight in Brasília is the day before in UTC. The picker now stores the plain day. A node saved before this keeps working: the day is still cut out of whatever it carries |
| 0.7.7 | Each **category line can carry its own Description**, measured against the API before being offered — the project's reference had that field flagged as suspicious after a payload that once crashed the server, which turned out to be the encoding rather than the field. **Description** and **Is Flagged** move above Categories, so the form asks what the schedule is before how its amount is split. And a finding that came with it: **splitting across several categories has to be enabled in Nibo** — with it off a second line is refused with *"Utilize apenas uma categoria"*, and the node now says so and what to do about it |
| 0.7.8 | The per-line field is labelled **Detail**, following what Nibo's own screen calls *Detalhamento*. Label only: the parameter is still `description`, which is what the API calls the field and what a node saved under 0.7.7 already carries |
| 0.8.0 | **The contact of a schedule is chosen by searching.** What 0.7.0 did for the category, now for the stakeholder — but as a search rather than a list, because an organization can hold thousands of customers and loading them would be 28 calls to open a field. What is typed goes to the server. The list offers only the kinds the API accepts on each side: customer or partner on a credit schedule, supplier, employee or partner on a debit one, measured as a full matrix against the API. **By ID** stays, so an expression still gets in, and a node saved under 0.7.x keeps working untouched. The same search is offered inside *Update Fields*, so changing a contact is choosing one as well |
| 0.8.1 | **The category list stops offering what a schedule cannot be filed under.** A schedule created with *"Outras receitas"* is accepted by the API and then shows up broken on Nibo's own screen — one category inside the entry, another outside it with no value. Measured family by family against the API: withheld-tax categories do the same, discounts are refused by the API itself, and interest reads correctly and stays on the list. The three that cannot work are filtered out on the server, in the call the field already made, and the node now explains the API's *"Categoria de juros, multa ou desconto invalida"* when an ID from an expression runs into it |
| 0.8.2 | **The Actions tab reads by family.** The editor builds that tab from the Resource menu in the order it is declared, one heading per resource and no sorting of its own — so seven bare names in alphabetical order put *Credit Schedule* between *Category* and *Customer*, and the tab looked like a pile of unrelated things. Each resource now carries its family word (*Contact - Customer*, *Schedule - Credit*), which groups the menu **and** stays alphabetical, so nothing had to be forced. Labels only: the values a workflow stores are untouched, and the ID fields are still *Customer ID* and *Credit Schedule ID*. Also fixed, from the same look at the screen: the node had been offering *"Create a employee"* since 0.4.0 |
| 0.9.0 | **The family of classifiers, closed.** Category gains **Get**, **Get Many Groups**, **Get Tree** and **Create** — four operations this project had written off, because `POST`, `PUT`, `DELETE` and `GET /categories/{id}` all answer 404 and that was read as "a category is read-only". The 404s were real; the conclusion was not. **The writing family lives under `/schedules/categories`**, and everything but update and delete answers 200 there. Those two are genuinely absent in both paths, which makes **creating a category an act with no way back** — the node says so above the button rather than in a footnote. The new **Cost Center** resource is the other classifier of this API and has all five operations, being reversible; its key is `costCenterId`, not `id`. And the finding that pays for the version on its own: **a schedule accepts an apportionment across cost centers** and the node offered no way to say it. **Apportion By** and **Cost Centers** are on the creation form and inside *Update Fields*; with no line, neither reaches the API, so every schedule written by 0.8.2 is written identically and an existing apportionment survives an update that does not mention it |
| 1.0.0 *(planned)* | Production acceptance against real workflows |

## Disclaimer

This is an independent community package and is **not** an official Nibo product. Nibo and the Nibo logo are trademarks of their respective owner, used here solely to identify the service the node integrates with.

## License

[MIT](LICENSE)
