import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import { NiboEmpresas } from '../NiboEmpresas.node';
import { executeBankTransfer } from '../resources/bankTransfer/execute';
import { niboListRequest } from '../transport/paginate';
import { niboApiRequest } from '../transport/request';

jest.mock('../transport/paginate');
jest.mock('../transport/request');
jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	sleep: jest.fn().mockResolvedValue(undefined),
}));

const listRequest = niboListRequest as jest.MockedFunction<typeof niboListRequest>;
const apiRequest = niboApiRequest as jest.MockedFunction<typeof niboApiRequest>;

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const TRANSFER = '95f309e3-4b64-45df-8c57-ae4a1dbeedd0';
const ORIGIN = '2efffcd0-8730-4348-86da-6d9a95be6149';

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
	apiRequest.mockReset();
	apiRequest.mockResolvedValue(undefined);
	(sleep as jest.MockedFunction<typeof sleep>).mockClear();
});

/**
 * The transfers, which are a resource because the API made them one.
 *
 * `GET /accounts/transfer` and `DELETE /accounts/transfer/{id}` are in no
 * documentation at all — not Nibo's, not this project's catalogue, which knew
 * only the `POST`. They were found on 2026-07-27 by a 500 that said
 * *"Transferência não encontrada"* where a 404 was expected: a 404 says the
 * route is not there, and that sentence says it is and the ID is wrong.
 *
 * A record is **three top-level fields** — `id`, `originEntry`, `destinyEntry` —
 * with two whole entries nested inside. Nothing an account carries is on it, and
 * that is why this is a resource of its own rather than an operation of Bank
 * Account.
 */
