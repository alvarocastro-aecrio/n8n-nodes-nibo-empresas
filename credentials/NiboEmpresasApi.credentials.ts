import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class NiboEmpresasApi implements ICredentialType {
	name = 'niboEmpresasApi';

	displayName = 'Nibo Empresas API';

	documentationUrl = 'https://github.com/alvarocastro-aecrio/n8n-nodes-nibo-empresas#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'The organization API token. In Nibo, open the organization, then More Options → Settings → API. The token selects the organization: every call made with it reads that organization’s books.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.nibo.com.br/empresas/v1',
			description: 'Base URL of the Nibo Empresas API. Only change this if Nibo moves the API.',
		},
	];

	// The API authenticates through the "ApiToken" header. It does not accept
	// the standard "Authorization" header.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				ApiToken: '={{$credentials.apiToken}}',
			},
		},
	};

	// Cheapest existing endpoint that requires a valid token. GET /organizations
	// also works but returns the accounting firm's whole portfolio — far too
	// heavy for a credential test.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/categories',
			qs: {
				$top: 1,
			},
		},
	};
}
