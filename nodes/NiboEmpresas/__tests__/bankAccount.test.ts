import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeBankAccount } from '../resources/bankAccount/execute';
import { niboListRequest } from '../transport/paginate';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const GUID = '95f309e3-4b64-45df-8c57-ae4a1dbeedd0';

function context(parameters: IDataObject, itemCount = 1) {
	return {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

function optionsSentToTransport(): IDataObject {
	return listRequest.mock.calls[0][3] as unknown as IDataObject;
}

beforeEach(() => {
	listRequest.mockReset();
	listRequest.mockResolvedValue({ records: [], count: 0 });
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The bank accounts, and only the reading of them.
 *
 * This resource is here for one reason: **a settlement is refused without an
 * account** — `POST /schedules/debit/{id}/payments` with no `accountId` answers
 * 500 *"Conta bancária não encontrada."* — and the node had nowhere to get one.
 * The full Account resource (balances, transfers, bank statements) is item 6 of
 * the roadmap and is deliberately still out.
 */
describe('executeBankAccount — Get Many', () => {
	it('reads the collection', async () => {
		await executeBankAccount.call(context({ returnAll: true }), 'bankAccount', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts');
	});

	/**
	 * And here the key is `id` — which is worth a test precisely because the two
	 * collections this version sits between do it the other way: `/costcenters`
	 * pages by `costCenterId` and `/payments` by `entryId`, and `id` is a 500 on
	 * both. On `/accounts` it is the reverse: `id` answers 200 and `accountId`
	 * is the 500. Measured on 2026-07-27.
	 */
	it('pages by id, which is this collection and not the neighbouring ones', async () => {
		await executeBankAccount.call(context({ returnAll: true }), 'bankAccount', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('id');
		expect(listRequest.mock.calls[0][2]).not.toBe('accountId');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeBankAccount.call(
			context({ returnAll: false, limit: 4 }),
			'bankAccount',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 4,
			failOnIncomplete: true,
		});
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeBankAccount.call(context({ returnAll: true }, 3), 'bankAccount', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('hands back the records as the API answered them', async () => {
		listRequest.mockResolvedValue({
			records: [{ id: GUID, name: 'Conta corrente', type: 'BankAccount' }],
			count: 1,
		});

		const items = await executeBankAccount.call(
			context({ returnAll: true }),
			'bankAccount',
			'list',
		);

		expect(items[0].json).toEqual({ id: GUID, name: 'Conta corrente', type: 'BankAccount' });
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeBankAccount.call(context({}), 'payment', 'list')).rejects.toThrow(
			/payment/,
		);
	});

	/**
	 * One operation, because that is all this version needs and all that was
	 * measured to work: `GET /accounts/{id}` is a 404, and creating, editing or
	 * transferring belongs to the Account slice that is still ahead.
	 */
	it.each(['get', 'create', 'update', 'delete'])(
		'refuses "%s", which this cut does not offer',
		async (operation) => {
			await expect(
				executeBankAccount.call(context({}), 'bankAccount', operation),
			).rejects.toThrow(new RegExp(operation));
		},
	);
});

describe('executeBankAccount — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[]) {
		return context({ returnAll: true, filters: { conditions } });
	}

	it('searches the name ignoring case', async () => {
		await executeBankAccount.call(
			withConditions([{ field: 'name', operator: 'containsIgnoreCase', value: 'CORRENTE' }]),
			'bankAccount',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(name),'corrente')");
	});

	it('writes the ID bare, like every ID column of this API', async () => {
		await executeBankAccount.call(
			withConditions([{ field: 'id', operator: 'eq', guidValue: GUID }]),
			'bankAccount',
			'list',
		);

		expect(filterSent()).toBe(`id eq ${GUID}`);
	});

	it('filters the archived ones out or in', async () => {
		await executeBankAccount.call(
			withConditions([{ field: 'isArchived', operator: 'eq', booleanValue: false }]),
			'bankAccount',
			'list',
		);

		expect(filterSent()).toBe('isArchived eq false');
	});

	it('fails the item on isDeleted, which is a 500 on this view', async () => {
		await expect(
			executeBankAccount.call(
				withConditions([{ field: 'isDeleted', operator: 'eq', booleanValue: false }]),
				'bankAccount',
				'list',
			),
		).rejects.toThrow(/isDeleted/);
	});
});

/**
 * The list behind the account field of a settlement.
 *
 * Same shape as every other list of this node, and the same refusal in the
 * per-item token mode — an account ID belongs to one organization.
 */
describe('loadBankAccounts', () => {
	const ACCOUNTS = [
		{ id: 'a', name: 'Conta corrente', bankNumber: 341, isArchived: false },
		{ id: 'b', name: 'Caixinha', bankNumber: 0, isArchived: false },
	];

	let request: jest.Mock;

	function loadContext(parameters: IDataObject, items: IDataObject[] = ACCOUNTS) {
		request = jest.fn().mockResolvedValue({ items, count: items.length });

		return {
			getCurrentNodeParameter: (name: string) => parameters[name],
			getNode: () => NODE,
			getCredentials: jest.fn().mockResolvedValue({ baseUrl: '' }),
			helpers: { httpRequestWithAuthentication: request },
		} as never;
	}

	it('reads the accounts by name, with the credential', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		const list = await loadBankAccounts.call(loadContext({ authMode: 'credential' }));

		expect(request.mock.calls[0][0]).toBe('niboEmpresasApi');
		expect(request.mock.calls[0][1].url).toContain('/accounts');
		expect(request.mock.calls[0][1].qs.$orderby).toBe('name');
		expect(list.map((option) => option.value)).toEqual(['a', 'b']);
	});

	/**
	 * An archived account is one somebody put away on purpose. Offering it on
	 * the form that files money into an account would be offering the one answer
	 * its owner already said no to — and `isArchived eq false` was measured to
	 * answer 200, so it costs nothing to leave them out on the server.
	 */
	it('leaves the archived accounts out, on the server', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		await loadBankAccounts.call(loadContext({ authMode: 'credential' }));

		expect(request.mock.calls[0][1].qs.$filter).toBe('isArchived eq false');
	});

	it('refuses in the per-item token mode, and points at the resource instead', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		const failure = loadBankAccounts.call(loadContext({ authMode: 'field' }));

		await expect(failure).rejects.toThrow(/per item/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/Bank Account/),
		});
		expect(request).not.toHaveBeenCalled();
	});

	/**
	 * The emptiness that matters most in this whole version: an organization can
	 * genuinely have no bank account — the test company had none — and without
	 * one **no settlement is possible at all**. So the message says what to do,
	 * not just that the list is empty.
	 */
	it('explains an empty answer, because without an account no settlement is possible', async () => {
		const { loadBankAccounts } = await import('../resources/bankAccount/load');
		const failure = loadBankAccounts.call(loadContext({ authMode: 'credential' }, []));

		await expect(failure).rejects.toThrow(/no bank account/i);
		await expect(failure).rejects.toMatchObject({
			description: expect.stringMatching(/settle|Nibo/i),
		});
	});
});

describe('NiboEmpresas — Bank Account on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forAccounts(name: string): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('bankAccount'),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	it('opens the menu, being the first name alphabetically', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names[0]).toBe('Bank Account');
		expect(names).toEqual([...names].sort());
	});

	it('is named in the credential like every other resource', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('bankAccount');
	});

	it('offers the one operation this cut measured', () => {
		expect(optionValues(forAccounts('operation'))).toEqual(['list']);
		expect(forAccounts('operation')?.default).toBe('list');
	});

	/** The fields of one row of this resource's condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (forAccounts('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(['id', 'isArchived', 'isVirtual', 'name'].sort());
	});

	/**
	 * `type` is left off on purpose, and it is the one absence that is not a 500:
	 * `type eq 'BankAccount'` answers 200. But one value seen is not an
	 * enumeration, and a closed list of a set nobody has counted would offer
	 * answers the API may not have. It goes on the menu the day the set is
	 * measured.
	 */
	it('leaves type off, because one value seen is not a closed list', () => {
		expect(optionValues(conditionFields().find((one) => one.name === 'field'))).not.toContain(
			'type',
		);
	});
});
