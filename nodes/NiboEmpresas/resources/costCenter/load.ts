import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * The list behind the Cost Center field of a schedule's apportionment.
 *
 * It talks to the API on its own rather than through `transport/request.ts`,
 * and the reason is a signature: in `ILoadOptionsFunctions` the call is
 * `getNodeParameter(name, fallback)` — there is no item index, because there is
 * no item — while the transport calls `(name, index, fallback)`. Routing one
 * through the other would read the index as the fallback. This mode is the only
 * one where a list exists at all, so it is the only one written here.
 */
export async function loadCostCenters(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	// The editor hands over the parameters as they stand right now, not as they
	// were saved (DynamicNodeParametersService builds the node with
	// `parameters: currentNodeParameters`).
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'The cost center list cannot be loaded when the token is read per item',
			{
				description:
					'A cost center ID belongs to one organization, so one picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with the Cost Center resource and put an expression in this field.',
			},
		);
	}

	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
		method: 'GET',
		url: `${baseUrl}/costcenters`,
		// By description, which is the only thing a person reads here — and it was
		// measured to sort on 2026-07-26, which on this API is not a given.
		qs: { $orderby: 'description', $top: 500 },
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json; charset=utf-8',
		},
		json: true,
	});

	// Detect the envelope by shape, never by the name of the collection — the
	// rule the transport has followed since `/partners` turned out to answer a
	// bare array too.
	const records = (
		Array.isArray(response) ? response : ((response as IDataObject)?.items ?? [])
	) as IDataObject[];

	if (records.length === 0) {
		// An empty box explains nothing, and this one has a reason nobody can see:
		// an organization starts with no cost centre at all. It is a thing somebody
		// creates, not a thing Nibo fills in — unlike the chart of accounts.
		throw new NodeOperationError(
			this.getNode(),
			'Nibo answered with no cost centers to choose from',
			{
				description:
					'A Nibo organization starts with none — unlike the chart of accounts, which arrives filled in — so this list is empty until somebody creates one. Create them with the Cost Center resource, or in Nibo, and leave this field out until then: a schedule does not need an apportionment. The list is always read with the credential selected above.',
			},
		);
	}

	return records.map((record) => {
		const code = String(record.externalCode ?? '').trim();

		return {
			name: String(record.description ?? '').trim(),
			value: String(record.costCenterId ?? ''),
			// The external code is the one thing that tells two cost centres of the
			// same name apart, and it is the organization's own code rather than an
			// internal one of Nibo's — which is what 0.7.3 measured to be the
			// difference between a helpful subtitle and a confusing one.
			description: code === '' ? undefined : code,
		};
	});
}
