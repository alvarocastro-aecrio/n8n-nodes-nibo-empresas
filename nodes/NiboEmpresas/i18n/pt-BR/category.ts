import type { Translations } from '../localize';

/** Escopo `category` — 24 entradas. */
export const category: Translations = {
	"category.operation": {
		displayName: "Operation",
	},
	"category.operation.create": {
		name: "Create",
		description: "Add a line to the chart of accounts, under a group and optionally a subgroup. This cannot be undone: the API offers no way to edit or delete a category.",
		action: "Create a category",
	},
	"category.operation.get": {
		name: "Get",
		description: "Retrieve one financial category by ID",
		action: "Get a category",
	},
	"category.operation.list": {
		name: "Get Many",
		description: "Retrieve the financial categories of the organization",
		action: "Get many categories",
	},
	"category.operation.groups": {
		name: "Get Many Groups",
		description: "Retrieve the groups the chart of accounts is divided into",
		action: "Get many category groups",
	},
	"category.operation.tree": {
		name: "Get Tree",
		description: "Retrieve the whole hierarchy — groups, subgroups and the categories inside them",
		action: "Get the category tree",
	},
	"category.createNotice": {
		displayName: "Creating a category cannot be undone — this API has no way to edit or delete one. A category created by mistake can only be corrected on the Nibo screen.",
	},
	"category.categoryGroupId": {
		displayName: "Category Group Name or ID",
		description: "The group of the chart of accounts this category belongs to — the level Nibo shows above the category name. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"category.name": {
		displayName: "Name",
		description: "The name of the category, as it will read in Nibo",
	},
	"category.type": {
		displayName: "Type",
		description: "Which side of the money this category is for. It is what signs a schedule line, so it is also what decides which kind of schedule can be filed under this category at all.",
	},
	"category.type.out": {
		name: "Expense",
		description: "A category a payment is filed under",
	},
	"category.type.in": {
		name: "Revenue",
		description: "A category a receipt is filed under",
	},
	"category.additionalFields": {
		displayName: "Additional Fields",
		placeholder: "Add Field",
	},
	"category.additionalFields.subGroupId": {
		displayName: "Subgroup Name or ID",
		description: "A subgroup inside the group above, when the group has any. Subgroups exist nowhere in Get Many — only in Get Tree — so this list is read from the tree. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	},
	"category.categoryId": {
		displayName: "Category ID",
		description: "The ID of the category to read, as Nibo returns it. It is read through the list filtered by ID rather than through the route that reads one record by ID, so that Get and Get Many answer the very same record — that route drops the subgroup, and a node that answered one shape here and another there would be inventing a difference the API does not have.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"category.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"category.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "A chart of accounts is usually a few dozen lines, so one page is normally all of it",
	},
	"category.includeDeleted": {
		displayName: "Include Deleted Categories",
		description: "Whether to include the categories that were deleted in Nibo. They carry isDeleted as true, so they can be told apart from the rest.",
	},
	"category.nfseValueOnly": {
		displayName: "Only Service Invoice Categories",
		description: "Whether to narrow the tree to the categories an NFS-e amount can be composed of. Measured on 2026-07-26: it drops interest, fines and \"Outras receitas\" from the answer, and it reveals a subgroup the call without it does not show.",
	},
	"category.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"category.filters.conditions": {
		displayName: "Condition",
	},
	"category.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"category.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"category.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
