import type { Translations } from '../localize';

/** Escopo `supplier` — 7 entradas. */
export const supplier: Translations = {
	"supplier.operation": {
		displayName: "Operation",
	},
	"supplier.operation.create": {
		name: "Create",
		description: "Add a supplier to the organization",
		action: "Create a supplier",
	},
	"supplier.operation.delete": {
		name: "Delete",
		description: "Remove a supplier from the organization",
		action: "Delete a supplier",
	},
	"supplier.operation.get": {
		name: "Get",
		description: "Retrieve one supplier by ID",
		action: "Get a supplier",
	},
	"supplier.operation.list": {
		name: "Get Many",
		description: "Retrieve suppliers of the organization",
		action: "Get many suppliers",
	},
	"supplier.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the supplier as it is",
		action: "Update a supplier",
	},
	"supplier.supplierId": {
		displayName: "Supplier ID",
		description: "The ID of the supplier to work on, as Nibo returns it in the ID field",
	},
};
