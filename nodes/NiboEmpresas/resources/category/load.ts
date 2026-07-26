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
 * The families of category a schedule cannot be filed under, whatever the API
 * answers when you try.
 *
 * Nibo owns 28 of the 50 categories an organization starts with — the ones
 * nobody can edit, filled in by Nibo itself when a receipt carries interest, a
 * tax is withheld or an amount has nowhere else to go. Measured on the cobaia on
 * 2026-07-26, one representative of each family, created for real and looked at
 * on Nibo's own screen:
 *
 * | `groupType` | Family | What happens |
 * |---|---|---|
 * | 1 | Descontos Concedidos / Recebidos | The API refuses it: *"Categoria de juros, multa ou desconto invalida"* — measured on both sides |
 * | 3 | The fourteen "Retido sobre…" | Accepted, then **broken on the Nibo screen**: one category inside the schedule and another, without a value, outside it |
 * | 7 | Outras receitas | The same, and this is the one that caught it — a schedule of Alvaro's, in the browser |
 *
 * The other three automatic families are **not** here, and each earned its place
 * on the list the same way — created for real and looked at on the Nibo screen:
 * interest (2), fines (4) and the "Pagamento de … Retido" family (5, the ones
 * nobody can edit) all read correctly there. So the rule is not "automatic
 * categories are out": it is these three families, measured one at a time.
 *
 * A category left out of the list is not out of reach: the field takes an ID
 * from an expression, exactly as it did before there was a list at all.
 */
const NOT_FOR_A_SCHEDULE = [1, 3, 7];

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
		// The half that fits, and the automatic families that cannot be scheduled
		// at all — both on the server, in this one call. `groupType ne …` was
		// measured to answer 200 on 2026-07-26; this API accepts nothing like it
		// on every field, so the operator is evidence and not an assumption.
		qs.$filter = [
			`type eq '${fits}'`,
			...NOT_FOR_A_SCHEDULE.map((family) => `groupType ne ${family}`),
		].join(' and ');
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
			description: `The list is always read with the credential selected above, and shows only the ${kind === '' ? 'categories' : `${kind} categories`} — the ones that fit this kind of schedule, leaving out the automatic ones Nibo fills in itself, which a schedule cannot be filed under. So either that organization has none of them, or the credential is not the organization you meant. Every Nibo organization starts from the same chart of accounts, so the names alone will not tell two of them apart; read the list with the Category resource if you need to see all of them, including the other half.`,
		});
	}

	// Whatever order the server answered in is the order shown. Re-sorting here
	// would throw away `order`, which is the one key that carries a decision the
	// organization actually took.
	return records.map(asOption);
}

/**
 * The list behind the Category Group field of the creation form.
 *
 * `GET /schedules/categories/groups` — five groups on the test company, the
 * level `GET /categories` never shows on its own. Ordered by `referenceCode`,
 * which is what puts Receitas before Custos before Despesas: the sequence a
 * chart of accounts is read in, and the same key the category list has sorted
 * by since 0.7.3.
 */
export async function loadCategoryGroups(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	refuseWhenTokenIsPerItem.call(
		this,
		'The group list cannot be loaded when the token is read per item',
		'A group ID belongs to one organization, so a group picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with the Category resource, operation Get Many Groups, and put an expression in this field.',
	);

	const response = await niboLoadRequest.call(this, '/schedules/categories/groups', {
		$orderby: 'referenceCode',
		$top: 500,
	});

	const records = recordsOf(response);
	if (records.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Nibo answered with no groups to choose from', {
			description:
				'The list is always read with the credential selected above, so either that organization has no chart of accounts at all — which a Nibo organization is not created without — or the credential is not the organization you meant.',
		});
	}

	// The order the server answered in is the order shown. The reference code
	// itself stays off the screen: it appears nowhere in Nibo's own interface,
	// and 0.7.3 measured what unfamiliar numbers in front of familiar names do
	// to somebody reading the list.
	return records.map((record) => ({
		name: String(record.name ?? '').trim(),
		value: String(record.id ?? ''),
	}));
}

