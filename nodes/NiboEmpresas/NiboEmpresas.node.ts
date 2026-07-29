import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// Other community packages may bundle their own (often old) n8n-workflow as a
// runtime dependency, and Node's resolution then hands THIS node that stray
// copy — where NodeConnectionTypes may not exist yet. Reading .Main off
// undefined crashes class instantiation, which n8n reports as "Class could
// not be found". Reproduced on n8n 2.30.8 with n8n-workflow@1.30.0 planted in
// ~/.n8n/nodes/node_modules. The fallback is the wire value the enum maps to.
type MainConnection = typeof NodeConnectionTypes.Main;
const MAIN_CONNECTION: MainConnection = NodeConnectionTypes
	? NodeConnectionTypes.Main
	: ('main' as MainConnection);

import type { INodePropertyOptions } from 'n8n-workflow';

import {
	annotationFields,
	annotationOperations,
	annotationResources,
} from './resources/annotation/description';
import { executeAnnotation } from './resources/annotation/execute';
import {
	bankAccountFields,
	bankAccountOperations,
	bankAccountResources,
} from './resources/bankAccount/description';
import { executeBankAccount } from './resources/bankAccount/execute';
import { loadBankAccounts } from './resources/bankAccount/load';
import {
	bankTransferFields,
	bankTransferOperations,
	bankTransferResources,
} from './resources/bankTransfer/description';
import { executeBankTransfer } from './resources/bankTransfer/execute';
import {
	categoryFields,
	categoryOperations,
	categoryResources,
} from './resources/category/description';
import { executeCategory } from './resources/category/execute';
import {
	collectionFields,
	collectionOperations,
	collectionResources,
} from './resources/collection/description';
import { executeCollection } from './resources/collection/execute';
import { loadCollectionProfiles } from './resources/collection/load';
import {
	loadCategoryGroups,
	loadCategorySubgroups,
	loadScheduleCategories,
} from './resources/category/load';
import {
	costCenterFields,
	costCenterOperations,
	costCenterResources,
} from './resources/costCenter/description';
import { executeCostCenter } from './resources/costCenter/execute';
import { loadCostCenters } from './resources/costCenter/load';
import { fileFields, fileOperations, fileResources } from './resources/file/description';
import { executeFile } from './resources/file/execute';
import {
	scheduleFields,
	scheduleOperations,
	scheduleResources,
} from './resources/schedule/description';
import { executeSchedule } from './resources/schedule/execute';
import {
	scheduleFileFields,
	scheduleFileOperations,
	scheduleFileResources,
} from './resources/scheduleFile/description';
import { executeScheduleFile } from './resources/scheduleFile/execute';
import {
	serviceInvoiceFields,
	serviceInvoiceOperations,
	serviceInvoiceResources,
} from './resources/serviceInvoice/description';
import { executeServiceInvoice } from './resources/serviceInvoice/execute';
import { loadServiceProfiles } from './resources/serviceInvoice/load';
import {
	stakeholderFields,
	stakeholderOperations,
	stakeholderResources,
} from './resources/stakeholder/description';
import { executeStakeholder } from './resources/stakeholder/execute';
import { searchScheduleStakeholders } from './resources/stakeholder/search';
import {
	transactionFields,
	transactionOperations,
	transactionResources,
} from './resources/transaction/description';
import { executeTransaction } from './resources/transaction/execute';

/**
 * Every resource the node offers, in one alphabetical list — which since 0.8.2
 * is also a list grouped by family.
 *
 * The editor shows this list as it is declared, and it builds the **Actions** tab
 * from the same order, one heading per entry ("Contact - Employee actions") and
 * no sorting of its own — read in the n8n 2.18.5 source on 2026-07-26. Seven
 * bare names alphabetically put "Credit Schedule" between "Category" and
 * "Customer", so the tab read as a pile of unrelated things.
 *
 * Each family carries its word in the option name, and the sort below then does
 * the grouping for free: `Category` < `Contact` < `Schedule`. That is why this is
 * a prefix and not a hand-written order — the n8n linter wants these
 * alphabetical, and this way it still is.
 */
const RESOURCES: INodePropertyOptions[] = [
	...stakeholderResources,
	...scheduleResources,
	...categoryResources,
	...costCenterResources,
	...transactionResources,
	...bankAccountResources,
	...bankTransferResources,
	...fileResources,
	...scheduleFileResources,
	...annotationResources,
	...collectionResources,
	...serviceInvoiceResources,
].sort((one, other) => one.name.localeCompare(other.name));

/** Which handler each resource belongs to — the whole of what the node knows about them */
type Handler = (
	this: IExecuteFunctions,
	resource: string,
	operation: string,
) => Promise<INodeExecutionData[]>;

