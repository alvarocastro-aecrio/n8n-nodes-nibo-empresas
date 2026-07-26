import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CREDENTIAL_NAME = 'niboEmpresasApi';
const DEFAULT_BASE_URL = 'https://api.nibo.com.br/empresas/v1';

/**
 * Which categories fit which kind of schedule.
 *
 * Not a convenience. Measured on the cobaia on 2026-07-26: a cost category on a
 * receivable answers HTTP 500 `validation_error` — *"Valor do agendamento deve
 * ser positivo"* — to someone who typed a positive number. The category's type
 * is what signs the line, so the total goes negative and the validation
 * complains about the total. Showing only the half that fits is what stops that
 * error from being reachable through the list at all.
 */
const CATEGORIES_OF: Record<string, string> = {
	creditSchedule: 'in',
	debitSchedule: 'out',
};

/** How to name the half being asked for, in a sentence a person reads */
const KIND_NAMED: Record<string, string> = {
	in: 'revenue',
	out: 'expense',
};

/**
 * The list behind the Category field of a schedule.
 *
 * It talks to the API on its own rather than through `transport/request.ts`,
 * and the reason is a signature: in `ILoadOptionsFunctions` the call is
 * `getNodeParameter(name, fallback)` — there is no item index, because there is
 * no item — while the transport calls `(name, index, fallback)`. Routing one
 * through the other would read the index as the fallback. This mode is the only
 * one where a list exists at all, so it is the only one written here.
 */
export async function loadScheduleCategories(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	// The editor hands over the parameters as they stand right now, not as they
	// were saved (DynamicNodeParametersService builds the node with
	// `parameters: currentNodeParameters`), so this follows the resource being
	// chosen rather than the one that was chosen last time.
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'The category list cannot be loaded when the token is read per item',
			{
				description:
					'A category ID belongs to one organization, so a category picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with the Category resource and put an expression in this field.',
			},
		);
	}

	const resource = String(this.getCurrentNodeParameter('resource') ?? '');
	const fits = CATEGORIES_OF[resource];

	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	// Grouped, then in the order the organization itself put them in, then by
	// name — and sorted by the server, so `order` never has to be read back.
	//
	// `order` is the field the Nibo screen writes when categories are dragged
	// about. It is null until somebody does that (all 22 of the test company's
	// are), which is why the name is the last key rather than the only one.
	//
	// `group/referenceCode` is here and reaches no screen. It is the only thing
	// that puts Receitas before Custos before Despesas before Investimento
	// before Financiamento — the sequence a chart of accounts is read in, and
	// the cash-flow statement it mirrors. Sorting the group names as text would
	// open the list on "Atividades de financiamento", which is where nobody
	// starts. (`group/order` does not exist: HTTP 500.)
	const qs: IDataObject = { $orderby: 'group/referenceCode,order,name', $top: 500 };
	if (fits !== undefined) {
		qs.$filter = `type eq '${fits}'`;
	}

	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
		method: 'GET',
		url: `${baseUrl}/categories`,
		qs,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json; charset=utf-8',
		},
		json: true,
	});

	// Detect the envelope by shape, never by the name of the collection — the
	// rule the transport has followed since /partners turned out to answer a bare
	// array too.
	const records = (
		Array.isArray(response) ? response : ((response as IDataObject)?.items ?? [])
	) as IDataObject[];

	if (records.length === 0) {
		// An empty box explains nothing, and this list has two invisible reasons
		// for being empty: it is filtered to the half that fits this kind of
		// schedule, and it belongs to whichever credential is selected above.
		// Neither is on the screen, so the emptiness has to carry them.
		const kind = KIND_NAMED[fits ?? ''] ?? '';
		throw new NodeOperationError(this.getNode(), 'Nibo answered with no categories to choose from', {
			description: `The list is always read with the credential selected above, and shows only the ${kind === '' ? 'categories' : `${kind} categories`} — the ones that fit this kind of schedule. So either that organization has none of them, or the credential is not the organization you meant. Every Nibo organization starts from the same chart of accounts, so the names alone will not tell two of them apart; read the list with the Category resource if you need to see all of them, including the other half.`,
		});
	}

	// Whatever order the server answered in is the order shown. Re-sorting here
	// would throw away `order`, which is the one key that carries a decision the
	// organization actually took.
	return records.map(asOption);
}

/**
 * One line of the chart of accounts as the editor shows it: the name, and the
 * group under it — the two things the Nibo screen itself shows.
 *
 * The reference code was in front of the name until 0.7.3 and that was a
 * mistake. It is an internal code of the standard chart of accounts, it appears
 * nowhere in Nibo's own interface, and unfamiliar numbers in front of familiar
 * names are what made a list that was working perfectly look like another
 * company's. What is not on their screen does not go on ours.
 */
function asOption(record: IDataObject): INodePropertyOptions {
	const group = (record.group ?? {}) as IDataObject;
	const groupName = String(group.name ?? '').trim();

	return {
		name: String(record.name ?? '').trim(),
		value: String(record.id ?? ''),
		description: groupName === '' ? undefined : groupName,
	};
}

