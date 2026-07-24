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

import { stakeholderFields, stakeholderOperations } from './resources/stakeholder/description';
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
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Customer',
						value: 'customer',
					},
				],
				default: 'customer',
			},
			...stakeholderOperations,
			...stakeholderFields,
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
