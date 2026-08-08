import type { Translations } from '../localize';

/** Escopo `bankTransfer` — 18 entradas. */
export const bankTransfer: Translations = {
	"bankTransfer.operation": {
		displayName: "Operation",
	},
	"bankTransfer.operation.create": {
		name: "Create",
		description: "Move money from one account of the organization to another, which records a payment on one and a receipt on the other",
		action: "Create a bank transfer",
	},
	"bankTransfer.operation.delete": {
		name: "Delete",
		description: "Undo the transfer, which removes the two entries it created and returns both balances to what they were",
		action: "Delete a bank transfer",
	},
	"bankTransfer.operation.list": {
		name: "Get Many",
		description: "Retrieve the transfers of the organization",
		action: "Get many bank transfers",
	},
	"bankTransfer.createNotice": {
		displayName: "A missing or unknown account is answered by this API with \"Não é possivel transferir valores de contas virtuais\" — a sentence about a setting that has nothing to do with it. The node checks both accounts, the amount and the two sides before sending anything.",
	},
	"bankTransfer.originAccountId": {
		displayName: "Origin Account Name or ID",
		description: "The account the money leaves. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"bankTransfer.destinyAccountId": {
		displayName: "Destination Account Name or ID",
		description: "The account the money reaches. It cannot be the same as the origin — this API refuses that with \"Você não pode transferir valores entre as mesmas contas correntes\", and the node refuses it first. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"bankTransfer.date": {
		displayName: "Date",
		description: "The day the money moved. Unlike a settlement, this one may fall before the opening-balance date of either account: the API was measured to accept it, so the node does not refuse it.",
	},
	"bankTransfer.value": {
		displayName: "Value",
		description: "How much moved, as a positive number. Zero, a negative amount and no amount at all are the same refusal in this API — \"O valor informado deve ser positivo\" — and the node makes it before sending.",
	},
	"bankTransfer.description": {
		displayName: "Description",
		description: "What the transfer is about. Left empty it is not sent at all, and Nibo writes its own — \"Transferência de {origin} para {destination}\". Either way the text comes back in the identifier field of the two entries: this API has no description field on a transfer.",
	},
	"bankTransfer.transferId": {
		displayName: "Transfer ID",
		description: "The ID of the transfer to undo, as Get Many returns it. It is the ID of the transfer itself, not of either entry it created: an entry ID here answers HTTP 500 \"Transferência não encontrada\", which is how this route was found in the first place.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"bankTransfer.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"bankTransfer.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"bankTransfer.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"bankTransfer.filters.conditions": {
		displayName: "Condition",
	},
	"bankTransfer.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"bankTransfer.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"bankTransfer.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
