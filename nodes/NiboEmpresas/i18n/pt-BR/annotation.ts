import type { Translations } from '../localize';

/** Escopo `annotation` — 5 entradas. */
export const annotation: Translations = {
	"annotation.operation": {
		displayName: "Operation",
	},
	"annotation.operation.create": {
		name: "Create",
		description: "Write a note on a schedule, after checking that the schedule exists — which is the only moment it can be checked",
		action: "Create an annotation on a schedule",
	},
	"annotation.createNotice": {
		displayName: "An annotation cannot be read back, edited or deleted: this API only writes them, and the ID it returns opens nothing. It also does not deduplicate — running the same item again writes the note a second time, and there is no way to remove either copy. Whether an item is processed twice is entirely up to the workflow around this node.",
	},
	"annotation.scheduleId": {
		displayName: "Schedule ID",
		description: "The schedule the note is written on, credit or debit alike — one route serves both, and it is the credit one. The node reads the schedule before writing: this API accepts an annotation on a schedule that does not exist, answering 200 with an ID, and such a note can never be found again.",
		placeholder: "b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90",
	},
	"annotation.body": {
		displayName: "Text",
		description: "What the note says. Accents and URLs go through untouched. An empty text is refused here rather than by the API, which answers it with HTTP 500 \"Informe uma anotação.\".",
	},
};
