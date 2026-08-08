import type { Translations } from '../localize';

/** Escopo `creditSchedule` — 97 entradas. */
export const creditSchedule: Translations = {
	"creditSchedule.operation": {
		displayName: "Operation",
	},
	"creditSchedule.operation.create": {
		name: "Create",
		description: "Schedule an amount to be received on a date",
		action: "Create a credit schedule",
	},
	"creditSchedule.operation.delete": {
		name: "Delete",
		description: "Remove a credit schedule from the organization",
		action: "Delete a credit schedule",
	},
	"creditSchedule.operation.get": {
		name: "Get",
		description: "Retrieve one credit schedule by ID",
		action: "Get a credit schedule",
	},
	"creditSchedule.operation.list": {
		name: "Get Many",
		description: "Retrieve credit schedules of the organization",
		action: "Get many credit schedules",
	},
	"creditSchedule.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the credit schedule as it is",
		action: "Update a credit schedule",
	},
	"creditSchedule.creditScheduleId": {
		displayName: "Credit Schedule ID",
		description: "The ID of the credit schedule to work on, as Nibo returns it in the schedule ID field",
	},
	"creditSchedule.stakeholderId": {
		displayName: "Stakeholder",
		description: "The contact this schedule belongs to. The list is searched on the server and offers only the kinds the API accepts here — a customer or a partner on a credit schedule, a supplier, an employee or a partner on a debit one; anything else is refused with \"Stakeholder is not compatible\".",
	},
	"creditSchedule.dueDate": {
		displayName: "Due Date",
		description: "The date the amount falls due",
	},
	"creditSchedule.scheduleDate": {
		displayName: "Schedule Date",
		description: "The date the money is expected to move, which is not always the date it falls due",
	},
	"creditSchedule.accrualDate": {
		displayName: "Accrual Date",
		description: "The month this belongs to in the books. Left empty, the API silently copies the due date — which files the income or the expense in the month the money moves rather than the month it was earned or incurred.",
	},
	"creditSchedule.description": {
		displayName: "Description",
		description: "What this schedule is about, as it will read in Nibo",
	},
	"creditSchedule.isFlagged": {
		displayName: "Is Flagged",
		description: "Whether to raise the flag Nibo shows next to a schedule that needs attention",
	},
	"creditSchedule.categories": {
		displayName: "Categories",
		description: "The lines this schedule is split into. The amount of the schedule is their sum — this API keeps no total of its own. Splitting across several categories has to be enabled for the organization in Nibo: where it is off, the API refuses a second line with \"Utilize apenas uma categoria\", and the node says what that means.",
		placeholder: "Add Category",
	},
	"creditSchedule.categories.category": {
		displayName: "Category",
	},
	"creditSchedule.costCenters": {
		displayName: "Cost Centers",
		description: "The parts of the company this amount is attributed to. Leave it empty and the schedule carries no apportionment, which is what every schedule written before this field existed does.",
		placeholder: "Add Cost Center",
	},
	"creditSchedule.costCenters.costCenter": {
		displayName: "Cost Center",
	},
	"creditSchedule.apportionBy": {
		displayName: "Apportion By",
		description: "How the share of each cost center line above is read. It is sent only when there is at least one line, so a schedule with no apportionment is written exactly as it was before this field existed.",
	},
	"creditSchedule.apportionBy.percent": {
		name: "Percentage",
		description: "Each line carries a share of the whole, and the shares have to add up to 100",
	},
	"creditSchedule.apportionBy.value": {
		name: "Value",
		description: "Each line carries an amount, and the amounts have to add up to the amount of the schedule",
	},
	"creditSchedule.generateBoleto": {
		displayName: "Generate Boleto",
		description: "Whether this receivable is born with a charge — a boleto, with the Pix QR printed on it. A schedule carries at most one charge, and cancelling it later is done with the Collection resource. ⚠️ Its public link is the charge itself: whoever holds it opens the payment page with no token.",
	},
	"creditSchedule.generateBoleto.before": {
		name: "A Number of Days Before the Due Date",
		description: "Nibo issues the charge that many days ahead of the due date",
	},
	"creditSchedule.generateBoleto.no": {
		name: "Don't Generate",
		description: "No charge — which is what every schedule written before this field existed does",
	},
	"creditSchedule.generateBoleto.now": {
		name: "Immediately",
		description: "The charge is issued as the schedule is created. There is a boleto at the end of this.",
	},
	"creditSchedule.boletoDaysBefore": {
		displayName: "Days Before Due Date",
		description: "How many days before the due date Nibo issues the charge",
	},
	"creditSchedule.boletoCollectionProfileId": {
		displayName: "Collection Profile Name or ID",
		description: "Which profile issues the charge — it ties the bank provider to it, and the API refuses without one. An organization with no profile cannot issue charges at all. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"creditSchedule.boletoDeliveryType": {
		displayName: "Delivery",
		description: "Which way the charge leaves. Both deliver — the choice is the route, not whether. Through the Accountant only makes sense for an organization whose Nibo is integrated with that module.",
	},
	"creditSchedule.boletoDeliveryType.0": {
		name: "By E-Mail",
		description: "Nibo sends it from the financial side",
	},
	"creditSchedule.boletoDeliveryType.default": {
		name: "Leave It to Nibo",
		description: "The key is not sent at all",
	},
	"creditSchedule.boletoDeliveryType.1": {
		name: "Through the Accountant",
		description: "The charge is handed to Nibo's accountant module and reaches the payer in the client portal there",
	},
	"creditSchedule.issueInvoice": {
		displayName: "Issue Invoice",
		description: "Whether this receivable is born with a service invoice — an NFS-e — programmed. ⚠️ Issuing reaches a city hall and there is no undo: a note can only be cancelled afterwards, which leaves it in the company's fiscal history for good and keeps its public PDF and XML answering. The amount and the taker come from this schedule.",
	},
	"creditSchedule.issueInvoice.before": {
		name: "A Number of Days Before the Due Date",
	},
	"creditSchedule.issueInvoice.no": {
		name: "Don't Issue",
		description: "No note, which is what every schedule written before this field existed does",
	},
	"creditSchedule.issueInvoice.now": {
		name: "Immediately",
		description: "The note is issued as the schedule is created. This reaches a city hall, and there is no undo.",
	},
	"creditSchedule.issueInvoice.boleto": {
		name: "When the Boleto Is Generated",
		description: "Waits for a charge on this schedule — one asked for above, or one made by hand in Nibo later",
	},
	"creditSchedule.issueInvoice.settled": {
		name: "When the Receipt Is Settled",
		description: "Waits for the money to be marked as received",
	},
	"creditSchedule.invoiceDaysBefore": {
		displayName: "Days Before Due Date",
		description: "How many days before the due date Nibo issues the note",
	},
	"creditSchedule.invoiceServiceProfileId": {
		displayName: "Service Profile Name or ID",
		description: "Which profile the note is declared under. It decides the service, the tax and the remarks printed on it. ⚠️ A wrong profile is not fixed afterwards: undoing it is a cancellation at the city hall. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"creditSchedule.invoiceAdditionalRemarks": {
		displayName: "Additional Remarks",
		description: "Supplementary information printed on the note. Required for every note this schedule issues.",
	},
	"creditSchedule.invoiceCityWhereServiceWasProvided": {
		displayName: "City Where Service Was Provided",
		description: "Where the service was provided. Required for every note this schedule issues.",
		placeholder: "Rio de Janeiro",
	},
	"creditSchedule.invoiceServiceDescription": {
		displayName: "Service Description",
		description: "The text that fills the {{Descricao}} template the profile carries. Required for every note this schedule issues.",
	},
	"creditSchedule.invoiceStateWhereServiceWasProvided": {
		displayName: "State Where Service Was Provided",
		description: "The state of the city above, as the two-letter abbreviation. Required for every note this schedule issues.",
		placeholder: "RJ",
	},
	"creditSchedule.repeat": {
		displayName: "Repeat",
		description: "How this schedule repeats. It is one question with three answers because the API refuses recurrence and installments in the same request — and neither can be turned into the other afterwards.",
	},
	"creditSchedule.repeat.no": {
		name: "Don't Repeat",
		description: "One schedule, on the due date above — which is what every schedule written before this field existed does",
	},
	"creditSchedule.repeat.installments": {
		name: "Installments",
		description: "One amount split into parcels, each with its own due date. Nibo tags them \"Parcelado — X/Y\".",
	},
	"creditSchedule.repeat.recurrence": {
		name: "Recurrence",
		description: "The same amount again and again. Nibo provisions the occurrences up to 36 months ahead.",
	},
	"creditSchedule.recurrenceInterval": {
		displayName: "Repeat Every",
		description: "How many of the units below go by between one occurrence and the next",
	},
	"creditSchedule.recurrenceIntervalType": {
		displayName: "Interval",
		description: "The unit the interval above counts in",
	},
	"creditSchedule.recurrenceIntervalType.day": {
		name: "Day",
	},
	"creditSchedule.recurrenceIntervalType.month": {
		name: "Month",
	},
	"creditSchedule.recurrenceIntervalType.week": {
		name: "Week",
	},
	"creditSchedule.recurrenceIntervalType.year": {
		name: "Year",
	},
	"creditSchedule.recurrenceEnds": {
		displayName: "Ends",
		description: "When the repetition stops. Ending it later is done in Nibo, not here: this API has no route that reads or changes a recurrence once it exists.",
	},
	"creditSchedule.recurrenceEnds.occurrences": {
		name: "After a Number of Occurrences",
	},
	"creditSchedule.recurrenceEnds.never": {
		name: "Never",
	},
	"creditSchedule.recurrenceEnds.date": {
		name: "On a Date",
	},
	"creditSchedule.recurrenceOccurrences": {
		displayName: "Occurrences",
		description: "How many times in total, counting the first one",
	},
	"creditSchedule.recurrenceEndDate": {
		displayName: "End Date",
		description: "The last day the repetition may fall on",
	},
	"creditSchedule.installmentsAre": {
		displayName: "Installments Are",
		description: "How the parcels are told to the node. The API always wants them one by one; this is only who writes them out.",
	},
	"creditSchedule.installmentsAre.generated": {
		name: "Generated",
		description: "Say how many and how far apart, and the node writes the parcels — the first one falling on the Due Date above",
	},
	"creditSchedule.installmentsAre.listed": {
		name: "Listed One by One",
		description: "Type every parcel, for a plan that is not regular — a bigger first parcel, a broken due date",
	},
	"creditSchedule.installmentCount": {
		displayName: "Number of Installments",
		description: "How many parcels, counting the first. Nibo allows up to 100.",
	},
	"creditSchedule.installmentInterval": {
		displayName: "Repeat Every",
		description: "How far apart the parcels fall",
	},
	"creditSchedule.installmentIntervalType": {
		displayName: "Interval",
		description: "The unit the interval above counts in. On months the day is kept and clamped to the end of a short month — a plan starting on the 31st falls on the 28th in February and back on the 31st in March.",
	},
	"creditSchedule.installmentIntervalType.day": {
		name: "Day",
	},
	"creditSchedule.installmentIntervalType.month": {
		name: "Month",
	},
	"creditSchedule.installmentIntervalType.week": {
		name: "Week",
	},
	"creditSchedule.installmentIntervalType.year": {
		name: "Year",
	},
	"creditSchedule.installmentAmount": {
		displayName: "Amount",
		description: "What the amount of each parcel is. \"The total\" is the sum of the lines under Categories: this API keeps no total of its own.",
	},
	"creditSchedule.installmentAmount.repeat": {
		name: "Repeat the Amount on Every Installment",
		description: "Each parcel is worth the whole sum of the lines under Categories",
	},
	"creditSchedule.installmentAmount.split": {
		name: "Split the Total Across the Installments",
		description: "The sum of the lines under Categories is divided, and the leftover cents go on the first parcels so the total closes",
	},
	"creditSchedule.installments": {
		displayName: "Installments",
		description: "The parcels, as the API takes them. Up to 100.",
		placeholder: "Add Installment",
	},
	"creditSchedule.installments.installment": {
		displayName: "Installment",
	},
	"creditSchedule.additionalFields": {
		displayName: "Additional Fields",
		placeholder: "Add Field",
	},
	"creditSchedule.additionalFields.reference": {
		displayName: "Reference",
		description: "A free reference of your own, such as an invoice or a contract number",
	},
	"creditSchedule.updateFields": {
		displayName: "Update Fields",
		description: "The fields to change. A field left out is not touched: the schedule keeps whatever is stored in Nibo. A text field added and left empty is written empty, which is how a value is erased on purpose — but a date or a category left empty is ignored, since a schedule with no due date or no amount is not a schedule this API keeps.",
		placeholder: "Add Field",
	},
	"creditSchedule.updateFields.accrualDate": {
		displayName: "Accrual Date",
		description: "The month this belongs to in the books",
	},
	"creditSchedule.updateFields.apportionBy": {
		displayName: "Apportion By",
		description: "How the share of each cost center line above is read. It is sent only when there is at least one line, so a schedule with no apportionment is written exactly as it was before this field existed.",
	},
	"creditSchedule.updateFields.apportionBy.percent": {
		name: "Percentage",
		description: "Each line carries a share of the whole, and the shares have to add up to 100",
	},
	"creditSchedule.updateFields.apportionBy.value": {
		name: "Value",
		description: "Each line carries an amount, and the amounts have to add up to the amount of the schedule",
	},
	"creditSchedule.updateFields.categories": {
		displayName: "Categories",
		description: "The lines this schedule is split into. The amount of the schedule is their sum — this API keeps no total of its own. Splitting across several categories has to be enabled for the organization in Nibo: where it is off, the API refuses a second line with \"Utilize apenas uma categoria\", and the node says what that means.",
		placeholder: "Add Category",
	},
	"creditSchedule.updateFields.categories.category": {
		displayName: "Category",
	},
	"creditSchedule.updateFields.costCenters": {
		displayName: "Cost Centers",
		description: "The parts of the company this amount is attributed to. Leave it empty and the schedule carries no apportionment, which is what every schedule written before this field existed does.",
		placeholder: "Add Cost Center",
	},
	"creditSchedule.updateFields.costCenters.costCenter": {
		displayName: "Cost Center",
	},
	"creditSchedule.updateFields.description": {
		displayName: "Description",
		description: "What this schedule is about, as it will read in Nibo",
	},
	"creditSchedule.updateFields.dueDate": {
		displayName: "Due Date",
		description: "The date the amount falls due",
	},
	"creditSchedule.updateFields.isFlagged": {
		displayName: "Is Flagged",
		description: "Whether to raise the flag Nibo shows next to a schedule that needs attention",
	},
	"creditSchedule.updateFields.reference": {
		displayName: "Reference",
		description: "A free reference of your own, such as an invoice or a contract number",
	},
	"creditSchedule.updateFields.scheduleDate": {
		displayName: "Schedule Date",
		description: "The date the money is expected to move",
	},
	"creditSchedule.updateFields.stakeholderId": {
		displayName: "Stakeholder",
		description: "The contact this schedule belongs to. The list is searched on the server and offers only the kinds the API accepts here — a customer or a partner on a credit schedule, a supplier, an employee or a partner on a debit one; anything else is refused with \"Stakeholder is not compatible\".",
	},
	"creditSchedule.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"creditSchedule.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"creditSchedule.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"creditSchedule.filters.conditions": {
		displayName: "Condition",
	},
	"creditSchedule.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"creditSchedule.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"creditSchedule.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
