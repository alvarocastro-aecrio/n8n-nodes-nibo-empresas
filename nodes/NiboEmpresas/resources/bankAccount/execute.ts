import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { niboReadBack } from '../../transport/save';
import { onlyTheDay } from '../schedule/normalize';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { bankAccountBalanceFilterFieldTypes, bankAccountFilterFieldTypes } from './description';

const ACCOUNTS = '/accounts';

/**
 * The balances, and they are a collection rather than a field: the accounts and
 * their balances are two views of this API, with two DTOs that share hardly a
 * property name between them.
 */
const BALANCES = '/accounts/views/balance';

/**
 * The paging key — and this collection is the one that does it the ordinary
 * way, which is exactly why it needs saying.
 *
 * Its neighbours in this version do not: `/costcenters` pages by
 * `costCenterId`, `/payments` and `/receipts` by `entryId`, and `id` answers
 * HTTP 500 on all three. Here it is the mirror image — `$orderby=id` answers
 * 200 and `$orderby=accountId` is the 500. Measured on 2026-07-27. Four
 * collections, three different keys: this is why the transport takes the key as
 * a parameter instead of assuming one.
 */
const ACCOUNT_ORDER_BY = 'id';

/**
 * And the balance view is the mirror of the mirror: here `id` and `name` are
 * both HTTP 500 — neither property is on this DTO — and the key is
 * `accountId`. Measured on 2026-07-27.
 *
 * It matters more here than elsewhere, because on this collection **`$skip`
 * without `$orderby` is a 500 of its own** (*"O Nibo se comportou de forma
 * inesperada."*). Two ways to lose the same scan, and the transport walks past
 * both because it takes the key as a parameter and always sends it.
 */
const BALANCE_ORDER_BY = 'accountId';

/**
 * The bank accounts, read only.
 *
 * No normalizer: what the API answers needs no repairing. The record is wide —
 * two dozen fields about automation, reconciliation and Open Finance — and every
 * one of them travels as it came, because none of them is this node's business.
 */
export async function executeBankAccount(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'bankAccount') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	// The one operation of this node that does not walk the items one at a time:
	// the API's format is a batch, so the items ARE the batch. See below.
	if (operation === 'importBankStatement') {
		try {
			return [{ json: await importBankStatement.call(this) }];
		} catch (error) {
			if (this.continueOnFail()) {
				return [{ json: { error: (error as Error).message } }];
			}
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error);
		}
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation === 'create') {
				returnData.push({ json: await createAccount.call(this, i), pairedItem: { item: i } });
				continue;
			}

			if (operation === 'update') {
				returnData.push({
					json: await updateAccount.call(this, i, options),
					pairedItem: { item: i },
				});
				continue;
			}

			if (operation !== 'list' && operation !== 'listBalances') {
				// There is no Get to offer: `GET /accounts/{id}` is a 404 — one account
				// is read through Get Many filtered by its ID. Deleting does not exist
				// in this API at all, and moving money between two accounts is the
				// Bank Transfer resource.
				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" is not supported`,
					{ itemIndex: i },
				);
			}

			// Two collections, and everything about the request differs: the path, the
			// paging key and the set of fields a condition can name.
			const balances = operation === 'listBalances';
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

			const { records, warning } = await niboListRequest.call(
				this,
				i,
				balances ? BALANCES : ACCOUNTS,
				balances ? BALANCE_ORDER_BY : ACCOUNT_ORDER_BY,
				{
					returnAll,
					limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
					filter: listFilter.call(
						this,
						i,
						options,
						balances ? bankAccountBalanceFilterFieldTypes : bankAccountFilterFieldTypes,
					),
					failOnIncomplete: failOnIncomplete.call(this, i, options),
					interval,
				},
			);

			records.forEach((record, index) => {
				// A result that may be incomplete says so on its last item, so a
				// workflow reading only the data still sees it.
				const json =
					warning !== undefined && index === records.length - 1
						? { ...record, _niboPaginationWarning: warning }
						: record;

				returnData.push({ json, pairedItem: { item: i } });
			});
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { error: (error as Error).message },
					pairedItem: { item: i },
				});
				continue;
			}
			throw error instanceof NodeApiError
				? error
				: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
	}

	return returnData;
}