const HANDLERS: Record<string, Handler> = {
	...Object.fromEntries(
		stakeholderResources.map((resource) => [resource.value as string, executeStakeholder]),
	),
	...Object.fromEntries(
		scheduleResources.map((resource) => [resource.value as string, executeSchedule]),
	),
	...Object.fromEntries(
		categoryResources.map((resource) => [resource.value as string, executeCategory]),
	),
	...Object.fromEntries(
		costCenterResources.map((resource) => [resource.value as string, executeCostCenter]),
	),
	...Object.fromEntries(
		transactionResources.map((resource) => [resource.value as string, executeTransaction]),
	),
	...Object.fromEntries(
		bankAccountResources.map((resource) => [resource.value as string, executeBankAccount]),
	),
	...Object.fromEntries(
		bankTransferResources.map((resource) => [resource.value as string, executeBankTransfer]),
	),
	...Object.fromEntries(fileResources.map((resource) => [resource.value as string, executeFile])),
	...Object.fromEntries(
		scheduleFileResources.map((resource) => [resource.value as string, executeScheduleFile]),
	),
	...Object.fromEntries(
		annotationResources.map((resource) => [resource.value as string, executeAnnotation]),
	),
	...Object.fromEntries(
		collectionResources.map((resource) => [resource.value as string, executeCollection]),
	),
	...Object.fromEntries(
		serviceInvoiceResources.map((resource) => [resource.value as string, executeServiceInvoice]),
	),
};

