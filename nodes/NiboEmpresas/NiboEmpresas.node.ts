import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { stakeholderFields, stakeholderOperations } from './resources/stakeholder/description';
import { executeStakeholder } from './resources/stakeholder/execute';

// Thin description + router. No HTTP call and no API rule lives here: the
// cross-cutting behaviors live in transport/, the per-resource ones in
// resources/*/execute.ts.
export class NiboEmpresas implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nibo Empresas',
		name: 'niboEmpresas',
		icon: 'file:nibo.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the Nibo Empresas API',
		defaults: {
			name: 'Nibo Empresas',
		},
		inputs: ['main'],
		outputs: ['main'],
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
