import type { Translations } from '../localize';

/** Escopo `scheduleFile` — 11 entradas. */
export const scheduleFile: Translations = {
	"scheduleFile.operation": {
		displayName: "Operation",
	},
	"scheduleFile.operation.attach": {
		name: "Attach",
		description: "Put a document that is already stored in Nibo onto a schedule, checking first that the schedule exists and confirming afterwards that the file is on it",
		action: "Attach a file to a schedule",
	},
	"scheduleFile.operation.delete": {
		name: "Delete",
		description: "Delete the document itself, which is more than taking it off this schedule: it can never be attached anywhere again",
		action: "Delete a file from a schedule",
	},
	"scheduleFile.operation.listFiles": {
		name: "Get Many",
		description: "Retrieve the documents attached to one schedule",
		action: "Get many files of a schedule",
	},
	"scheduleFile.listNotice": {
		displayName: "The url on each of these records is public: anyone holding it downloads the document without a token. Treat it as the document itself, not as a reference to it.",
	},
	"scheduleFile.attachNotice": {
		displayName: "A document belongs to one schedule at a time. Attaching a file that is already on another schedule moves it: it disappears from the first one. To have the same document on two schedules, upload it twice.",
	},
	"scheduleFile.deleteNotice": {
		displayName: "This deletes the document, not the link between it and this schedule: the file cannot be attached again anywhere, and Nibo answers any attempt with \"Arquivo não encontrado\". The stored file itself is not removed either — a download link handed out before this still serves the document afterwards.",
	},
	"scheduleFile.scheduleId": {
		displayName: "Schedule ID",
		description: "The schedule the documents belong to. A credit or a debit schedule alike: this API has a single route for both, and it is the credit one — asking the debit path answers 404 whatever the ID is.",
		placeholder: "b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90",
	},
	"scheduleFile.fileId": {
		displayName: "File ID",
		description: "The document, as File · Upload returned it or as Get Many lists it here. Nibo checks this ID and never checks the schedule it is being attached to, which is why the node asks for the schedule first.",
		placeholder: "5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1",
	},
	"scheduleFile.returnAll": {
		displayName: "Return All",
		description: "Whether to return all results or only up to a given limit",
	},
	"scheduleFile.limit": {
		displayName: "Limit",
		description: "Max number of results to return",
		hint: "A schedule carries a handful of documents, so this collection is read in a single call and the limit is applied to what came back",
	},
};
