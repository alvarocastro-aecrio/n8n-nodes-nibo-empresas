import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

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

import {
	stakeholderFields,
	stakeholderOperations,
	stakeholderResources,
} from './resources/stakeholder/description';
import { executeStakeholder } from './resources/stakeholder/execute';

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
						resource: stakeholderResources.map((resource) => resource.value as string),
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
				options: stakeholderResources,
				default: 'customer',
			},
			...stakeholderOperations,
			...stakeholderFields,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
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
						// themselves off this very value.
						displayOptions: {
							show: {
								'/operation': ['list'],
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
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// Single resource family in v0.1.0; the router grows with the roadmap.
		const returnData = await executeStakeholder.call(this, resource, operation);

		return [returnData];
	}
}
