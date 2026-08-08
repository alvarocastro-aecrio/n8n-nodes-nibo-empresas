import type { Translations } from '../localize';

/** Escopo `receipt` — 8 entradas. */
export const receipt: Translations = {
	"receipt.operation": {
		displayName: "Operation",
	},
	"receipt.operation.create": {
		name: "Create",
		description: "Record an amount already received, creating the credit schedule and settling it in one go",
		action: "Create a receipt",
	},
	"receipt.operation.delete": {
		name: "Delete",
		description: "Remove the receipt, which puts the credit schedule it settled back to unpaid",
		action: "Delete a receipt",
	},
	"receipt.operation.get": {
		name: "Get",
		description: "Retrieve one receipt by ID",
		action: "Get a receipt",
	},
	"receipt.operation.list": {
		name: "Get Many",
		description: "Retrieve the receipts of the organization",
		action: "Get many receipts",
	},
	"receipt.operation.settle": {
		name: "Settle",
		description: "Record that a credit schedule that already exists has been received",
		action: "Settle a credit schedule",
	},
	"receipt.stakeholderId": {
		displayName: "Stakeholder",
		description: "The contact this receipt is for. The list offers only the kinds the API accepts on this side — measured on 2026-07-27, the same matrix the schedules follow, since a receipt creates a credit schedule underneath. Anything else is refused with \"Stakeholder is not compatible\".",
	},
	"receipt.scheduleId": {
		displayName: "Schedule ID",
		description: "The ID of the credit schedule to settle, as Nibo returns it in the scheduleId field. The node reads that schedule before writing anything: this API accepts a debit one through this same route and files the money on the wrong side of the cash book without a word.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
};