describe('executeBankTransfer — Get Many', () => {
	it('reads the collection that no documentation mentions', async () => {
		await executeBankTransfer.call(context({ returnAll: true }), 'bankTransfer', 'list');

		expect(listRequest.mock.calls[0][1]).toBe('/accounts/transfer');
	});

	/**
	 * `id` is the key here, and it is the only field of the three that can be
	 * one: `date`, `value`, `createDate`, `transferId` and `originEntryId` are all
	 * HTTP 500, because none of them is a top-level property of this DTO.
	 */
	it('pages by id, the only top-level field that sorts', async () => {
		await executeBankTransfer.call(context({ returnAll: true }), 'bankTransfer', 'list');

		expect(listRequest.mock.calls[0][2]).toBe('id');
	});

	it('forwards Return All, the limit and the strict scan like every other scan', async () => {
		await executeBankTransfer.call(
			context({ returnAll: false, limit: 3 }),
			'bankTransfer',
			'list',
		);

		expect(optionsSentToTransport()).toMatchObject({
			returnAll: false,
			limit: 3,
			failOnIncomplete: true,
		});
	});

	/**
	 * The same entry is worth −123,45 here and +123,45 in `/payments`. It is the
	 * third time this project meets the pattern, and the node forwards the sign as
	 * it came: inventing a rule of its own would be a fourth convention.
	 */
	it('hands back the nested entries with their signs untouched', async () => {
		listRequest.mockResolvedValue({
			records: [
				{
					id: TRANSFER,
					originEntry: { value: -123.45, account: { id: ORIGIN } },
					destinyEntry: { value: 123.45 },
				},
			],
			count: 1,
		});

		const items = await executeBankTransfer.call(
			context({ returnAll: true }),
			'bankTransfer',
			'list',
		);

		expect((items[0].json.originEntry as IDataObject).value).toBe(-123.45);
		expect((items[0].json.destinyEntry as IDataObject).value).toBe(123.45);
	});

	it('hands each input item its own index down to the transport', async () => {
		await executeBankTransfer.call(context({ returnAll: true }, 3), 'bankTransfer', 'list');

		expect(listRequest.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
	});

	it('refuses a resource it does not know', async () => {
		await expect(executeBankTransfer.call(context({}), 'bankAccount', 'list')).rejects.toThrow(
			/bankAccount/,
		);
	});

	it.each(['get', 'update'])('refuses "%s", which this API has no route for', async (operation) => {
		await expect(
			executeBankTransfer.call(context({}), 'bankTransfer', operation),
		).rejects.toThrow(new RegExp(operation));
	});
});

/**
 * The filters go by the nested path, because that is where the fields are. The
 * OData builder has written a path with a `/` since 0.5.0 and five resources
 * already filter that way — what is new here is the depth: three levels, against
 * the two of `document/number`.
 */
describe('executeBankTransfer — the filter it sends', () => {
	function filterSent(): unknown {
		return optionsSentToTransport().filter;
	}

	function withConditions(conditions: IDataObject[]) {
		return context({ returnAll: true, filters: { conditions } });
	}

	it('filters by the account the money left, three levels down', async () => {
		await executeBankTransfer.call(
			withConditions([{ field: 'originEntry/account/id', operator: 'eq', guidValue: ORIGIN }]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe(`originEntry/account/id eq ${ORIGIN}`);
	});

	it('filters by the account the money reached', async () => {
		await executeBankTransfer.call(
			withConditions([{ field: 'destinyEntry/account/id', operator: 'eq', guidValue: ORIGIN }]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe(`destinyEntry/account/id eq ${ORIGIN}`);
	});

	it('filters by the date of the origin entry', async () => {
		await executeBankTransfer.call(
			withConditions([{ field: 'originEntry/date', operator: 'ge', dateValue: '2026-07-27' }]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe('originEntry/date ge 2026-07-27');
	});

	/**
	 * The description of a transfer arrives in `identifier`. There is no
	 * `description` field on the record at all — not nested, not on `/payments`
	 * — which is the sort of thing only a measurement tells you.
	 */
	it('searches the description where the API keeps it, in identifier', async () => {
		await executeBankTransfer.call(
			withConditions([
				{ field: 'originEntry/identifier', operator: 'containsIgnoreCase', value: 'APORTE' },
			]),
			'bankTransfer',
			'list',
		);

		expect(filterSent()).toBe("contains(tolower(originEntry/identifier),'aporte')");
	});

	it.each(['date', 'value', 'createDate', 'transferId', 'originEntryId'])(
		'fails the item on "%s", a top-level name that is a 500 here',
		async (field) => {
			await expect(
				executeBankTransfer.call(
					withConditions([{ field, operator: 'eq', value: 'x' }]),
					'bankTransfer',
					'list',
				),
			).rejects.toThrow(new RegExp(field));
		},
	);
});

/**
 * Undoing a transfer, which really does undo it: the record leaves the
 * collection and the two entries it created go with it, so the balances of both
 * accounts return to what they were.
 */
describe('executeBankTransfer — Delete', () => {
	it('deletes through the route the 500 gave away', async () => {
		await executeBankTransfer.call(
			context({ transferId: TRANSFER }),
			'bankTransfer',
			'delete',
		);

		expect(apiRequest.mock.calls[0][1]).toBe('DELETE');
		expect(apiRequest.mock.calls[0][2]).toBe(`/accounts/transfer/${TRANSFER}`);
	});

	/**
	 * Unlike the delete of 0.10.0, there is no second thing to name: this really
	 * removes the resource of the screen, rather than reopening something else.
	 */
	it('answers deleted, which is what every Delete of this node answers', async () => {
		const items = await executeBankTransfer.call(
			context({ transferId: TRANSFER }),
			'bankTransfer',
			'delete',
		);

		expect(items[0].json).toEqual({ id: TRANSFER, deleted: true });
	});

	it('refuses an empty ID before it can become a request on the collection', async () => {
		await expect(
			executeBankTransfer.call(context({ transferId: '  ' }), 'bankTransfer', 'delete'),
		).rejects.toThrow(/no record ID/i);

		expect(apiRequest).not.toHaveBeenCalled();
	});
});

describe('NiboEmpresas — Bank Transfer on the screen', () => {
	const description = new NiboEmpresas().description;

	function property(name: string) {
		return description.properties.find((prop) => prop.name === name);
	}

	function forTransfers(name: string, operation = 'list'): INodeProperties | undefined {
		return description.properties.find(
			(prop) =>
				prop.name === name &&
				((prop.displayOptions?.show?.resource ?? []) as string[]).includes('bankTransfer') &&
				((prop.displayOptions?.show?.operation ?? [operation]) as string[]).includes(operation),
		);
	}

	function optionValues(field: INodeProperties | undefined): string[] {
		return ((field?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value as string,
		);
	}

	/**
	 * Right after Bank Account, which is where the eye looks for it — and it
	 * matters more here than it would elsewhere, because a community node has no
	 * search in its Actions tab and cannot be given one.
	 */
	it('sits next to Bank Account on the menu', () => {
		const names = (property('resource')?.options as INodePropertyOptions[]).map(
			(option) => option.name,
		);

		expect(names).toEqual([...names].sort());
		expect(names[names.indexOf('Bank Account') + 1]).toBe('Bank Transfer');
	});

	it('is named in the credential, without which it would have none', () => {
		const [credential] = description.credentials ?? [];

		expect(credential.displayOptions?.show?.resource).toContain('bankTransfer');
	});

	it('offers the operations this slice measured', () => {
		expect(optionValues(forTransfers('operation'))).toEqual(['delete', 'list']);
		expect(forTransfers('operation')?.default).toBe('list');
	});

	/** The fields of one row of this resource's condition builder */
	function conditionFields(): INodeProperties[] {
		const collections = (forTransfers('filters')?.options ?? []) as Array<{
			name: string;
			values: INodeProperties[];
		}>;

		return collections.find((collection) => collection.name === 'conditions')?.values ?? [];
	}

	it('offers only the nested paths the API was measured to filter on', () => {
		const field = conditionFields().find((one) => one.name === 'field');

		expect(optionValues(field).sort()).toEqual(
			[
				'destinyEntry/account/id',
				'id',
				'originEntry/account/id',
				'originEntry/date',
				'originEntry/identifier',
				'originEntry/value',
			].sort(),
		);
	});

	it('never offers the top-level names that answer 500', () => {
		const offered = optionValues(conditionFields().find((one) => one.name === 'field'));

		for (const name of ['date', 'value', 'createDate', 'transferId', 'originEntryId']) {
			expect(offered).not.toContain(name);
		}
	});

	it('asks for the transfer ID on Delete, and only there', () => {
		const id = forTransfers('transferId', 'delete');

		expect(id?.type).toBe('string');
		expect(id?.displayOptions?.show?.operation).toEqual(['delete']);
	});
});
