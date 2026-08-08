import type { Translations } from '../localize';

/** Escopo `partner` — 7 entradas. */
export const partner: Translations = {
	"partner.operation": {
		displayName: "Operation",
	},
	"partner.operation.create": {
		name: "Create",
		description: "Add a partner to the organization",
		action: "Create a partner",
	},
	"partner.operation.delete": {
		name: "Delete",
		description: "Remove a partner from the organization",
		action: "Delete a partner",
	},
	"partner.operation.get": {
		name: "Get",
		description: "Retrieve one partner by ID",
		action: "Get a partner",
	},
	"partner.operation.list": {
		name: "Get Many",
		description: "Retrieve partners of the organization",
		action: "Get many partners",
	},
	"partner.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the partner as it is",
		action: "Update a partner",
	},
	"partner.partnerId": {
		displayName: "Partner ID",
		description: "The ID of the partner to work on, as Nibo returns it in the ID field",
	},
};
