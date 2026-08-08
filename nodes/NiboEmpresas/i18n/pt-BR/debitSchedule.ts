import type { Translations } from '../localize';

/** Escopo `debitSchedule` — 7 entradas. */
export const debitSchedule: Translations = {
	"debitSchedule.operation": {
		displayName: "Operation",
	},
	"debitSchedule.operation.create": {
		name: "Create",
		description: "Schedule an amount to be paid on a date",
		action: "Create a debit schedule",
	},
	"debitSchedule.operation.delete": {
		name: "Delete",
		description: "Remove a debit schedule from the organization",
		action: "Delete a debit schedule",
	},
	"debitSchedule.operation.get": {
		name: "Get",
		description: "Retrieve one debit schedule by ID",
		action: "Get a debit schedule",
	},
	"debitSchedule.operation.list": {
		name: "Get Many",
		description: "Retrieve debit schedules of the organization",
		action: "Get many debit schedules",
	},
	"debitSchedule.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the debit schedule as it is",
		action: "Update a debit schedule",
	},
	"debitSchedule.debitScheduleId": {
		displayName: "Debit Schedule ID",
		description: "The ID of the debit schedule to work on, as Nibo returns it in the schedule ID field",
	},
};
