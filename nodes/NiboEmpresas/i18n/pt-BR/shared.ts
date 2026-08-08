import type { Translations } from '../localize';

/** Escopo `_` — 29 entradas. */
export const shared: Translations = {
	"_.authMode": {
		displayName: "Authentication",
	},
	"_.authMode.credential": {
		name: "Credential",
		description: "Use one stored credential for the whole node",
	},
	"_.authMode.field": {
		name: "API Token (Per Item)",
		description: "Read the token from the field below, resolved for each input item",
	},
	"_.apiToken": {
		displayName: "API Token",
		description: "The organization API token to use for this item. Normally an expression reading it from the incoming item, which is what lets a single node walk a whole portfolio of organizations. In this API the token is the organization: each item reads the books of its own token.",
	},
	"_.resource": {
		displayName: "Resource",
	},
	"_.resource.bankAccount": {
		name: "Bank Account",
		description: "An account of the organization, which a settled entry has to name",
	},
	"_.resource.bankTransfer": {
		name: "Bank Transfer",
		description: "Money moved from one account of the organization to another",
	},
	"_.resource.category": {
		name: "Category",
		description: "A line of the chart of accounts, which a schedule is filed under",
	},
	"_.resource.collection": {
		name: "Collection",
		description: "A charge — boleto and Pix — issued from a receivable",
	},
	"_.resource.customer": {
		name: "Contact - Customer",
	},
	"_.resource.employee": {
		name: "Contact - Employee",
	},
	"_.resource.partner": {
		name: "Contact - Partner",
	},
	"_.resource.supplier": {
		name: "Contact - Supplier",
	},
	"_.resource.costCenter": {
		name: "Cost Center",
		description: "A part of the company an amount is attributed to, on its own or shared",
	},
	"_.resource.file": {
		name: "File",
		description: "A document stored in Nibo, before and after it belongs to a schedule",
	},
	"_.resource.annotation": {
		name: "Schedule - Annotation",
		description: "A note written on a schedule, which this API can write but never read back",
	},
	"_.resource.creditSchedule": {
		name: "Schedule - Credit",
		description: "An entry of accounts receivable, due on a date and split into categories",
	},
	"_.resource.debitSchedule": {
		name: "Schedule - Debit",
		description: "An entry of accounts payable, due on a date and split into categories",
	},
	"_.resource.scheduleFile": {
		name: "Schedule - File",
		description: "The documents attached to one schedule",
	},
	"_.resource.serviceInvoice": {
		name: "Service Invoice",
		description: "A Brazilian service invoice — NFS-e — issued from a receivable",
	},
	"_.resource.payment": {
		name: "Transaction - Payment",
		description: "a settled account payable — the debit schedule after the money has moved",
	},
	"_.resource.receipt": {
		name: "Transaction - Receipt",
		description: "a settled account receivable — the credit schedule after the money has moved",
	},
	"_.options": {
		displayName: "Options",
		placeholder: "Add option",
	},
	"_.options.allowMovingLockBack": {
		displayName: "Allow Moving the Lock Back",
		description: "Whether a Balance Lock Date earlier than the current one may be sent. Moving the lock back unlocks an accounting period that was closed, so the node refuses it unless this is on.",
	},
	"_.options.authorizationTimeout": {
		displayName: "Authorization Timeout",
		description: "How long to follow a note before handing it back, in seconds. It is a ceiling, not a wait: the node returns as soon as the city hall answers, so a generous number costs nothing on a note that authorizes in five seconds. Reached, the node returns the record as it stands, saying the note was issued and is not authorized yet — never that anything failed.",
	},
	"_.options.failOnIncomplete": {
		displayName: "Fail on Incomplete Results",
		description: "Whether to fail when the result may be incomplete, instead of returning the records with a warning on the last item. Records written while the pages are being read can slip past the cursor, which shows up as a record count that changes mid-scan or as fewer records than the server reported. Left out, the scan fails: a list that may have lost records is the sort of thing a workflow deletes by.",
	},
	"_.options.filter": {
		displayName: "Filter (OData)",
		description: "OData expression sent as $filter, written by hand, for what the conditions cannot say — a nested group such as (A or B) and C. Fill it in and it becomes the whole filter: the conditions leave the screen and leave the request with them. Accented text needs no special treatment, e.g. contains(name,'SERVIÇOS'). An apostrophe does: it has to be doubled, as in contains(name,'D''ALESSANDRO'), which is exactly what the conditions do for you.",
		placeholder: "contains(name,'LTDA')",
	},
	"_.options.requestInterval": {
		displayName: "Interval Between Requests",
		description: "How long to wait, in milliseconds, between two calls to the API. It applies between input items and between the pages of one scan, never before the first call. Leave it out and the node waits a second; set it to 0 to send the calls back to back.",
	},
	"_.options.waitForAuthorization": {
		displayName: "Wait for Authorization",
		description: "Whether to follow a note until the city hall has answered and hand back the final record — with its number, its PDF and its XML when authorized. Switched off, the node returns the note as it was born, usually still queued.",
	},
};