/**
 * Opens an account, and then goes and checks the one thing this API gets wrong.
 *
 * **The POST stores the opening date one day early.** A bare `2026-07-01` came
 * back as `2026-06-30T00:00:00Z`, while the very same shape on a PUT is stored
 * exactly — both measured on 2026-07-27. So the account is read back, and when
 * the stored day is not the asked one, a corrective PUT (the whole record, with
 * the right date) puts it where the user pointed. The day you pick is the day
 * that stays.
 *
 * The read-back goes through the list — `GET /accounts/{id}` is a 404 — and the
 * refusals sit before the POST, because afterwards there is no undo: `DELETE`
 * is a 404 and `isArchived` on a PUT is ignored with a 204. What this creates
 * is permanent.
 */
async function createAccount(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = String(this.getNodeParameter('name', itemIndex, '') ?? '').trim();
	if (name === '') {
		throw new NodeOperationError(this.getNode(), 'This account has no name', {
			itemIndex,
			description:
				'Nothing was sent, and here that matters more than usual: an account this API creates cannot be deleted or archived through it. Give the account the name it should carry in Nibo.',
		});
	}

	const askedDate = onlyTheDay(
		String(this.getNodeParameter('dateOfOpenBalance', itemIndex, '') ?? ''),
	);

	const body: IDataObject = {
		name,
		openBalance: Number(this.getNodeParameter('openBalance', itemIndex, 0)) || 0,
	};
	if (askedDate !== '') {
		body.dateOfOpenBalance = askedDate;
	}

	const answer = await niboApiRequest.call(this, itemIndex, 'POST', ACCOUNTS, {}, body);
	const id =
		typeof answer === 'string' ? answer.trim() : String((answer as IDataObject)?.data ?? '').trim();

	if (id === '') {
		throw new NodeOperationError(this.getNode(), 'Nibo did not say what it created', {
			itemIndex,
			description:
				'The account may or may not exist now: the API answered the creation with a body this node could not read as an ID. Check the accounts in Nibo before sending it again — a second send would create a second permanent account.',
		});
	}

	let record = await readAccountBack.call(this, itemIndex, id);

	// The repair. Compared as days, because that is what both sides are.
	if (askedDate !== '' && record !== undefined) {
		const storedDate = onlyTheDay(String(record.dateOfOpenBalance ?? ''));

		if (storedDate !== askedDate) {
			await niboApiRequest.call(
				this,
				itemIndex,
				'PUT',
				`${ACCOUNTS}/${encodeURIComponent(id)}`,
				{},
				// The whole record, never a fragment: a partial PUT is a 500 on this
				// route, and an omitted field is a field zeroed.
				{ ...record, dateOfOpenBalance: askedDate },
			);

			record = await readAccountBack.call(this, itemIndex, id);
			const repaired = onlyTheDay(String(record?.dateOfOpenBalance ?? ''));

			if (record !== undefined && repaired !== askedDate) {
				throw new NodeOperationError(
					this.getNode(),
					`The account was created, but its opening date could not be set to ${askedDate}`,
					{
						itemIndex,
						description: `The account "${name}" exists with the ID "${id}" and Nibo keeps storing its opening date as ${repaired}. **Do not create it again** — fix the date with the Update operation or on Nibo's screen.`,
					},
				);
			}
		}
	}

	if (record === undefined) {
		// The wording is the point: the account exists. Saying anything that reads
		// as failure makes a workflow create it twice, and twice is forever here.
		throw new NodeOperationError(
			this.getNode(),
			'The account was created, but it could not be read back',
			{
				itemIndex,
				description: `Nibo answered the creation with the ID "${id}", so the account does exist. **Do not send it again** — a second send would create a second permanent account. Read it with Get Many, filtering by that ID.`,
			},
		);
	}

	return record;
}

/** The shape a day arrives in after `onlyTheDay`, comparable as text */
const A_PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Changes an account the only way this API can take a change without losing
 * something: read the record, merge on top, send **the whole of it** back.
 *
 * Two measurements of 2026-07-27 shape it. A PUT whose body omits
 * `balanceLockDate` **clears the lock** — 204, not a word — so the merge is
 * what keeps a closed period closed through an update about something else.
 * And a partial PUT (just a name) is a raw SQL 500, so the fragment is never
 * an option anyway.
 *
 * The lock has one more rule of its own: the API accepts moving it **back**
 * as quietly as moving it forward, and backwards is what unlocks a period an
 * accountant already closed. Forward — the closing automation — passes;
 * backward is refused unless the option says a person decided it.
 */
