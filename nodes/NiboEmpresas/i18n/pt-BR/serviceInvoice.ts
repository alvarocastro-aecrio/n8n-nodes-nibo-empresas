import type { Translations } from '../localize';

/** Escopo `serviceInvoice` — 24 entradas. */
export const serviceInvoice: Translations = {
	"serviceInvoice.operation": {
		displayName: "Operation",
	},
	"serviceInvoice.operation.cancel": {
		name: "Cancel",
		description: "Cancel a note at the city hall, which leaves the record in place with its status set to Cancelled",
		action: "Cancel a service invoice",
	},
	"serviceInvoice.operation.get": {
		name: "Get",
		description: "Retrieve one note by ID, read through the list — this API has no get-by-ID route for a note",
		action: "Get a service invoice",
	},
	"serviceInvoice.operation.list": {
		name: "Get Many",
		description: "Retrieve the service invoices of the organization",
		action: "Get many service invoices",
	},
	"serviceInvoice.operation.listProfiles": {
		name: "Get Many Service Profiles",
		description: "Retrieve the service profiles, which is what a note is issued through and the only way to know whether this organization issues one at all",
		action: "Get many service profiles",
	},
	"serviceInvoice.operation.issue": {
		name: "Issue",
		description: "Issue a note from a receivable and, unless the wait is switched off, follow it until the city hall has answered",
		action: "Issue a service invoice",
	},
	"serviceInvoice.listNotice": {
		displayName: "The pdfFileUrl and xmlFileUrl on these records are public: they open without a token, and they keep answering after the note is cancelled. Treat a link as the document itself, not as a reference to it.",
	},
	"serviceInvoice.profilesNotice": {
		displayName: "A service profile decides which service the note declares, how much tax it charges and the remarks printed on it — where bank details and a Pix key usually go. An empty answer here is not an error: it means this organization does not issue NFS-e, which needs a valid digital certificate and a profile approved by the city hall.",
	},
	"serviceInvoice.issueNotice": {
		displayName: "Issuing sends an RPS to the city hall, and there is no undo: the note can only be cancelled afterwards, which leaves the record in place and keeps its PDF and XML answering. The amount and the taker are not asked for here because both come from the schedule. If the city hall denies the note, that is not a failure of this node — the item comes out with the denial and the city hall's own text in lastMessage.",
	},
	"serviceInvoice.scheduleId": {
		displayName: "Schedule ID",
		description: "The receivable the note is issued from. Both the amount and the taker come from it and are not asked for here — the API wants the taker as a separate key, and this node reads it off the schedule so the two can never disagree. The schedule is read before anything is sent, so a wrong ID stops here rather than at a city hall. One schedule was measured carrying three notes, so this API has no one-note-per-schedule rule and the node puts no guard of its own there.",
		placeholder: "a01f0058-d321-4805-bd73-810e88b98557",
	},
	"serviceInvoice.serviceProfileId": {
		displayName: "Service Profile Name or ID",
		description: "Which profile the note is declared under. It decides the service, the tax and the remarks printed on the note, and the API refuses an issuing without one. ⚠️ A wrong profile is not something fixed afterwards: undoing it is a cancellation at the city hall. The list shows the service code and the ISS rate next to each name, which is what tells two similar profiles apart. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"serviceInvoice.accrualDate": {
		displayName: "Accrual Date",
		description: "The competence of the RPS — the month the service is declared in. Asked for rather than guessed: on the schedules of this API an omitted accrual date is copied from the due date, which throws the competence into the wrong month.",
	},
	"serviceInvoice.cityWhereServiceWasProvided": {
		displayName: "City Where Service Was Provided",
		description: "Where the service was provided. Required for every note this organization issues.",
		placeholder: "Rio de Janeiro",
	},
	"serviceInvoice.additionalServiceDescription": {
		displayName: "Service Description",
		description: "The text that fills the description template of the profile — the {{Descricao}} it carries. Required for every note this organization issues.",
	},
	"serviceInvoice.stateWhereServiceWasProvided": {
		displayName: "State Where Service Was Provided",
		description: "The state of the city above, as the two-letter abbreviation. Required for every note this organization issues.",
		placeholder: "RJ",
	},
	"serviceInvoice.cancelNotice": {
		displayName: "Cancelling is done at the city hall and it does not remove anything: the note stays in the company's history for good, marked Cancelled — it is a fiscal document. Its PDF and XML keep answering afterwards, and they are public, so whoever received a link before still downloads the note after it is cancelled, with nothing in the document saying so.",
	},
	"serviceInvoice.serviceInvoiceId": {
		displayName: "Service Invoice ID",
		description: "The note, as Get Many returns it. There is no get-by-ID route on this API — the record is fetched through the list filtered by this ID.",
		placeholder: "be35e904-0669-40d3-bad1-cc7277d56781",
	},
	"serviceInvoice.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"serviceInvoice.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"serviceInvoice.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"serviceInvoice.filters.conditions": {
		displayName: "Condition",
	},
	"serviceInvoice.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"serviceInvoice.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"serviceInvoice.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
