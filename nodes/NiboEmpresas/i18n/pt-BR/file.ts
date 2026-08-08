import type { Translations } from '../localize';

/** Escopo `file` — 10 entradas. */
export const file: Translations = {
	"file.operation": {
		displayName: "Operation",
	},
	"file.operation.download": {
		name: "Download",
		description: "Fetch a stored document back, into the binary field of the item",
		action: "Download a file",
	},
	"file.operation.upload": {
		name: "Upload",
		description: "Store a document in Nibo and get its ID back, without attaching it to anything yet",
		action: "Upload a file",
	},
	"file.operation.uploadAndAttach": {
		name: "Upload and Attach",
		description: "Store a document and put it on a schedule in one operation, confirming afterwards that it is there",
		action: "Upload a file and attach it to a schedule",
	},
	"file.uploadNotice": {
		displayName: "Whoever has the ID of a file stored here can download the document with no token: the link Nibo publishes for it is public. Do not upload anything that may not be read by someone holding the link.",
	},
	"file.binaryProperty": {
		displayName: "Input Binary Field",
		description: "The binary field of the incoming item holding the document. The file never comes from disk — it is whatever the previous node put on the item, which is what a node in the n8n verification programme is allowed to read.",
	},
	"file.scheduleId": {
		displayName: "Schedule ID",
		description: "The schedule the document goes onto, credit or debit alike — this API has one route for both, and it is the credit one. The node asks Nibo for this schedule before uploading anything: a schedule that does not exist is accepted by the attach without a word, and the document would be left in storage where no route of this API can find it again.",
		placeholder: "b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90",
	},
	"file.fileId": {
		displayName: "File ID",
		description: "The ID Upload returned, or the fileId of an attachment as Schedule - File lists it. There is no route that lists the files of an organization, so an ID that was never written down cannot be found again.",
		placeholder: "5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1",
	},
	"file.outputBinaryProperty": {
		displayName: "Put Output File in Field",
		description: "The binary field of the outgoing item the document is placed in",
	},
	"file.fileName": {
		displayName: "File Name",
		description: "What the document is called: the name Nibo files it under when uploading, and the name the binary field gets when downloading. Left empty, the name the file already carries is used.",
		placeholder: "invoice-2026-07.pdf",
	},
};