async function updateAccount(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
): Promise<IDataObject> {
	const id = recordId.call(this, 'bankAccountId', itemIndex);
	const asked = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;

	// Normalized first, so days are days before anything is compared or sent.
	const changes: IDataObject = {};
	if (typeof asked.name === 'string' && asked.name.trim() !== '') {
		changes.name = asked.name.trim();
	}
	if (asked.openBalance !== undefined) {
		changes.openBalance = Number(asked.openBalance) || 0;
	}
	for (const field of ['dateOfOpenBalance', 'balanceLockDate']) {
		const day = onlyTheDay(String(asked[field] ?? ''));
		if (day !== '') {
			changes[field] = day;
		}
	}

	if (Object.keys(changes).length === 0) {
		throw new NodeOperationError(this.getNode(), 'This update was given no field to change', {
			itemIndex,
			description:
				'Add at least one field under Update Fields. The node will not send an update that rewrites the record with itself — in this API that is a write like any other.',
		});
	}

	const current = await readAccountBack.call(this, itemIndex, id);
	if (current === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`Nibo has no bank account with the ID "${id}"`,
			{
				itemIndex,
				description:
					'The update was not sent: without the stored record there is nothing to merge onto. An account ID belongs to one organization, so an ID from another one is simply not here.',
			},
		);
	}

	// The one guard of this form. Forward closes a month; backward unlocks one.
	if (typeof changes.balanceLockDate === 'string') {
		const currentLock = onlyTheDay(String(current.balanceLockDate ?? ''));
		const allowed = options.allowMovingLockBack === true;

		if (currentLock !== '' && (changes.balanceLockDate as string) < currentLock && !allowed) {
			throw new NodeOperationError(
				this.getNode(),
				`This update would move the balance lock back, from ${currentLock} to ${changes.balanceLockDate}`,
				{
					itemIndex,
					description:
						'Nothing was written. The lock is what keeps a closed accounting period closed, and this API moves it back as quietly as it moves it forward — measured, and not a word either way. Unlocking a period is a decision for a person: if that is what you mean to do, add the "Allow Moving the Lock Back" option at the end of the node and run again.',
				},
			);
		}
	}

	const merged = { ...current, ...changes };

	await niboApiRequest.call(
		this,
		itemIndex,
		'PUT',
		`${ACCOUNTS}/${encodeURIComponent(id)}`,
		{},
		merged,
	);

	const confirmed = await readAccountBack.call(this, itemIndex, id);
	if (confirmed === undefined) {
		throw new NodeOperationError(this.getNode(), 'The update could not be confirmed', {
			itemIndex,
			description: `Nibo answered the update but returned no record when it was read back. Check the account "${id}" in Nibo.`,
		});
	}

	// Each asked field, compared as what it is: a day with a day, the rest as
	// text. A change the API answered 204 to and did not apply is a failure —
	// this API has been measured doing exactly that, on this very route.
	const missing = Object.entries(changes).filter(([field, value]) => {
		const stored = confirmed[field];
		if (typeof value === 'string' && A_PLAIN_DAY.test(value)) {
			return onlyTheDay(String(stored ?? '')) !== value;
		}
		return String(stored ?? '').trim() !== String(value ?? '').trim();
	});

	if (missing.length > 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Nibo did not apply the update to: ${missing.map(([field]) => field).join(', ')}`,
			{
				itemIndex,
				description:
					'The API answered the update without an error, but reading the account back shows those fields unchanged. It has been measured doing this — isArchived, for one, is accepted with a 204 and ignored. Nothing else in the record was touched.',
			},
		);
	}

	return confirmed;
}

/** One account, read through the list this API offers instead of a get-by-id */
async function readAccountBack(
	this: IExecuteFunctions,
	itemIndex: number,
	id: string,
): Promise<IDataObject | undefined> {
	return await niboReadBack.call(this, itemIndex, ACCOUNTS, ACCOUNT_ORDER_BY, `id eq ${id}`);
}

/** One line of the statement, in the shape the API takes it */
interface IStatementLine {
	description: string;
	value: number;
	date: string;
}

/**
 * The shapes a date may arrive in, and it is a short list on purpose.
 *
 * `29/07/2026` is what a Brazilian spreadsheet writes, and this API answers it
 * with **204 and files nothing**. So it has to be refused here — and `07/12/2026`
 * has to be refused with it, because nothing in the value says whether it is the
 * 7th of December or the 12th of July, and a node that guessed would file money
 * in the wrong month without anybody noticing.
 */
const A_DAY = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

/**
 * Sends a bank statement to the reconciliation queue of an account.
 *
 * **This operation aggregates**, and it is the only one of this node that does:
 * one input item is one line, and the whole run becomes a single call, because a
 * batch is the shape the API takes. Decided by Alvaro on 2026-07-27 — the
 * alternative would leave standing the code node that does this joining today.
 *
 * `Description`, `Value` and `Date` are therefore read **per item** —
 * `getNodeParameter(name, i)` resolves an expression for that item — while
 * `Bank Account` and `Batch Name` are read off the **first**, because a batch has
 * one of each. Which is where two of the refusals come from: items asking for
 * different accounts, and the per-item token mode, where a batch would span two
 * organizations.
 *
 * **And every check happens before the request**, because there is no check
 * possible after it. The API answers 204 with an empty body no matter what, it
 * accepts a batch **half way** in silence — a line dated before the account was
 * opened simply vanishes — and there is nothing to read back: every route that
 * would show the queue is a 404, and the one observable sign,
 * `pendingReconciliationCount` on the balance view, counts transactions rather
 * than batches and was measured to take **more than 150 seconds** to move. No n8n
 * execution waits for that.
 */
async function importBankStatement(this: IExecuteFunctions): Promise<IDataObject> {
	const items = this.getInputData();

	// An account ID belongs to one organization, so a batch cannot belong to two.
	// The same rule the account list has followed since 0.10.0.
	if (this.getNodeParameter('authMode', 0, 'credential') === 'field') {
		throw new NodeOperationError(
			this.getNode(),
			'A bank statement cannot be imported when the token is read per item',
			{
				description:
					'Nothing was sent. This operation gathers every input item into one batch, and a batch goes to one account of one organization — while the per-item token mode exists precisely to walk several. Use the credential mode here, and split the organizations across separate executions or a loop.',
			},
		);
	}

	const accountId = String(this.getNodeParameter('accountId', 0, '') ?? '').trim();
	if (accountId === '') {
		throw new NodeOperationError(this.getNode(), 'This import names no bank account', {
			description:
				'Nothing was sent. Pick an account in the Bank Account field, or put an ID there — read the IDs of an organization with Get Many on this same resource.',
		});
	}

	const batchName = String(this.getNodeParameter('batchName', 0, '') ?? '').trim();

	const account = await accountBeingFiledInto.call(this, accountId);
	const openedOn = onlyTheDay(String(account.dateOfOpenBalance ?? ''));

	const transactions = items.map((_item, index) =>
		statementLine.call(this, index, accountId, openedOn),
	);

	if (transactions.length === 0) {
		throw new NodeOperationError(this.getNode(), 'This import has no line to send', {
			description:
				'Nothing was sent. Every input item is one line of the statement, and there were none — this API answers an empty batch with 204 and does nothing, which would look exactly like an import that worked.',
		});
	}

	await niboApiRequest.call(
		this,
		0,
		'POST',
		`${ACCOUNTS}/${encodeURIComponent(accountId)}/bankstatement`,
		{},
		{ transactions, batchName },
	);

	// What was sent, how much of it, and a sentence that does not claim more than
	// the API said. A bare `success: true` would be a lie of exactly the kind this
	// node exists not to tell: 204 is not a confirmation, it is an acknowledgement.
	return {
		accountId,
		batchName,
		transactionCount: transactions.length,
		transactions,
		_niboReconciliationNotice:
			'Nibo answered with HTTP 204 and an empty body, which is what it answers whether it filed every line or none. The lines go to the reconciliation queue, not to the ledger: no entry appears under Transaction - Payment or Transaction - Receipt and no balance changes. There is no route in this API that reads the queue back — the only sign is pendingReconciliationCount on Get Balances, and it counts transactions rather than batches and can take several minutes to move.',
	};
}

/**
 * The account this batch is being filed into, read for the one property that
 * decides whether a line survives.
 *
 * `GET /accounts/{id}` is a 404, so it is read through the list filtered by ID —
 * bare, which is how this API compares an ID column.
 */
async function accountBeingFiledInto(
	this: IExecuteFunctions,
	accountId: string,
): Promise<IDataObject> {
	const { records } = await niboListRequest.call(this, 0, ACCOUNTS, ACCOUNT_ORDER_BY, {
		returnAll: false,
		limit: 1,
		filter: `id eq ${accountId}`,
		// One record read by ID cannot be an incomplete scan of a collection.
		failOnIncomplete: false,
	});

	if (records.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Nibo has no bank account with the ID "${accountId}"`,
			{
				description:
					'Nothing was sent. An account ID belongs to one organization, so an ID from another one is simply not here. This route answers an unknown account with HTTP 500 "Conta corrente não encontrada" — the one thing it does refuse outright — but the account has to be read first anyway, for the day it was opened.',
			},
		);
	}

	return records[0];
}

