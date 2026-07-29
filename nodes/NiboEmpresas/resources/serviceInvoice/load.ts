import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * The list behind the Service Profile field of a note.
 *
 * It talks to the API on its own rather than through `transport/request.ts`,
 * for the signature reason every other loader here carries: in
 * `ILoadOptionsFunctions` the call is `getNodeParameter(name, fallback)` — no
 * item index, because there is no item — while the transport calls
 * `(name, index, fallback)`.
 *
 * 🔴 **The field this list exists for is the one a wrong answer cannot be taken
 * back on.** A profile decides the service the note declares, the tax it
 * charges and the remarks printed on it — bank details and a Pix key, usually —
 * and undoing that is a cancellation at the city hall. So the list does not show
 * the name alone: the service code and the ISS rate travel next to it, because
 * two profiles of one company are often named alike and differ exactly there.
 */
export async function loadServiceProfiles(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	// The editor hands over the parameters as they stand right now, not as they
	// were saved (DynamicNodeParametersService builds the node with
	// `parameters: currentNodeParameters`).
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'The service profile list cannot be loaded when the token is read per item',
			{
				description:
					'A profile belongs to one organization, so one picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with Service Invoice - Get Many Service Profiles and put an expression in this field.',
			},
		);
	}

	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
		method: 'GET',
		url: `${baseUrl}/nfse/serviceprofiles`,
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
		// on screen. Measured on the test company: the route answers 200 with
		// `count: 0`, not a 403 and not a 404.
		throw new NodeOperationError(
			this.getNode(),
			'This organization does not issue NFS-e, so it has no service profile to choose from',
			{
				description:
					'A note is issued through a service profile, and there is no route that creates one: it depends on a valid digital certificate and on a profile approved by the city hall, both set up in Nibo. Until there is one, Service Invoice - Issue has nothing to issue with. The list is always read with the credential selected above.',
			},
		);
	}

	return records.map((record) => {
		// What tells two profiles of one company apart, and what the note carries:
		// which service it declares and how much ISS it charges.
		const code = String(record.cityServiceCode ?? '').trim();
		const iss = record.issAliquot;
		const parts = [
			code === '' ? '' : `Service code ${code}`,
			iss === undefined || iss === null ? '' : `ISS ${String(iss)}%`,
		].filter((part) => part !== '');

		return {
			name: String(record.name ?? '').trim(),
			value: String(record.id ?? ''),
			description: parts.length === 0 ? undefined : parts.join(' · '),
		};
	});
}
