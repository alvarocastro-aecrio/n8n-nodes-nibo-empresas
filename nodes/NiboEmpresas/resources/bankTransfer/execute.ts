import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import { niboListRequest } from '../../transport/paginate';
import { niboApiRequest } from '../../transport/request';
import { onlyTheDay } from '../schedule/normalize';
import { failedItem } from '../shared/failure';
import { listFilter } from '../shared/filter';
import { failOnIncomplete, recordId, requestInterval } from '../shared/options';
import { bankTransferFilterFieldTypes } from './description';

/**
 * The collection, the creation and the delete all live on this one path — and
 * two of the three are in no documentation anywhere. See the resource
 * description for how they were found.
 */
const TRANSFERS = '/accounts/transfer';

/**
 * The paging key, and the fifth this node has had to learn: the stakeholders
 * page by `id`, the schedules by `scheduleId`, the cost centres by
 * `costCenterId`, the settled entries by `entryId`, and here it is `id` again.
 *
 * Not by luck: a transfer has **three** top-level fields, and `id` is the only
 * one of them that could ever be a sort key. `date`, `value`, `createDate`,
 * `transferId` and `originEntryId` all answer HTTP 500 — they live one or two
 * levels down. Measured on 2026-07-27.
 *
 * And `$skip` without an `$orderby` is a 500 on this collection too, exactly as
 * on the balance view. The transport always sends the key, so neither mine is
 * ever stepped on.
 */
const TRANSFER_ORDER_BY = 'id';

/**
 * The transfers: reading them, and undoing one.
 *
 * No normalizer, and one asymmetry deliberately left alone: the origin entry of
 * a transfer carries the amount **negative** and the destination carries it
 * positive — while `/payments`, listing that very same origin entry, carries it
 * positive. The same entry, two routes, two signs. This node forwards what the
 * API answered; a fourth convention invented here would be one more thing that
 * disagrees with Nibo's own screen.
 */
export async function executeBankTransfer(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	if (resource !== 'bankTransfer') {
		throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not supported`);
	}

	for (let i = 0; i < items.length; i++) {
		try {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const interval = requestInterval.call(this, i, options);
			if (i > 0 && interval > 0) {
				await sleep(interval);
			}

			if (operation === 'list') {
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

				const { records, warning } = await niboListRequest.call(
					this,
					i,
					TRANSFERS,
					TRANSFER_ORDER_BY,
					{
						returnAll,
						limit: returnAll ? 0 : (this.getNodeParameter('limit', i) as number),
						filter: listFilter.call(this, i, options, bankTransferFilterFieldTypes),
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
			} else if (operation === 'create') {
				returnData.push({
					json: await createTransfer.call(this, i),
					pairedItem: { item: i },
				});
			} else if (operation === 'delete') {
				const id = recordId.call(this, 'transferId', i);

				await niboApiRequest.call(
					this,
					i,
					'DELETE',
					`${TRANSFERS}/${encodeURIComponent(id)}`,
				);

				// The API answers 204 with no body, so the confirmation is built here —
				// and unlike the delete of a settled entry, there is no second thing to
				// name. That one reopened the schedule it had settled; this one really
				// removes the record of this screen, and the two entries underneath it
				// go with it.
				returnData.push({ json: { id, deleted: true }, pairedItem: { item: i } });
			} else {
				// There is no Get and no Update: nothing reads one transfer on its own,
				// and no route edits one. Undoing it and making another is the operation
				// this API has.
				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" is not supported`,
					{ itemIndex: i },
				);
			}
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: failedItem(error),
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
 * How long the read-back keeps asking. Short on purpose: `/accounts/transfer` is
 * the one collection of this API that answers **immediately** — 335 ms, first
 * try, measured on 2026-07-27 — where `/payments` and `/receipts` take about
 * three seconds and the reconciliation queue takes minutes. These waits are
 * insurance, not the expected path.
 */
const READ_BACK_WAITS = [500, 1000];

/**
 * The shape a GUID column compares against. A date that is not a date would
 * otherwise be pasted into the read-back expression and answered with a 500 —
 * after the money had already moved.
 */
const A_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Moves money between two accounts, and then goes and finds what it made.
 *
 * **The POST answers 204 with an empty body — no ID, nothing.** Without the
 * read-back this operation would hand back the fields the user typed, which is
 * exactly what a call that wrote nothing would hand back, and the Delete next
 * door would have no ID to work with. So the collection is read before the write
 * and again after it, and the record that was not there before is the one that
 * was just made. Anything cheaper would have to guess between two transfers of
 * the same amount, on the same day, between the same two accounts — and guessing
 * wrong would hand a workflow the ID of a transfer somebody else's item made.
 *
 * The refusals above it are the other half. Three of this route's errors name a
 * cause that is not the cause: a missing origin account, a missing destination
 * account and an account that does not exist all answer *"Não é possivel
 * transferir valores de/para contas virtuais"*. Nothing about the request is
 * virtual, and somebody reading that goes looking in the wrong place.
 */
