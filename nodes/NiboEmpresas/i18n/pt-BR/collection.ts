import type { Translations } from '../localize';

/** Escopo `collection` — 24 entradas. */
export const collection: Translations = {
	"collection.operation": {
		displayName: "Operation",
	},
	"collection.operation.cancel": {
		name: "Cancel",
		description: "Cancel a charge, which leaves the record in place with its status set to Cancelled",
		action: "Cancel a collection",
	},
	"collection.operation.create": {
		name: "Create",
		description: "Issue a charge from a receivable, choosing whether Nibo sends it to the payer or holds it for review",
		action: "Create a collection",
	},
	"collection.operation.get": {
		name: "Get",
		description: "Retrieve one charge by ID, read through the list — this API has no get-by-ID route for a charge",
		action: "Get a collection",
	},
	"collection.operation.list": {
		name: "Get Many",
		description: "Retrieve the charges of the organization",
		action: "Get many collections",
	},
	"collection.operation.listProfiles": {
		name: "Get Many Profiles",
		description: "Retrieve the collection profiles, which is what a charge is issued through and the only way to know whether this organization can issue one",
		action: "Get many collection profiles",
	},
	"collection.createNotice": {
		displayName: "Both delivery types send the charge — the choice is which way out, not whether. By E-Mail goes out from Nibo's financial side; Through the Accountant hands the charge to the accountant module, where it reaches the payer in the client portal along with the rest of that module's traffic. Nothing on this screen keeps a charge in, and the node cannot follow one into the accountant module to tell you what happened there.",
	},
	"collection.scheduleId": {
		displayName: "Schedule ID",
		description: "The receivable to charge for. The amount and the description of the charge come from it — they are not asked here. A schedule carries at most one charge: the node checks before issuing and names the one already there.",
		placeholder: "04a6a2a9-ef71-4733-9ac7-33737ac4d40c",
	},
	"collection.dueDate": {
		displayName: "Due Date",
		description: "The day the charge falls due, usually the same as the schedule it comes from",
	},
	"collection.collectionProfileId": {
		displayName: "Collection Profile Name or ID",
		description: "Which profile issues the charge — it is what ties the bank provider to it, and the API refuses a creation without one. An organization with no profile cannot issue charges at all. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"collection.deliveryType": {
		displayName: "Delivery Type",
		description: "Which way the charge leaves: by e-mail from Nibo's financial module, or through its accountant module and the client portal. Both deliver. It is write-only — the value never comes back — but its effect does: read accountantIntegrationStatus to see which route a charge took. ⚠️ Through the Accountant only makes sense for an organization whose Nibo is integrated with the accountant module; without that, the routing has nowhere to land, and one charge in the sample sits at \"Não foi possível criar o item de conferência no Nibo Obrigações\".",
	},
	"collection.deliveryType.0": {
		name: "By E-Mail",
		description: "Nibo sends the boleto to the payer from the financial-management side. Measured: accountantIntegrationStatus stays \"Não definida\".",
	},
	"collection.deliveryType.default": {
		name: "Leave It to Nibo",
		description: "The field is not sent at all, so Nibo routes it however it does by default",
	},
	"collection.deliveryType.1": {
		name: "Through the Accountant",
		description: "The charge is handed to Nibo's accountant module and reaches the payer in the client portal there. Measured: accountantIntegrationStatus becomes \"Habilitada\" — which records the request, not the outcome.",
	},
	"collection.listNotice": {
		displayName: "The url on each of these records is public: anyone holding it opens the payment page without a token. Treat it as the charge itself, not as a reference to it.",
	},
	"collection.cancelNotice": {
		displayName: "Cancelling does not remove the charge: the record stays where it is with its status set to Cancelled, and the public link still answers afterwards. There is a second way it happens that nobody expects — deleting the schedule cancels the charge that hangs off it. And a charge can only be cancelled once: asking twice is refused by the API.",
	},
	"collection.collectionId": {
		displayName: "Collection ID",
		description: "The charge, as Get Many returns it. There is no get-by-ID route on this API — the record is fetched through the list filtered by this ID.",
		placeholder: "c1a5e0d4-77b0-4f1a-9b3e-2a6a1d0f9c11",
	},
	"collection.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"collection.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"collection.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"collection.filters.conditions": {
		displayName: "Condition",
	},
	"collection.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"collection.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"collection.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
