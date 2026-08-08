import type { Translations } from '../localize';

/** Escopo `costCenter` — 20 entradas. */
export const costCenter: Translations = {
	"costCenter.operation": {
		displayName: "Operation",
	},
	"costCenter.operation.create": {
		name: "Create",
		description: "Add a cost center to the organization",
		action: "Create a cost center",
	},
	"costCenter.operation.delete": {
		name: "Delete",
		description: "Remove a cost center from the organization",
		action: "Delete a cost center",
	},
	"costCenter.operation.get": {
		name: "Get",
		description: "Retrieve one cost center by ID",
		action: "Get a cost center",
	},
	"costCenter.operation.list": {
		name: "Get Many",
		description: "Retrieve the cost centers of the organization",
		action: "Get many cost centers",
	},
	"costCenter.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the cost center as it is",
		action: "Update a cost center",
	},
	"costCenter.costCenterId": {
		displayName: "Cost Center ID",
		description: "The ID of the cost center to work on, as Nibo returns it in the costCenterId field. That is what this collection calls its key: the shorter name every other collection uses is not a field here at all, and sorting by it answers HTTP 500.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"costCenter.description": {
		displayName: "Description",
		description: "What this cost center is called, as it will read in Nibo",
	},
	"costCenter.additionalFields": {
		displayName: "Additional Fields",
		placeholder: "Add Field",
	},
	"costCenter.additionalFields.externalCode": {
		displayName: "External Code",
		description: "A code of your own, such as the one this cost center carries in another system. Nibo stores it as typed and offers it as a filter.",
	},
	"costCenter.updateFields": {
		displayName: "Update Fields",
		description: "The fields to change. A field left out is not touched: the cost center keeps whatever is stored in Nibo. A field added and left empty is written empty, which is how a value is erased on purpose.",
		placeholder: "Add Field",
	},
	"costCenter.updateFields.description": {
		displayName: "Description",
		description: "What this cost center is called, as it will read in Nibo",
	},
	"costCenter.updateFields.externalCode": {
		displayName: "External Code",
		description: "A code of your own, such as the one this cost center carries in another system. Nibo stores it as typed and offers it as a filter.",
	},
	"costCenter.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"costCenter.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"costCenter.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"costCenter.filters.conditions": {
		displayName: "Condition",
	},
	"costCenter.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"costCenter.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"costCenter.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
