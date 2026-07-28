# n8n-nodes-nibo-empresas

This is an [n8n](https://n8n.io/) community node. It lets you use the **Nibo Empresas API** in your n8n workflows.

[Nibo](https://www.nibo.com.br/) is a Brazilian financial management platform used by accounting firms and the businesses they serve. This package covers the **Empresas** API (`https://api.nibo.com.br/empresas/v1`), which reads and writes the financial records of one organization per API token.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

> **Status: early development (v0.11.x).** Use **0.4.1 or later**: in 0.4.0 the Update operation could not write at all — it failed loudly rather than silently, but it failed. The package is published thin on purpose, growing one proven slice at a time. See [Version history](#version-history) for what works today.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is:

```
n8n-nodes-nibo-empresas
```

> Note: n8n cannot load community packages whose npm scope contains a dot (the
> node-type resolver splits type names on `.`), so this package is published
> unscoped.

## Operations

Sixteen resources in nine families. Within a family the API gives every resource an identical contract, so the node treats the family as one:

| Family | Resources, as the menu names them | What they are |
|---|---|---|
| **Contacts** | Contact - Customer · Contact - Employee · Contact - Partner · Contact - Supplier | Who you buy from, sell to, employ or share the company with |
| **Schedules** | Schedule - Credit · Schedule - Debit · Schedule - File · Schedule - Annotation | Accounts receivable and accounts payable — an amount **due** on a date — plus the **documents** and the **notes** that hang off one, see [Files and annotations](#files-and-annotations) |
| **Transactions** | Transaction - Payment · Transaction - Receipt | The same entries once the money has **actually moved** — see [Settling a schedule](#settling-a-schedule) |
| **Category** | Category | The chart of accounts a schedule is filed under. Everything but **Update** and **Delete**, which this API does not have |
| **Cost Center** | Cost Center | The part of the company an amount belongs to. All five operations |
| **Bank Account** | Bank Account | The accounts, their **balances** and the **import of a bank statement** — see [Bank accounts](#bank-accounts) |
| **Bank Transfer** | Bank Transfer | Money moved **between two accounts** of the organization — see [Bank transfers](#bank-transfers) |
| **File** | File | A stored document, on its own: **upload**, **upload and attach**, **download** — see [Files and annotations](#files-and-annotations) |
| **Collection** | Collection | The **charges** — boleto, with the Pix QR printed on it — issued from a receivable, see [Collections](#collections) |

The family word is part of each name on purpose: the editor builds its **Actions** tab from the Resource menu in the order it is declared, so the names are what put a family together there instead of scattering it alphabetically between the others. It is a label and nothing else — the value the workflow stores (`customer`, `creditSchedule`, …) has never changed.

Contacts, schedules and cost centers have the same five operations each. **Category has no Update and no Delete** and **Transactions have no Update**, because the API has no route for any of them — see [Categories](#categories) and [Transactions](#transactions).

| Operation | Notes |
|---|---|
| Create | Adds a record and returns it as Nibo stored it |
| Delete | Removes it and returns `{ id, deleted: true }` |
| Get | Returns one record by ID |
| Get Many | Returns the collection, paging through it when needed. A stable sort is always applied, and the key differs per collection — `$orderby=id` for a contact, a category, an account or a transfer, `$orderby=scheduleId` for a schedule, `$orderby=costCenterId` for a cost center, `$orderby=entryId` for a settled entry, `$orderby=accountId` for a balance. |
| Update | Changes the fields you list and **leaves every other field as it is** — see [Update](#update) |

Category adds two of its own, **Get Many Groups** and **Get Tree**, for the two levels `Get Many` cannot show. Transactions add **Settle**, which is what marks a schedule that already exists as paid or received. Bank Account adds **Get Balances** and **Import Bank Statement**. File has **Upload**, **Upload and Attach** and **Download**; Schedule - File has **Get Many**, **Attach** and **Delete**; Schedule - Annotation has **Create** and nothing else, because nothing else exists. Collection has **Get Many**, **Get**, **Create**, **Cancel** and **Get Many Profiles**.

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

**Apportion By is drawn under the Cost Centers block and is on the screen from the start.** It waited for a line between 0.9.1 and 0.11.0, and that had to be undone: n8n decides what a node saves before it decides what it draws, and the first of those two readings cannot see inside a collection — so the field was drawn with its own value thrown away, and the editor wrote `The value "" is not supported!` under an empty box. There is one **Share** box per line rather than one per kind, and that is the point: which of the two the number becomes is decided once, for the whole block, so a line can never carry both. It is a field of the block and not of each row because the API keeps a single value type per schedule, not one per line. Sending both is the mistake this API reports worst — it answers *"A soma dos valores totais dos Centros de Custo deve ser igual ao valor do agendamento"* to somebody who typed percentages, complaining about the sum and never about the pair. When either sum error comes back, the node keeps the API's sentence and adds that underneath.

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

### Transactions

A **payment** is an expense that was paid and a **receipt** a revenue that was received — the same entries as a schedule, once the money has actually moved. They are what closes the loop the node left open until 0.9.x: it could create a schedule and had no way to mark it settled.

| Operation | What it does |
|---|---|
| **Settle** | Marks a **schedule that already exists** as paid or received |
| **Create** | Records an amount already moved, creating the schedule and settling it in one call |
| **Get Many** · **Get** | Reads the settled entries. `Get` goes through the list filtered by ID, because this API has no route that reads one |
| **Delete** | Removes the entry, which puts the schedule it settled **back to unpaid** |

> ⚠️ **A settlement without a bank account is not refused — it silently becomes something else.** `POST /payments` with no `accountId` answers **HTTP 200** and creates an **unsettled schedule** instead of a payment. The node refuses to send that: an operation called *Create Payment* that sometimes creates no payment is worse than none. If an open schedule is what you want, that is what the Schedule resource is for.

> ⚠️ **The wrong resource would file the money on the wrong side of the cash book.** This API accepts a **debit** schedule through the receipts route and answers 200. Settle reads the schedule first and refuses the mismatch, because the API will not.

Three more things worth knowing before you fill the form in:

- **`Accrual Date` left empty makes the API copy the date the money moved** — which files the expense in the wrong month. Same trap as the schedule's, so the field is on the screen and not in a menu.
- **The date cannot fall before the account's opening balance.** The API answers *"A data da baixa é inferior a data do saldo inicial da conta"*; the date it is comparing with belongs to the **account** and is on it as `dateOfOpenBalance`. The node adds that.
- **A part settlement is normal**, not an error: less than the schedule is recorded and the schedule stays open.

#### Settling a schedule

The two ends of this family answer **different IDs**, which is the one thing most likely to trip a workflow up:

| | Answers | Read back by |
|---|---|---|
| **Settle** | the **entry** ID | `entryId` |
| **Create** | the **schedule** ID | `scheduleId` |

The node reads each one back by its own key, and both tolerate a delay: these collections are **eventually consistent** — a settled entry took about three seconds to appear, and `count` and `items` were measured disagreeing during that window. If the entry still cannot be read, the node says the write **went through** and tells you not to send it again. Settling twice records the money twice.

### Bank accounts

| Operation | What it does |
|---|---|
| **Create** | Opens a new account — **an act this API gives no way back from**, see below |
| **Get Many** | The accounts of the organization, with everything the API records about each — including `dateOfOpenBalance`, the day nothing can be filed before |
| **Get Balances** | What each account holds. A **collection of its own** in this API, not a field of the accounts |
| **Import Bank Statement** | Sends the lines of a statement to the **reconciliation queue** of an account |
| **Update** | Changes the fields you list and leaves every other one as it is — **including the balance lock**, see below |

> **An organization can have no account at all**, and then nothing can be settled. The list on the settlement form says so rather than showing an empty box, and it leaves **archived** accounts out — archiving is somebody saying no to that account.

#### Creating an account

> ⚠️ **What Create makes is permanent.** `DELETE /accounts/{id}` is a 404, and `isArchived` on a `PUT` is answered 204 and **ignored** — there is no way to delete *or archive* an account through this API. Tucking one away is Nibo's screen only. The form says so before the button.

Create asks for a **Name**, and optionally an **Opening Balance** and the **Opening Balance Date** — the day the balance was struck, which is also the day nothing can be filed before. Two measured details:

- **The API stores the opening date one day early on creation** (`2026-07-01` came back as `2026-06-30`), while the same date on an update is stored exactly. The node reads the account back and repairs the date with a corrective update, so **the day you pick is the day that stays**.
- **`bankNumber` is not on the form**, and that is deliberate: the API ignores it in silence — 341 went in, 0 came out. A field the screen collects and the server throws away is a form that lies.

#### Updating an account, and the balance lock

Update is a merge: the node reads the record, lays your fields on top and sends **the whole of it** back. That shape is not a style choice here — it is the defense:

- **A `PUT` whose body omits `balanceLockDate` CLEARS the lock**, with a 204 and not a word. Because the node always sends the full record, the lock **survives any update that does not mention it**.
- A partial `PUT` (just a name) is a raw SQL 500 on this route — so the fragment was never an option anyway.

**`Balance Lock Date` is the field closing automations exist for**: nothing on or before it can be written or edited, and moving it forward is how a month is closed. Its rules, all measured:

| Direction | The API | The node |
|---|---|---|
| **Forward** (closing a month) | Accepts silently | Sends it — this is the normal gesture |
| **Backward** (unlocking a closed period) | Accepts silently — no guard | **Refuses**, naming both dates, unless the **Allow Moving the Lock Back** option is on: unlocking a period is a decision for a person |
| **Backward past the account's opening date** | Refuses — *"A data de bloqueio deve ser maior que a data de início de controle da conta"* — without saying which date that is | Passes the sentence through and **adds the date**: it is the account's own `dateOfOpenBalance`, which the node just read |

**`isArchived` is not among the update fields**, for the same reason `bankNumber` is not on Create: the API accepts it with a 204 and ignores it. Offering it would be selling what does not exist — and the node's own read-back confirmation is what would catch that silent 204.

#### Balances

`Get Balances` is a second collection about the same accounts, and it agrees with the first about almost nothing:

- **The key is `accountId`**, where the accounts page by `id`. On this view `id` and `name` are both an HTTP 500 — neither property exists on it — which is why the ID is `accountId` and the name is `accountName`.
- **`isArchived` is a 500 here** and a filter over there, so there is no way to ask the server for the balances of the accounts still in use. Read them and match them up.
- **`balance` and `bankBalance` are different numbers**: the first is what Nibo has recorded, the second what the bank itself reported. On an account with no banking automation the first moves and the second stays at `0.00`.
- **It lags.** A transfer that had already been recorded took **under five seconds** to show in the balances, in both directions. Read a balance immediately after writing and you will read the old one.

That is why this is an operation of its own rather than a switch on Get Many: one screen for both would be a field menu where the chosen field turns into a server error when a toggle is flipped.

#### Importing a bank statement

**One input item is one line of the statement**, and the node sends them as a single batch — that is the shape the API takes. `Description`, `Value` and `Date` are read per item; **Bank Account** and **Batch Name** are read from the first, because a batch has one of each.

The lines go to the **reconciliation queue** — Nibo's *área de transferência* — and **not to the ledger**: no entry appears under Transaction - Payment or Transaction - Receipt, and no balance changes. That is what the operation is for; it is not a way to record entries.

> ⚠️ **This API accepts a batch half way, in silence.** `POST /accounts/{id}/bankstatement` answers **HTTP 204 with an empty body** whatever happens. A line dated before the account was opened, or dated in a shape the API cannot read, is **dropped without a word** while the rest goes in — a batch of two moved the pending counter by one. And there is nothing to check afterwards: every route that would read the queue back is a 404.

So every defense this operation has happens **before** the request, and each refusal names the item it is about — in a batch of two hundred lines, "an invalid date" is not information:

| Refused | Why |
|---|---|
| A line dated before the account's `dateOfOpenBalance` | The API would take it and file nothing. The message says which item, and **what that opening date is** — which is the one thing the API leaves out when it complains about this elsewhere |
| A date that is not year-month-day | `29/07/2026` is answered 204 and filed nowhere. `07/12/2026` is refused with it: nothing in the value says whether it is 7 December or 12 July, and guessing would file money in the wrong month |
| An amount that is not a number | `1.234,56` is refused rather than guessed at. `-10,50` is read as the amount it means |
| Items naming different accounts | One batch goes to one account |
| The **per-item token** mode | One batch belongs to one organization, the same rule the account list has followed since 0.10.0 |
| An empty batch | The API answers 204 and does nothing, which would look exactly like an import that worked |

The answer carries what was sent, the line count and a notice — **never a bare `success: true`**, because 204 is an acknowledgement and not a confirmation. The only sign that anything arrived is `pendingReconciliationCount` on **Get Balances**, and it counts transactions rather than batches. It has been seen moving at once and it has been seen taking **more than 150 seconds**; nothing in an n8n execution should wait on it.

### Bank transfers

Money moved from one account of the organization to another. **A resource of its own, because the API made it one**: a transfer is a record with three top-level fields — `id`, `originEntry`, `destinyEntry` — and two whole entries nested inside it.

| Operation | What it does |
|---|---|
| **Create** | Moves the money, then reads the transfer back to hand you the record — including the `id` that Delete needs |
| **Get Many** | The transfers of the organization |
| **Delete** | Undoes it: the transfer leaves the collection, both entries go with it and both balances return to what they were |

One creation makes **two entries** — a payment on the origin account and a receipt on the destination, both flagged `isTransfer`. They show up under Transaction - Payment and Transaction - Receipt like any other, which is worth knowing before a workflow adds them up.

> **The POST answers 204 with no body: no ID, nothing.** Without a read-back, Create would hand back the fields you typed, which is exactly what a call that wrote nothing would hand back. So the node reads the collection before the write and again after it, and the record that was not there before is the one you just made. It is cheap here and nowhere else — this is the one collection of this API that answers **immediately**.

> ⚠️ **Three of this route's errors name the wrong cause.** A missing origin account, a missing destination account and an account that does not exist all answer *"Não é possivel transferir valores de contas virtuais"*. Nothing is virtual about any of them. The node checks both accounts, the amount and the two sides **before sending**, and says which field is actually empty.

Two more things measured against the API:

- **`Description` is optional**, and left empty it is not sent at all — Nibo then writes its own, *"Transferência de {origin} para {destination}"*. Either way the text comes back in **`identifier`**: there is no `description` field on a transfer anywhere.
- **A date before the account was opened is accepted here**, unlike a settlement, where the same thing is an HTTP 500. The node does not refuse it.

**The filters go by the nested path**, because that is where the fields are — `originEntry/date`, `originEntry/value`, `originEntry/identifier`, `originEntry/account/id`, `destinyEntry/account/id`. The plain top-level names somebody would try first (`date`, `value`, `createDate`, `transferId`) are all a 500, so they are not on the menu.

> ⚠️ **The same entry has two signs.** A transfer of 123.45 lists `originEntry.value` as **−123.45** and `destinyEntry.value` as **+123.45** — while `/payments`, showing that very same origin entry, lists it as **+123.45**. The node forwards whatever the route answered: inventing a rule of its own would be a fourth convention to keep track of.

### Files and annotations

The documents that hang off a schedule, and the notes written on one. Three resources, seven operations, and almost every line of them is a defence against something this API does quietly.

| Resource | Operation | What it does |
|---|---|---|
| **File** | **Upload** | Stores a document from the item's binary field and returns its `fileId`, attached to nothing yet |
| **File** | **Upload and Attach** | The same, and puts it on a schedule in one operation |
| **File** | **Download** | Fetches a stored document back into the item's binary field |
| **Schedule - File** | **Get Many** | The documents on one schedule, with `name`, `size`, both dates and the `url` |
| **Schedule - File** | **Attach** | Puts a document that is already stored onto a schedule |
| **Schedule - File** | **Delete** | Deletes the document itself — see the warning below |
| **Schedule - Annotation** | **Create** | Writes a note on a schedule |

The file always comes from the **binary field of the item**, never from disk, and Download puts it back the same way. That is a rule of the n8n verification programme and it is also the only thing that makes the operations work inside a workflow.

> 🔴 **The download link is public.** Every attachment carries a `url`, and that address answers a redirect to signed storage and hands the document over **with no token, no cookie and no header of any kind** — measured with a bare `curl`. Whoever holds a `fileId` holds the document. This is a fact about the service, not something this node can fix; it is said here, and on the screen, because hiding a public link does not make it private.

> ⚠️ **A document belongs to one schedule at a time.** `attach` does not add a row to a list — it sets the single reference a file carries. Attaching a file that is already on another schedule **moves** it, and the first schedule silently loses it. To have the same document on two schedules, upload it twice.

> 🔴 **Attaching to a schedule that does not exist is answered with HTTP 204 and no complaint** — this API checks the file and never checks the schedule. Worse, it writes that invented ID onto the file, so reading the invented schedule back hands the file over as though all were well. The node therefore **asks Nibo for the schedule before writing anything**, on Attach, on Upload and Attach and on Create Annotation alike, and then reads the files back to confirm the document really landed.

> ⚠️ **Delete is not a detach.** `DELETE /schedules/credit/{scheduleId}/files/{fileId}` is in no documentation, and the schedule in its path is ignored — a GUID of zeros deletes just as well. What goes is **the document**: it can never be attached anywhere again. And the stored object is not removed, so a download link handed out beforehand keeps serving the file afterwards.

> 🔴 **An annotation can be written and never read.** The API answers Create with an `annotationId`, and that ID opens no door: reading, editing and deleting it are 404 on every path, and the schedule record carries no annotation on it. It does not deduplicate either — the same text twice is two notes, and neither can be removed. Whether an item is processed twice is entirely up to the workflow around the node.

**The upload ceiling is 10 MB of request**, not of file: the multipart envelope counts inside it. The node refuses anything from **10,484,736 bytes** upwards before any call is made, because the API's own answer at that size is HTTP 500 *"O Nibo se comportou de forma inesperada."* — a sentence that names neither the size nor the file nor a limit. Above that the same endpoint fails in two more shapes, neither of them JSON, and the node names the ceiling for all three.

**What this API has no route for**, and therefore what the node does not offer: listing the files of an organization (`GET /files` and `GET /files/{id}` are both 404, so a document uploaded and never attached cannot be found again), attaching anything to a payment or a receipt, and reading, editing or deleting an annotation.

### Collections

The charges Nibo issues from a receivable — a boleto, with the Pix QR code printed on it. You do not create a charge from nothing: you charge a schedule that already exists, and the amount and the description come from it.

| Operation | What it does |
|---|---|
| **Get Many** | The charges of the organization, with the assisted filter |
| **Get** | One charge by ID — read through the list, because this API has no get-by-ID route for a charge |
| **Create** | Issues a charge from a receivable |
| **Cancel** | Cancels it, which leaves the record in place marked Cancelled |
| **Get Many Profiles** | The collection profiles — what a charge is issued through, and the only way to know whether an organization can issue one at all |

> 🔴 **Delivery is the field to read twice.** *Send It* makes Nibo **e-mail the boleto to the payer** and start its automatic reminder sequence — an action that reaches your customer's customer and does not come back. *Hold for Review* keeps the charge on the Nibo screen and sends nothing. The node defaults to **Hold for Review**, and it cannot tell you afterwards which happened: both choices produce an identical record, so nothing downstream can distinguish them.

> ⚠️ **One charge per schedule.** The API refuses the second with *"Não é possível criar mais de uma cobrança por agendamento"*. The node checks first and names the charge that is in the way, so you can decide whether to cancel it — unless the one already there is cancelled, in which case it sends and lets the API answer, because that case was never measured.

> ⚠️ **Cancelling does not delete.** The record stays, with its status set to Cancelled, and the public link keeps answering. There is a second way it happens that nobody expects: **deleting the schedule cancels the charge hanging off it.** And a charge can only be cancelled once.

> 🔴 **The url of a charge is public.** Measured with a bare request: it answers `text/html` with no token, no cookie and no header of any kind. Whoever holds the link opens the payment page. Treat it as the charge itself.

**Filtering by status works, through `status/code`** — and the codes are worth writing down, because nothing on the wire spells them: **1** pending activation (how every charge is born), **3** paid, **-1** cancelled. The delivery side has its own: **0** not delivered, **2** viewed. Those are the codes seen in the records measured; this API has no route that lists the whole set, so for a state that is not on the list, write the condition in **Filter (OData)**.

**Two things in this family are spelled oddly, and both are the API's.** The routes carry a `/public/` prefix — the only ones that do, and nothing about them is unauthenticated. And the date field is `lasStatusChangeDate`, missing the `t` of "last": writing it correctly answers HTTP 500. The node shows the right label and sends the wrong spelling, which is the only way round it.

**A profile cannot be created through this API.** It ties a contracted bank provider to the organization and is set up in Nibo. An organization without one cannot issue charges, and the node says exactly that instead of showing an empty box.

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
| **Transactions** | Date · Accrual Date · Description · Stakeholder Name · Value · Is Flagged · ID · Schedule ID |
| **Bank Account** · Get Many | Name · ID · Is Archived · Is Virtual |
| **Bank Account** · Get Balances | Account Name · Account ID · Balance · Bank Balance · Is Reconcilable · Is Virtual |
| **Bank Transfer** | Date · Description · Destination Account ID · ID · Origin Account ID · Origin Value |

The two Bank Account menus are two because the API has two collections: **Is Archived** is a filter on the accounts and an HTTP 500 on the balances, and a name is `name` on one and `accountName` on the other. On a transfer every field but the ID is a **nested path**, and it can be three levels deep (`destinyEntry/account/id`), because the record has only three fields of its own.

What is deliberately missing from each is missing for a measured reason. On a contact, the **document type**: `document/type eq 'Cpf'` is an HTTP 500, because that enum does not compare — filter by **Document Number** instead. On a schedule, the **type** (a constant inside either collection, so it could only ever answer "yes" or "nothing"), **`isDeleted`** (a 500 — the field is not on this view) and **`costCenterValueType`** (a 500, the same enum problem as the document type). On a category and on a cost center, **`isDeleted`** again. On a settled entry, **`isDeleted`**, **`dueDate`** and **`isPaid`** — none is on that view — and **`isFlag`**, which is a trap of its own: that is the name the **write** side uses for the flag, while the read side calls it **`isFlagged`**. Both names are true, one on each side.

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
| More than **14 calls in one second** (HTTP 429, answered as plain text) | Names the limit and points at *Interval Between Requests*, whose 1000 ms default stays well clear of it | **Yes** — waiting is exactly what fixes it |

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
| 0.9.1 | **Apportion By waits for a cost center.** It belonged to nobody: a selector on every schedule creation screen, asking how to read shares that did not exist yet. It is now a field of the **Cost Centers** block, drawn under the lines and only once there is one — on the creation form and inside *Update Fields* alike. It stays a field of the block rather than of each row because the API keeps a single value type per schedule, so a row that asked again would be a question the payload has no second place to put. Behaviour is unchanged: nothing is sent without a line, and a saved node keeps whatever it had |
| 0.10.0 | **The settlement**, and with it a capability that was half-built: the node could create a schedule and had no way to mark it paid, which left every settlement in an HTTP Request node. **Transaction - Payment** and **Transaction - Receipt** arrive with **Settle**, **Create**, **Get**, **Get Many** and **Delete**, plus **Bank Account · Get Many**, because a settlement has to name an account and there was nowhere to get one. Three measurements shape it. `POST /payments` **without an account answers 200 and creates an unsettled schedule** instead of a payment — the node refuses to send that. **Settle and Create answer different IDs** (the entry and the schedule), so each reads back by its own. And these collections are **eventually consistent**: the read-back keeps asking for a few seconds, and when the entry still will not appear it says the write **went through** rather than that it failed — because the other sentence makes a workflow pay twice. **Update is not offered**: `PUT /payments/{id}` answers 404, including with the exact body of the production workflow that was supposed to prove otherwise |
| 0.11.0 | **The bank accounts, for real.** 0.10.0 opened the resource with one operation and opened it out of obligation — a settlement is refused without an account — leaving a resource whose name promised money and which could only hand out identifiers. **Get Balances** and **Import Bank Statement** join it, and the new **Bank Transfer** resource arrives with **Create**, **Get Many** and **Delete**. Half of the transfer is in no documentation at all: `GET /accounts/transfer` and `DELETE /accounts/transfer/{id}` were found through a 500 that said *"Transferência não encontrada"* where a 404 was expected. The import is the reason for the version: this API takes a bank statement **half way, in silence** — a line dated before the account was opened is swallowed with a 204 — and **nothing can read the reconciliation queue back**, so every check happens before the request and each refusal names the item and the opening date the API omits. It is also the node's first **aggregating** operation: one input item is one line, and the run is one call. Three more measurements shape the release: the balance view is a **collection of its own**, keyed by `accountId` where the accounts are keyed by `id`; a transfer's **`description` comes back as `identifier`**, and the origin entry carries the amount **negative** where `/payments` carries the same entry positive; and a transfer **dated before the account was opened is accepted**, where the same date on a settlement is a 500 — so the node does not refuse it |
| 0.11.1 | **The apportionment comes back.** 0.9.1 made **Apportion By** wait for a cost center line, and that quietly took the field out of use: pick a centre and it sat there empty, with `The value "" is not supported!` underneath and the node refusing to run. The condition was sound and the reading of it was not — the editor asks two functions, not one. `getNodeParameters` resolves the values it checks visibility against with `onlySimpleTypes`, an object that holds **no collection of any kind**, so a path into one is `undefined` there however the form is filled in; the field counts as hidden and **its value is dropped from what the node saves**, while the editor draws it anyway from the full parameters. No wording survives that: "there is no line yet" and "the check cannot see collections" arrive as the same `undefined`. So the field is unconditional again, still drawn under the lines, and a new sweep over the whole node forbids any `show` rule from reading a path into a collection. Nothing changes on the wire — with no line, neither key is sent — but a node saved while 0.9.1 to 0.11.0 was installed may have lost the choice, and a value apportionment has to be told so again |
| 0.11.2 | **The account writes**, wanted for closing automations: **Bank Account · Create** and **Update**, with `balanceLockDate` as a first-class field. Everything defensive in it is a measurement. Create is **permanent** — no delete, and `isArchived` on a PUT is ignored with a 204 — so the form warns before the button; the API stores the opening date **one day early** on creation and the node repairs it with a corrective update, so the day you pick is the day that stays; `bankNumber` is ignored in silence and therefore not offered. Update merges over the record it just read, which is what keeps the **balance lock** alive through an update that does not mention it — a body without the field clears the lock, 204, not a word. Moving the lock **back** is refused unless the *Allow Moving the Lock Back* option says a person decided it; past the account's opening date the API refuses it itself, and the node adds the one thing the message omits — which date that is. Also new: **HTTP 429 speaks** — this API allows 14 calls per second, answers the excess in plain text, and the node now names the limit instead of showing the generic failure |
| 0.12.0 | **Files and annotations**, which is what every workflow that files a document has been writing by hand. **File** arrives with **Upload**, **Upload and Attach** and **Download**; **Schedule - File** with **Get Many**, **Attach** and **Delete**; **Schedule - Annotation** with **Create**, the only operation this API has for a note. The document always comes from the item's binary field and never from disk. Four measurements shape it, and three of them are warnings the API never gives. **The download link Nibo publishes is public** — it serves the document with no token at all, so whoever holds a `fileId` holds the file. **A document belongs to one schedule at a time**: attaching it elsewhere moves it, and the first schedule silently loses it. **Attaching to a schedule that does not exist is answered 204** and writes the invented ID onto the file, so reading it back confirms a write that went nowhere — which is why every write here asks Nibo for the schedule *first*, the annotation included, since an annotation can never be read, edited or deleted afterwards by anybody. And **Delete is not a detach**: it destroys the document, which can then be attached nowhere, while the stored object keeps serving any link handed out before. The **10 MB ceiling** is a ceiling on the whole request, so the node refuses from 10,484,736 bytes upwards before calling — the API's own answer at that size is *"O Nibo se comportou de forma inesperada."*, which names neither size nor file nor limit |
| 0.13.0 | **Collections** — the charges issued from a receivable, with **Get Many**, **Get**, **Create**, **Cancel** and **Get Many Profiles**. The version cost an exception to this project's own rule that writes only happen against a test organization: that organization **cannot issue charges at all**, because a collection profile ties a contracted bank provider to the company, so the write side was measured against a production one with charges of R$ 10 on a test contact, and cleaned up. What it bought could not have been read: **the cancel route in this project's catalogue does not exist** — `DELETE` answers 404, and the real one is `POST …/{id}/cancel`, found because it answered a *business* error where the others answered a *route* one. **One charge per schedule**, so the node checks before issuing and names the one in the way. And **the delivery choice is write-only**: sending the boleto by e-mail and holding it for review produce an identical record, so the node defaults to holding and never claims anything was sent. Reading was measured against two organizations, and the second corrected the first: **status filters through `status/code`**, which a probe against an empty collection had wrongly reported as impossible |
| 1.0.0 *(planned)* | Production acceptance against real workflows |

## Disclaimer

This is an independent community package and is **not** an official Nibo product. Nibo and the Nibo logo are trademarks of their respective owner, used here solely to identify the service the node integrates with.

## License

[MIT](LICENSE)
