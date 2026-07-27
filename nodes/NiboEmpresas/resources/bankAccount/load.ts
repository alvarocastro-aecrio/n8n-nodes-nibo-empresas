import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * The list behind the account field of a settlement.
 *
 * It talks to the API on its own rather than through `transport/request.ts`,
 * and the reason is a signature: in `ILoadOptionsFunctions` the call is
 * `getNodeParameter(name, fallback)` — there is no item index, because there is
 * no item — while the transport calls `(name, index, fallback)`. Routing one
 * through the other would read the index as the fallback.
 */
export async function loadBankAccounts(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	// The editor hands over the parameters as they stand right now, not as they
	// were saved (DynamicNodeParametersService builds the node with
	// `parameters: currentNodeParameters`).
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'The bank account list cannot be loaded when the token is read per item',
			{
				description:
					'An account ID belongs to one organization, so one picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with the Bank Account resource and put an expression in this field.',
			},
		);
	}

	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
		method: 'GET',
		url: `${baseUrl}/accounts`,
		qs: {
			$orderby: 'name',
			// An archived account is one somebody put away on purpose. Offering it
			// on the form that files money into an account would be offering the
			// one answer its owner already said no to. Measured to answer 200, so
			// it costs nothing to leave them out on the server rather than in the
			// browser.
			$filter: 'isArchived eq false',
			$top: 500,
		},
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
		// The emptiness that matters most in this version. An organization can
		// genuinely have no account — the test company had none — and without one
		// **no settlement is possible at all**: the API refuses it with
		// "Conta bancária não encontrada." So the message says what to do rather
		// than that the box is empty.
		throw new NodeOperationError(
			this.getNode(),
			'Nibo answered with no bank account to choose from',
			{
				description:
					'An organization can have none at all, and then nothing can be settled: this API refuses a settlement without an account. Create one in Nibo, or check that the account you meant is not archived — archived ones are deliberately left off this list. The list is always read with the credential selected above.',
			},
		);
	}

	return records.map((record) => {
		const bank = Number(record.bankNumber ?? 0);

		return {
			name: String(record.name ?? '').trim(),
			value: String(record.id ?? ''),
			// The bank code is the one thing that tells two accounts of the same
			// name apart, and it is the organization's own datum rather than an
			// internal one of Nibo's — the difference 0.7.3 measured between a
			// helpful subtitle and a confusing one. A `0` means no bank at all
			// (petty cash), so it is not shown.
			description: Number.isFinite(bank) && bank > 0 ? `Bank ${bank}` : undefined,
		};
	});
}