// Thin description + router. No HTTP call and no API rule lives here: the
// cross-cutting behaviors live in transport/, the per-resource ones in
// resources/*/execute.ts.
export class NiboEmpresas implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nibo Empresas',
		name: 'niboEmpresas',
		icon: { light: 'file:nibo.svg', dark: 'file:nibo.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the Nibo Empresas API',
		defaults: {
			name: 'Nibo Empresas',
		},
		usableAsTool: true,
		inputs: [MAIN_CONNECTION],
		outputs: [MAIN_CONNECTION],
		credentials: [
			{
				name: 'niboEmpresasApi',
				required: true,
				// A credential cannot be chosen per item — the field takes no
				// expression — so in the per-item mode it is neither required nor
				// shown, and the token comes from the parameter below instead.
				//
				// `resource` is named here for a second reason, and it is not
				// decoration: the editor draws the credential picker immediately
				// before the LAST parameter any credential names in its
				// displayOptions.show (ParameterInputList.vue, indexToShowSlotAt,
				// n8n 2.18.5). With `authMode` alone the picker landed above the
				// very field that decides whether a credential is used at all.
				// Naming `resource` puts it under Authentication, where the node
				// reads in order. Every resource has to be listed — one missing
				// would be a resource with no credential — and a test keeps the
				// two in step.
				displayOptions: {
					show: {
						authMode: ['credential'],
						resource: RESOURCES.map((resource) => resource.value as string),
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				// NOT named `authentication`: the n8n editor reserves that exact
				// name as the "main auth field", removes it from the parameter
				// list and redraws it inside the credentials block, where every
				// option has to be backed by a credential. The per-item mode is
				// backed by none — that is its whole point — so under that name
				// the option is there but selecting it does nothing. Measured
				// against n8n 2.18.5, in shouldDisplayNodeParameter().
				name: 'authMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Credential',
						value: 'credential',
						description: 'Use one stored credential for the whole node',
					},
					{
						name: 'API Token (Per Item)',
						value: 'field',
						description: 'Read the token from the field below, resolved for each input item',
					},
				],
				default: 'credential',
			},
			{
				displayName: 'API Token',
				name: 'apiToken',
				type: 'string',
				typeOptions: { password: true },
				required: true,
				default: '',
				description:
					'The organization API token to use for this item. Normally an expression reading it from the incoming item, which is what lets a single node walk a whole portfolio of organizations. In this API the token is the organization: each item reads the books of its own token.',
				displayOptions: {
					show: {
						authMode: ['field'],
					},
				},
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: RESOURCES,
				default: 'customer',
			},
			...stakeholderOperations,
			...scheduleOperations,
			...categoryOperations,
			...costCenterOperations,
			...transactionOperations,
			...bankAccountOperations,
			...bankTransferOperations,
			...fileOperations,
			...scheduleFileOperations,
			...annotationOperations,
			...collectionOperations,
			...serviceInvoiceOperations,
			...stakeholderFields,
			...scheduleFields,
			...categoryFields,
			...costCenterFields,
			...transactionFields,
			...bankAccountFields,
			...bankTransferFields,
			...fileFields,
			...scheduleFileFields,
			...annotationFields,
			...collectionFields,
			...serviceInvoiceFields,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						// Unlocking a closed accounting period is a decision for a person,
						// not a side effect of an update — the API itself accepts it
						// without a word, measured on 2026-07-27. Opt-in, at the end,
						// like every operational adjustment (§4.1).
						displayName: 'Allow Moving the Lock Back',
						name: 'allowMovingLockBack',
						type: 'boolean',
						default: false,
						description:
							'Whether a Balance Lock Date earlier than the current one may be sent. Moving the lock back unlocks an accounting period that was closed, so the node refuses it unless this is on.',
						displayOptions: {
							show: {
								'/resource': ['bankAccount'],
								'/operation': ['update'],
							},
						},
					},
					{
						// The ceiling of the wait above, and it is **not** how long the
						// node takes: it returns the moment the note reaches a final
						// state. Measured on 2026-07-29 across five notes, from 1.3 s to
						// 123.1 s — and the Alvaro reports up to five minutes. 300 s is
						// his decision, taken after a recommendation of 120 s was
						// withdrawn for sitting below the slowest sample there is.
						displayName: 'Authorization Timeout',
						name: 'authorizationTimeout',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 300,
						description:
							'How long to follow a note before handing it back, in seconds. It is a ceiling, not a wait: the node returns as soon as the city hall answers, so a generous number costs nothing on a note that authorizes in five seconds. Reached, the node returns the record as it stands, saying the note was issued and is not authorized yet — never that anything failed.',
						displayOptions: {
							show: {
								'/resource': ['serviceInvoice'],
								'/operation': ['issue'],
							},
						},
					},
					{
						displayName: 'Fail on Incomplete Results',
						name: 'failOnIncomplete',
						type: 'boolean',
						default: true,
						description:
							'Whether to fail when the result may be incomplete, instead of returning the records with a warning on the last item. Records written while the pages are being read can slip past the cursor, which shows up as a record count that changes mid-scan or as fewer records than the server reported. Left out, the scan fails: a list that may have lost records is the sort of thing a workflow deletes by.',
						// The only way records can slip past the cursor is a scan of
						// the whole collection, page after page.
						displayOptions: {
							show: {
								'/returnAll': [true],
							},
						},
					},
					{
						displayName: 'Filter (OData)',
						name: 'filter',
						type: 'string',
						default: '',
						placeholder: "contains(name,'LTDA')",
						description:
							"OData expression sent as $filter, written by hand, for what the conditions cannot say — a nested group such as (A or B) and C. Fill it in and it becomes the whole filter: the conditions leave the screen and leave the request with them. Accented text needs no special treatment, e.g. contains(name,'SERVIÇOS'). An apostrophe does: it has to be doubled, as in contains(name,'D''ALESSANDRO'), which is exactly what the conditions do for you.",
						// Offered on every scan, with no mode to switch first: adding
						// it here IS the switch, and the conditions in the body hide
						// themselves off this very value. Every operation that walks a
						// collection has to be named here — a scan missing from this list
						// is a scan with no way to write an expression by hand.
						displayOptions: {
							show: {
								'/operation': ['list', 'listBalances'],
							},
						},
					},
					{
						displayName: 'Interval Between Requests',
						name: 'requestInterval',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 1000,
						description:
							'How long to wait, in milliseconds, between two calls to the API. It applies between input items and between the pages of one scan, never before the first call. Leave it out and the node waits a second; set it to 0 to send the calls back to back.',
					},
					{
						// On by default, which is the safe behaviour being the default —
						// the same choice Fail on Incomplete Results has carried since
						// 0.4.3. Whoever issues in a loop and does not want to wait for
						// any of them switches it off and reads the notes later with Get.
						displayName: 'Wait for Authorization',
						name: 'waitForAuthorization',
						type: 'boolean',
						default: true,
						description:
							'Whether to follow a note until the city hall has answered and hand back the final record — with its number, its PDF and its XML when authorized. Switched off, the node returns the note as it was born, usually still queued.',
						displayOptions: {
							show: {
								'/resource': ['serviceInvoice'],
								'/operation': ['issue'],
							},
						},
					},
				],
			},
		],
	};

	/**
	 * The lists the editor fills in by asking the API, rather than from a literal
	 * in this file. Declared here because that is where n8n looks them up by name
	 * — a `loadOptionsMethod` on a field is a key into this object.
	 */
	methods = {
		loadOptions: {
			loadBankAccounts,
			loadCategoryGroups,
			loadCollectionProfiles,
			loadCategorySubgroups,
			loadCostCenters,
			loadScheduleCategories,
			loadServiceProfiles,
		},
		/**
		 * The searches, which are the lists too big to hand over whole. A
		 * `searchListMethod` on a field is a key into this object, exactly as a
		 * `loadOptionsMethod` is a key into the one above.
		 */
		listSearch: {
			searchScheduleStakeholders,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const handler = HANDLERS[resource];
		if (handler === undefined) {
			throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
		}

		return [await handler.call(this, resource, operation)];
	}
}
