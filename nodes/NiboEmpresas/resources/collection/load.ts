import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * The list behind the Collection Profile field of a charge.
 *
 * It talks to the API on its own rather than through `transport/request.ts`, for
 * the signature reason the other loaders carry: in `ILoadOptionsFunctions` the
 * call is `getNodeParameter(name, fallback)` — no item index, because there is
 * no item — while the transport calls `(name, index, fallback)`.
 *
 * This field is the one that most needed a list. A profile ID comes from exactly
 * one route and appears in no screen of Nibo that a person would think to look
 * at, so without this the only way to fill the field was to run Get Many
 * Profiles first and copy a GUID across.
 */
export async function loadCollectionProfiles(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	// The editor hands over the parameters as they stand right now, not as they
	// were saved (DynamicNodeParametersService builds the node with
	// `parameters: currentNodeParameters`).
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'The collection profile list cannot be loaded when the token is read per item',
			{
				description:
					'A profile belongs to one organization, so one picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with Collection - Get Many Profiles and put an expression in this field.',
			},
		);
	}

	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
		method: 'GET',
		url: `${baseUrl}/public/collections-profiles`,
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
		// An empty box explains nothing, and this one has a cause that is nowhere
		// on screen: the organization simply cannot issue charges. It is not a
		// setting in Nibo either — a profile ties a contracted bank provider to
		// the company.
		throw new NodeOperationError(
			this.getNode(),
			'This organization has no collection profile, so it cannot issue charges',
			{
				description:
					'A charge is issued through a profile, which ties a bank provider to the organization, and the API refuses a creation without one. It is set up in Nibo with the provider contracted — there is no route that creates one. The list is always read with the credential selected above.',
			},
		);
	}

	return records.map((record) => {
		// What each profile actually issues through, which is the one thing that
		// tells two of them apart when both are called something like "padrão".
		const methods = (record.paymentMethods ?? []) as IDataObject[];
		const how = methods
			.map((method) => [method.paymentForm, method.provider].filter(Boolean).join(' via '))
			.filter((one) => one !== '')
			.join(', ');

		return {
			name: String(record.name ?? '').trim(),
			value: String(record.id ?? ''),
			description: how === '' ? undefined : how,
		};
	});
}