async function createTransfer(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const origin = accountOf.call(this, 'originAccountId', 'origin', itemIndex);
	const destiny = accountOf.call(this, 'destinyAccountId', 'destination', itemIndex);

	if (origin === destiny) {
		throw new NodeOperationError(
			this.getNode(),
			'This transfer names the same account on both sides',
			{
				itemIndex,
				description:
					'Nothing was sent. A transfer moves money between two accounts of the organization, and the API refuses one that does not: "Você não pode transferir valores entre as mesmas contas correntes". To record money moving inside one account, use Transaction - Payment or Transaction - Receipt.',
			},
		);
	}

	const value = Number(this.getNodeParameter('value', itemIndex, 0));
	if (!Number.isFinite(value) || value <= 0) {
		throw new NodeOperationError(
			this.getNode(),
			`The value of a transfer has to be positive, and this one is "${this.getNodeParameter('value', itemIndex, 0)}"`,
			{
				itemIndex,
				description:
					'Nothing was sent. Zero, a negative amount and no amount at all are one and the same refusal in this API — "O valor informado deve ser positivo". The direction is the pair of accounts, never the sign.',
			},
		);
	}

	const date = onlyTheDay(String(this.getNodeParameter('date', itemIndex, '') ?? ''));
	const description = String(this.getNodeParameter('description', itemIndex, '') ?? '').trim();

	const body: IDataObject = {
		date,
		originAccountId: origin,
		destinyAccountId: destiny,
		value,
	};

	// Sent only when it was filled in. Left out, the API writes its own —
	// "Transferência de {origin} para {destination}" — and an empty string is not
	// the same thing as absent.
	if (description !== '') {
		body.description = description;
	}

	// Both accounts, and the day when it is a day the expression can carry. The
	// pair of accounts is what the collection was measured to filter on; the date
	// only narrows the scan, so a value that is not a date is simply left out
	// rather than pasted into an expression that would answer 500 after the money
	// had moved.
	const filter = [
		`originEntry/account/id eq ${origin}`,
		`destinyEntry/account/id eq ${destiny}`,
		...(A_DAY.test(date) ? [`originEntry/date ge ${date}`] : []),
	].join(' and ');

	const before = await transfersMatching.call(this, itemIndex, filter);
	const seen = new Set(before.map(identifierOf));

	await niboApiRequest.call(this, itemIndex, 'POST', TRANSFERS, {}, body);

	for (let attempt = 0; attempt <= READ_BACK_WAITS.length; attempt++) {
		if (attempt > 0) {
			await sleep(READ_BACK_WAITS[attempt - 1]);
		}

		const fresh = (await transfersMatching.call(this, itemIndex, filter)).filter(
			(record) => !seen.has(identifierOf(record)),
		);

		if (fresh.length > 0) {
			return newest(fresh);
		}
	}

	// The wording is the whole point of this branch. The API answered the POST, so
	// the money moved; what failed is the reading back.
	throw new NodeOperationError(
		this.getNode(),
		'The transfer was made, but it could not be read back',
		{
			itemIndex,
			description:
				'Nibo accepted the transfer, so the money did move. **Do not send it again**: a second one would move it twice. Read it with Get Many, filtering by the two accounts and the date, and the record carries the ID that Delete undoes it with.',
		},
	);
}

/** One of the two accounts, refused by name rather than by the API's wrong reason */
function accountOf(
	this: IExecuteFunctions,
	parameter: string,
	side: string,
	itemIndex: number,
): string {
	const id = String(this.getNodeParameter(parameter, itemIndex, '') ?? '').trim();

	if (id === '') {
		throw new NodeOperationError(this.getNode(), `This transfer names no ${side} account`, {
			itemIndex,
			description: `Nothing was sent, and that is the point: left blank, this API answers HTTP 500 "Não é possivel transferir valores de contas virtuais" — a sentence about virtual accounts, which is neither what is wrong nor anything the form asked about. The same answer comes back for an account that does not exist. Pick an account in the ${side === 'origin' ? 'Origin' : 'Destination'} Account field, or read the IDs of the organization with the Bank Account resource.`,
		});
	}

	return id;
}

/** The transfers this filter matches right now, walked to the end */
async function transfersMatching(
	this: IExecuteFunctions,
	itemIndex: number,
	filter: string,
): Promise<IDataObject[]> {
	const { records } = await niboListRequest.call(this, itemIndex, TRANSFERS, TRANSFER_ORDER_BY, {
		returnAll: true,
		limit: 0,
		filter,
		// A scan bounded by two accounts and a day is not a scan of a collection,
		// and the count of this one is about to change by design — comparing it
		// would turn the write into a failure of its own.
		failOnIncomplete: false,
	});

	return records;
}

function identifierOf(record: IDataObject): string {
	return String(record.id ?? '');
}

/**
 * The newest of the records that were not there before.
 *
 * Normally there is exactly one and there is nothing to choose. Two can only
 * happen when something else wrote between the two reads, and then the later one
 * is this item's — `createDate` is on the nested entry, so it can be asked.
 */
function newest(records: IDataObject[]): IDataObject {
	return [...records].sort((one, other) => createdAt(other) - createdAt(one))[0];
}

function createdAt(record: IDataObject): number {
	const entry = record.originEntry as IDataObject | undefined;
	const when = Date.parse(String(entry?.createDate ?? ''));

	return Number.isNaN(when) ? 0 : when;
}