/**
 * One item turned into one line, refused by name when it cannot be.
 *
 * **The index is in every message on purpose.** A batch of two hundred lines and
 * a sentence saying "an invalid date" is not information — and the line cannot be
 * found afterwards, because a batch this node refuses is a batch that was never
 * sent, and a line the API swallows is gone for good.
 */
function statementLine(
	this: IExecuteFunctions,
	itemIndex: number,
	accountId: string,
	openedOn: string,
): IStatementLine {
	const itsAccount = String(this.getNodeParameter('accountId', itemIndex, '') ?? '').trim();
	if (itsAccount !== '' && itsAccount !== accountId) {
		throw new NodeOperationError(
			this.getNode(),
			`Item ${itemIndex} names a different bank account, and one batch goes to one account`,
			{
				itemIndex,
				description: `Nothing was sent. The account is read from the first item — "${accountId}" — and this one asks for "${itsAccount}". A statement belongs to the account it came from, so a batch cannot be split between two: send them as two executions, or split the items before this node.`,
			},
		);
	}

	const raw = String(this.getNodeParameter('date', itemIndex, '') ?? '').trim();
	if (!A_DAY.test(raw)) {
		throw new NodeOperationError(
			this.getNode(),
			`Item ${itemIndex} carries a date this node cannot read: "${raw}"`,
			{
				itemIndex,
				description:
					'Nothing was sent, and that is the point: this API answers a date it cannot read with HTTP 204 and **drops the line without a word**, so a batch comes back looking imported and is not. The date has to be year-month-day, such as 2026-07-27. A date written 29/07/2026 is refused rather than converted, because 07/12/2026 would be either the 7th of December or the 12th of July and nothing in the value says which.',
			},
		);
	}

	const date = onlyTheDay(raw);

	// The rule this whole operation is built around. The comparison is textual and
	// that is enough: both sides are year-month-day, where alphabetical order and
	// calendar order are the same thing.
	if (openedOn !== '' && date < openedOn) {
		throw new NodeOperationError(
			this.getNode(),
			`Item ${itemIndex} is dated ${date}, before the account was opened`,
			{
				itemIndex,
				description: `Nothing was sent. The account's opening balance is dated **${openedOn}**, and Nibo accepts a line before that with HTTP 204 and then **files nothing** — the batch would come back looking imported with this line missing, and no route in this API could show you that. The date to compare with belongs to the account, not to the statement: it is the dateOfOpenBalance field of Get Many. Either move this line's date forward or import it into another account.`,
			},
		);
	}

	const value = amountOf.call(this, itemIndex);

	return {
		description: String(this.getNodeParameter('description', itemIndex, '') ?? ''),
		value,
		date,
	};
}

/**
 * The amount of one line. The sign is the direction here — negative is money out
 * — which is the one place in this node where it carries meaning rather than
 * being an artefact of which route answered.
 */
function amountOf(this: IExecuteFunctions, itemIndex: number): number {
	const given = this.getNodeParameter('value', itemIndex, 0);
	const text = String(given ?? '').trim();

	// The box on the screen is a number box, so most of the time there is nothing
	// to do. The text path is the other way in: an expression carrying whatever
	// the incoming line held, and in this country that is written `-10,50`.
	const written = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text;
	const value = Number(written);

	if (written === '' || !Number.isFinite(value)) {
		throw new NodeOperationError(
			this.getNode(),
			`Item ${itemIndex} carries an amount this node cannot read: "${given}"`,
			{
				itemIndex,
				description:
					'Nothing was sent. The amount of a statement line is a number, negative for money out and positive for money in. A value such as 1.234,56 is refused rather than guessed at: read one way it is a thousand and read the other it is one.',
			},
		);
	}

	return value;
}
