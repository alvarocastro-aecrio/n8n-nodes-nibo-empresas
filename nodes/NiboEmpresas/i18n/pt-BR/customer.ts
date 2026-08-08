import type { Translations } from '../localize';

/** Escopo `customer` — 54 entradas. */
export const customer: Translations = {
	"customer.operation": {
		displayName: "Operation",
	},
	"customer.operation.create": {
		name: "Create",
		description: "Add a customer to the organization",
		action: "Create a customer",
	},
	"customer.operation.delete": {
		name: "Delete",
		description: "Remove a customer from the organization",
		action: "Delete a customer",
	},
	"customer.operation.get": {
		name: "Get",
		description: "Retrieve one customer by ID",
		action: "Get a customer",
	},
	"customer.operation.list": {
		name: "Get Many",
		description: "Retrieve customers of the organization",
		action: "Get many customers",
	},
	"customer.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the customer as it is",
		action: "Update a customer",
	},
	"customer.customerId": {
		displayName: "Customer ID",
		description: "The ID of the customer to work on, as Nibo returns it in the ID field",
	},
	"customer.name": {
		displayName: "Name",
		description: "The registered name of the contact",
	},
	"customer.documentType": {
		displayName: "Document Type",
	},
	"customer.documentType.CNPJ": {
		name: "CNPJ",
	},
	"customer.documentType.CPF": {
		name: "CPF",
	},
	"customer.documentNumber": {
		displayName: "Document Number",
		description: "Digits only, with no dots, slashes or dashes. Optional: left empty, the contact is created with no document at all.",
		placeholder: "00000000000000",
	},
	"customer.additionalFields": {
		displayName: "Additional Fields",
		placeholder: "Add Field",
	},
	"customer.additionalFields.addressCity": {
		displayName: "Address City",
	},
	"customer.additionalFields.addressCountry": {
		displayName: "Address Country",
	},
	"customer.additionalFields.addressDistrict": {
		displayName: "Address District",
	},
	"customer.additionalFields.addressLine1": {
		displayName: "Address Line 1",
		description: "Street name",
	},
	"customer.additionalFields.addressLine2": {
		displayName: "Address Line 2",
		description: "Whatever completes the address, such as a floor or a unit",
	},
	"customer.additionalFields.addressNumber": {
		displayName: "Address Number",
		description: "House or building number, which this API keeps as a number",
	},
	"customer.additionalFields.addressState": {
		displayName: "Address State",
		placeholder: "RJ",
	},
	"customer.additionalFields.addressZipCode": {
		displayName: "Address Zip Code",
		placeholder: "20000000",
	},
	"customer.additionalFields.cellPhone": {
		displayName: "Cell Phone",
	},
	"customer.additionalFields.companyName": {
		displayName: "Company Name",
		description: "The trading name, when it differs from the registered name",
	},
	"customer.additionalFields.contactName": {
		displayName: "Contact Name",
	},
	"customer.additionalFields.email": {
		displayName: "Email",
		description: "One string holding every address, separated by commas. This API keeps the e-mails of a contact in a single field, not in a list.",
		placeholder: "billing@example.com,accounts@example.com",
	},
	"customer.additionalFields.phone": {
		displayName: "Phone",
	},
	"customer.additionalFields.webSite": {
		displayName: "Website",
	},
	"customer.updateFields": {
		displayName: "Update Fields",
		description: "The fields to change. A field left out is not touched: the contact keeps whatever is stored in Nibo. A field added and left empty is written empty, which is how a value is erased on purpose.",
		placeholder: "Add Field",
	},
	"customer.updateFields.addressCity": {
		displayName: "Address City",
	},
	"customer.updateFields.addressCountry": {
		displayName: "Address Country",
	},
	"customer.updateFields.addressDistrict": {
		displayName: "Address District",
	},
	"customer.updateFields.addressLine1": {
		displayName: "Address Line 1",
		description: "Street name",
	},
	"customer.updateFields.addressLine2": {
		displayName: "Address Line 2",
		description: "Whatever completes the address, such as a floor or a unit",
	},
	"customer.updateFields.addressNumber": {
		displayName: "Address Number",
		description: "House or building number, which this API keeps as a number",
	},
	"customer.updateFields.addressState": {
		displayName: "Address State",
		placeholder: "RJ",
	},
	"customer.updateFields.addressZipCode": {
		displayName: "Address Zip Code",
		placeholder: "20000000",
	},
	"customer.updateFields.cellPhone": {
		displayName: "Cell Phone",
	},
	"customer.updateFields.companyName": {
		displayName: "Company Name",
		description: "The trading name, when it differs from the registered name",
	},
	"customer.updateFields.contactName": {
		displayName: "Contact Name",
	},
	"customer.updateFields.documentNumber": {
		displayName: "Document Number",
		description: "Digits only, with no dots, slashes or dashes",
	},
	"customer.updateFields.documentType": {
		displayName: "Document Type",
	},
	"customer.updateFields.documentType.CNPJ": {
		name: "CNPJ",
	},
	"customer.updateFields.documentType.CPF": {
		name: "CPF",
	},
	"customer.updateFields.email": {
		displayName: "Email",
		description: "One string holding every address, separated by commas. This API keeps the e-mails of a contact in a single field, not in a list.",
		placeholder: "billing@example.com,accounts@example.com",
	},
	"customer.updateFields.name": {
		displayName: "Name",
		description: "The registered name of the contact",
	},
	"customer.updateFields.phone": {
		displayName: "Phone",
	},
	"customer.updateFields.webSite": {
		displayName: "Website",
	},
	"customer.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"customer.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "The API caps every page at 500 records, so a higher limit is collected in several pages",
	},
	"customer.filters": {
		displayName: "Filters",
		description: "The conditions a record has to meet to be returned",
		placeholder: "Add Condition",
	},
	"customer.filters.conditions": {
		displayName: "Condition",
	},
	"customer.filterCombine": {
		displayName: "Combine Conditions",
		description: "How the conditions above are joined. One operator for all of them: a mix of the two, such as (A or B) and C, is what Filter (OData) under Options stays for.",
	},
	"customer.filterCombine.and": {
		name: "And",
		description: "Return only the records that meet every condition",
	},
	"customer.filterCombine.or": {
		name: "Or",
		description: "Return the records that meet at least one of the conditions",
	},
};