/**
 * The list behind the Subgroup field of the creation form.
 *
 * Read from the tree, because the tree is the only place a subgroup exists:
 * measured on 2026-07-26, the three subgroups of the test company appear in no
 * answer of `GET /categories` — only the `subgroupId` and `subgroupName` of the
 * categories that sit inside them.
 *
 * It offers the subgroups of the chosen group and of no other. A subgroup
 * belongs to one group, so any other pairing is a creation the screen would be
 * offering and the API refusing.
 */
export async function loadCategorySubgroups(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	refuseWhenTokenIsPerItem.call(
		this,
		'The subgroup list cannot be loaded when the token is read per item',
		'A subgroup ID belongs to one organization, so a subgroup picked here would be right for one of them and wrong for every other one this node walks. Read the ID for each organization with the Category resource, operation Get Tree, and put an expression in this field.',
	);

	const group = String(this.getCurrentNodeParameter('categoryGroupId') ?? '').trim();
	if (group === '') {
		throw new NodeOperationError(this.getNode(), 'Choose the category group first', {
			description:
				'A subgroup belongs to one group, so the list can only be read once the group above is chosen. Choosing it fills this list in.',
		});
	}

	const tree = await niboLoadRequest.call(this, '/schedules/categories/tree', {});

	// A bare array, one element per group, each with `children` — and a subgroup
	// is a child carrying `isSubgroup: true` and children of its own.
	const chosen = (Array.isArray(tree) ? (tree as IDataObject[]) : []).find(
		(node) => String(node.id ?? '') === group,
	);
	const subgroups = ((chosen?.children ?? []) as IDataObject[]).filter(
		(child) => child?.isSubgroup === true,
	);

	if (subgroups.length === 0) {
		throw new NodeOperationError(this.getNode(), 'That group has no subgroup', {
			description:
				'Most groups of a Nibo chart of accounts have none — on a new organization only the tax ones do. Leave this field out and the category is created directly under the group.',
		});
	}

	return subgroups.map((subgroup) => ({
		name: String(subgroup.name ?? '').trim(),
		value: String(subgroup.id ?? ''),
	}));
}

/**
 * The mode where no list of this resource can work, and the sentence that has
 * to say why.
 *
 * The shallow reason is that a list is loaded with the credential and there is
 * none in this mode. The one that matters is that every ID here — category,
 * group, subgroup — belongs to **one organization**, so a value picked on the
 * screen would be right for one company of a portfolio and wrong for all the
 * others. Each caller names the operation that reads its own ID.
 */
function refuseWhenTokenIsPerItem(
	this: ILoadOptionsFunctions,
	message: string,
	description: string,
): void {
	// The editor hands over the parameters as they stand right now, not as they
	// were saved (DynamicNodeParametersService builds the node with
	// `parameters: currentNodeParameters`).
	if (this.getCurrentNodeParameter('authMode') === 'field') {
		throw new NodeOperationError(this.getNode(), message, { description });
	}
}

/** One GET made the way a list has to make it — see the note on the loader above */
async function niboLoadRequest(
	this: ILoadOptionsFunctions,
	endpoint: string,
	qs: IDataObject,
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
		method: 'GET',
		url: `${baseUrl}${endpoint}`,
		qs,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json; charset=utf-8',
		},
		json: true,
	});
}

/**
 * The records of an answer, whatever shape it arrived in.
 *
 * Detected by shape and never by the name of the collection — the rule the
 * transport has followed since `/partners` turned out to answer a bare array
 * too, and the tree turned out to answer one as well.
 */
function recordsOf(response: unknown): IDataObject[] {
	return (
		Array.isArray(response) ? response : ((response as IDataObject)?.items ?? [])
	) as IDataObject[];
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

