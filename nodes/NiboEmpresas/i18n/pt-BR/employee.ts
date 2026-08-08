import type { Translations } from '../localize';

/** Escopo `employee` — 28 entradas. */
export const employee: Translations = {
	"employee.operation": {
		displayName: "Operation",
	},
	"employee.operation.create": {
		name: "Create",
		description: "Add an employee to the organization",
		action: "Create an employee",
	},
	"employee.operation.delete": {
		name: "Delete",
		description: "Remove an employee from the organization",
		action: "Delete an employee",
	},
	"employee.operation.get": {
		name: "Get",
		description: "Retrieve one employee by ID",
		action: "Get an employee",
	},
	"employee.operation.list": {
		name: "Get Many",
		description: "Retrieve employees of the organization",
		action: "Get many employees",
	},
	"employee.operation.update": {
		name: "Update",
		description: "Change the fields given below, leaving every other field of the employee as it is",
		action: "Update an employee",
	},
	"employee.employeeId": {
		displayName: "Employee ID",
		description: "The ID of the employee to work on, as Nibo returns it in the ID field",
	},
	"employee.documentType": {
		displayName: "Document Type",
	},
	"employee.documentType.CPF": {
		name: "CPF",
	},
	"employee.updateFields": {
		displayName: "Update Fields",
		description: "The fields to change. A field left out is not touched: the contact keeps whatever is stored in Nibo. A field added and left empty is written empty, which is how a value is erased on purpose.",
		placeholder: "Add Field",
	},
	"employee.updateFields.addressCity": {
		displayName: "Address City",
	},
	"employee.updateFields.addressCountry": {
		displayName: "Address Country",
	},
	"employee.updateFields.addressDistrict": {
		displayName: "Address District",
	},
	"employee.updateFields.addressLine1": {
		displayName: "Address Line 1",
		description: "Street name",
	},
	"employee.updateFields.addressLine2": {
		displayName: "Address Line 2",
		description: "Whatever completes the address, such as a floor or a unit",
	},
	"employee.updateFields.addressNumber": {
		displayName: "Address Number",
		description: "House or building number, which this API keeps as a number",
	},
	"employee.updateFields.addressState": {
		displayName: "Address State",
		placeholder: "RJ",
	},
	"employee.updateFields.addressZipCode": {
		displayName: "Address Zip Code",
		placeholder: "20000000",
	},
	"employee.updateFields.cellPhone": {
		displayName: "Cell Phone",
	},
	"employee.updateFields.companyName": {
		displayName: "Company Name",
		description: "The trading name, when it differs from the registered name",
	},
	"employee.updateFields.contactName": {
		displayName: "Contact Name",
	},
	"employee.updateFields.documentNumber": {
		displayName: "Document Number",
		description: "Digits only, with no dots, slashes or dashes",
	},
	"employee.updateFields.documentType": {
		displayName: "Document Type",
	},
	"employee.updateFields.documentType.CPF": {
		name: "CPF",
	},
	"employee.updateFields.email": {
		displayName: "Email",
		description: "One string holding every address, separated by commas. This API keeps the e-mails of a contact in a single field, not in a list.",
		placeholder: "billing@example.com,accounts@example.com",
	},
	"employee.updateFields.name": {
		displayName: "Name",
		description: "The registered name of the contact",
	},
	"employee.updateFields.phone": {
		displayName: "Phone",
	},
	"employee.updateFields.webSite": {
		displayName: "Website",
	},
};
