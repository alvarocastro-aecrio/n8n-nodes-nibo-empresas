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

	const qs: IDataObject = { $orderby: 'id', $top: 500 };
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

	return records.map(asOption).sort(byReferenceCode);
}

/**
 * One line of the chart of accounts as the editor shows it: the code next to the
 * name, because that is how an accountant finds one, and the group underneath.
 */
function asOption(record: IDataObject): INodePropertyOptions {
	const name = String(record.name ?? '').trim();
	const code = String(record.referenceCode ?? '').trim();
	const group = (record.group ?? {}) as IDataObject;
	const groupName = String(group.name ?? '').trim();

	return {
		name: code === '' ? name : `${code} · ${name}`,
		value: String(record.id ?? ''),
		description: groupName === '' ? undefined : groupName,
	};
}

/**
 * By reference code, which is the order a chart of accounts is read in —
 * `1.1.001` before `1.1.002` before `2.1.001`, never alphabetical by name.
 *
 * Sorted here rather than by the API: `$orderby=referenceCode` was not among
 * what was measured, and 22 lines is not something to page. A category the
 * organization typed itself may carry no code, and it goes last rather than
 * first, where an empty string would otherwise put it.
 */
function byReferenceCode(one: INodePropertyOptions, other: INodePropertyOptions): number {
	const code = (option: INodePropertyOptions): string =>
		option.name.includes(' · ') ? option.name.split(' · ')[0] : '';

	const [left, right] = [code(one), code(other)];
	if (left === '' || right === '') {
		return left === right ? one.name.localeCompare(other.name) : left === '' ? 1 : -1;
	}

	return left.localeCompare(right, undefined, { numeric: true });
}
