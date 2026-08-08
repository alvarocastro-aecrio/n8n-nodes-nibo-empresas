import type { Translations } from '../localize';

/** Escopo `bankAccount` — 29 entradas. */
export const bankAccount: Translations = {
	"bankAccount.operation": {
		displayName: "Operation",
	},
	"bankAccount.operation.create": {
		name: "Create",
		description: "Open a new account in the organization — an act this API gives no way back from",
		action: "Create a bank account",
	},
	"bankAccount.operation.listBalances": {
		name: "Get Balances",
		description: "Retrieve what each account holds, from the balance view — a collection of its own, with its own fields",
		action: "Get the balances of the bank accounts",
	},
	"bankAccount.operation.list": {
		name: "Get Many",
		description: "Retrieve the bank accounts of the organization",
		action: "Get many bank accounts",
	},
	"bankAccount.operation.importBankStatement": {
		name: "Import Bank Statement",
		description: "Send the lines of a statement to the reconciliation queue of an account, one input item per line",
		action: "Import a bank statement",
	},
	"bankAccount.operation.update": {
		name: "Update",
		description: "Change the fields you list and leave every other one as it is — including the balance lock date, which is how a closing automation locks a period",
		action: "Update a bank account",
	},
	"bankAccount.createAccountNotice": {
		displayName: "An account cannot be deleted or archived through this API: what this creates is permanent, and tucking it away is only possible on Nibo's own screen. The node also checks the opening date after creating — this API stores it one day early on creation, and the node puts it right.",
	},
	"bankAccount.name": {
		displayName: "Name",
		description: "What the account is called in Nibo",
		placeholder: "Conta corrente Itaú",
	},
	"bankAccount.openBalance": {
		displayName: "Opening Balance",
		description: "What the account holds on the opening day. It becomes the starting balance Get Balances reports.",
	},
	"bankAccount.dateOfOpenBalance": {
		displayName: "Opening Balance Date",
		description: "The day the opening balance was struck. Nothing can be filed into the account before it. The API stores this one day early on creation; the node reads the account back and repairs the date, so the day you pick is the day that stays.",
	},
	"bankAccount.bankAccountId": {
		displayName: "Bank Account Name or ID",
		description: "The account to change. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"bankAccount.updateFields": {
		displayName: "Update Fields",
		description: "The fields to change. Every field you do not add stays exactly as it is — the balance lock included.",
		placeholder: "Add Field",
	},
	"bankAccount.updateFields.balanceLockDate": {
		displayName: "Balance Lock Date",
		description: "The day the books are locked up to — nothing before it can be written or edited. Moving it forward is how a closing automation closes a month. Moving it back unlocks a closed period, so the node refuses that unless the \"Allow Moving the Lock Back\" option is on.",
	},
	"bankAccount.updateFields.name": {
		displayName: "Name",
		description: "What the account is called in Nibo",
	},
	"bankAccount.updateFields.openBalance": {
		displayName: "Opening Balance",
		description: "What the account held on the opening day",
	},
	"bankAccount.updateFields.dateOfOpenBalance": {
		displayName: "Opening Balance Date",
		description: "The day the opening balance was struck. Nothing can be filed into the account before it.",
	},
	"bankAccount.importNotice": {
		displayName: "One input item is one line of the statement, and the node sends them as a single batch. The lines go to the reconciliation queue, not to the ledger: no entry appears and no balance moves. Nibo answers this with 204 and an empty body whether it filed everything or half of it, and nothing in this API can read the queue back — so every check this node makes happens before the lines are sent.",
	},
	"bankAccount.accountId": {
		displayName: "Bank Account Name or ID",
		description: "The account the statement belongs to. It is read from the first input item and every item has to agree with it: one batch goes to one account. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"bankAccount.batchName": {
		displayName: "Batch Name",
		description: "What to call this batch in Nibo, usually the name of the file it came from. Read from the first input item, since the batch is one thing.",
		placeholder: "extrato.csv",
	},
	"bankAccount.description": {
		displayName: "Description",
		description: "What this line of the statement says, as it will read in the reconciliation screen. Read per item, so it is normally an expression over the incoming line.",
	},
	"bankAccount.value": {
		displayName: "Value",
		description: "How much moved on this line, negative for money out and positive for money in. Unlike everywhere else in this node, the sign is what says the direction here: a statement has both.",
	},
	"bankAccount.date": {
		displayName: "Date",
		description: "The day of this line. It cannot fall before the day the account was opened: Nibo accepts such a line with 204 and files nothing, so the node refuses it instead. Written by hand it has to be year-month-day — a date such as 29/07/2026 is refused rather than guessed at, because 07/12/2026 could be either month.",
	},
	"bankAccount.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"bankAccount.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "An organization usually has a handful of accounts, so one page is normally all of it",
	},
	"bankAccount.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"bankAccount.filters.conditions": {
		displayName: "Condition",
	},
	"bankAccount.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"bankAccount.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"bankAccount.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
