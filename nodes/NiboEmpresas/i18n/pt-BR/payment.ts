import type { Translations } from '../localize';

/** Escopo `payment` — 27 entradas. */
export const payment: Translations = {
	"payment.operation": {
		displayName: "Operation",
	},
	"payment.operation.create": {
		name: "Create",
		description: "Record an amount already paid, creating the debit schedule and settling it in one go",
		action: "Create a payment",
	},
	"payment.operation.delete": {
		name: "Delete",
		description: "Remove the payment, which puts the debit schedule it settled back to unpaid",
		action: "Delete a payment",
	},
	"payment.operation.get": {
		name: "Get",
		description: "Retrieve one payment by ID",
		action: "Get a payment",
	},
	"payment.operation.list": {
		name: "Get Many",
		description: "Retrieve the payments of the organization",
		action: "Get many payments",
	},
	"payment.operation.settle": {
		name: "Settle",
		description: "Record that a debit schedule that already exists has been paid",
		action: "Settle a debit schedule",
	},
	"payment.createNotice": {
		displayName: "Every field below is required by this API. Without a bank account in particular it answers success and creates an unsettled schedule instead of a settled entry, so the node refuses to send it.",
	},
	"payment.stakeholderId": {
		displayName: "Stakeholder",
		description: "The contact this payment is for. The list offers only the kinds the API accepts on this side — measured on 2026-07-27, the same matrix the schedules follow, since a payment creates a debit schedule underneath. Anything else is refused with \"Stakeholder is not compatible\".",
	},
	"payment.categories": {
		displayName: "Categories",
		description: "The lines this entry is split into. The amount is their sum — this API keeps no total of its own here either.",
		placeholder: "Add Category",
	},
	"payment.categories.category": {
		displayName: "Category",
	},
	"payment.description": {
		displayName: "Description",
		description: "What this entry is about, as it will read in Nibo",
	},
	"payment.accrualDate": {
		displayName: "Accrual Date",
		description: "The month this belongs to in the books. Left empty, the API silently copies the date the money moved.",
	},
	"payment.isFlagged": {
		displayName: "Is Flagged",
		description: "Whether to raise the flag Nibo shows next to an entry that needs attention",
	},
	"payment.additionalFields": {
		displayName: "Additional Fields",
		placeholder: "Add Field",
	},
	"payment.additionalFields.reference": {
		displayName: "Reference",
		description: "A free reference of your own, such as an invoice or a contract number",
	},
	"payment.scheduleId": {
		displayName: "Schedule ID",
		description: "The ID of the debit schedule to settle, as Nibo returns it in the scheduleId field. The node reads that schedule before writing anything: this API accepts a credit one through this same route and files the money on the wrong side of the cash book without a word.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"payment.accountId": {
		displayName: "Bank Account Name or ID",
		description: "The account the money moved through. The API refuses a settlement without one — it answers HTTP 500 \"Conta bancária não encontrada.\" — so the node asks for it here rather than letting that sentence arrive later. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"payment.date": {
		displayName: "Date",
		description: "The day the money actually moved. It cannot fall before the opening-balance date of the account chosen above — the API refuses that with \"A data da baixa é inferior a data do saldo inicial da conta\".",
	},
	"payment.value": {
		displayName: "Value",
		description: "How much moved, typed as a positive number on both kinds. Less than the schedule is allowed and is not an error: a part payment is recorded and the schedule stays open — measured on 2026-07-27, where 100 against a schedule of 400 answered 200 and left it unpaid.",
	},
	"payment.entryId": {
		displayName: "Entry ID",
		description: "The ID of the entry to read, as Nibo returns it in the entryId field. That is what this collection calls its key — the shorter name every other collection uses is not a field here, and sorting by it answers HTTP 500. It is read through the list filtered by ID, because this API has no route that reads one entry on its own.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"payment.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"payment.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"payment.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"payment.filters.conditions": {
		displayName: "Condition",
	},
	"payment.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"payment.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"payment.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
