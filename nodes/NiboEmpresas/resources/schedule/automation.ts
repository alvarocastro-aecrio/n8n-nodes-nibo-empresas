import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * As duas automações que só existem no **crédito**: o boleto e a nota.
 *
 * A API as coloca no mesmo corpo da criação do agendamento — o boleto dentro de um
 * objeto `collection`, a nota espalhada na raiz — e é a única hora em que as aceita.
 * Num `PUT` não há campo para nenhuma das duas.
 *
 * ⚠️ **A grafia do objeto do boleto é a da documentação da Nibo**, três chaves em
 * maiúscula e uma em minúscula. Não é engano deste arquivo: o corpo de criação de
 * cobrança do recurso Collection é o único desta API escrito assim, e esta é a
 * segunda ocorrência. A prova real fica na fatia 9 — a cobaia não emite boleto.
 */
const AUTO_COLLECTION: Record<string, number> = { before: 2, now: 3 };

export function automationProperties(resources: string[]): INodeProperties[] {
	const onCreate = { resource: resources, operation: ['create'] };
	const onBoleto = { ...onCreate, generateBoleto: ['before', 'now'] };

	return [
		{
			displayName: 'Generate Boleto',
			name: 'generateBoleto',
			type: 'options',
			options: [
				{
					name: 'A Number of Days Before the Due Date',
					value: 'before',
					description: 'Nibo issues the charge that many days ahead of the due date',
				},
				{
					name: "Don't Generate",
					value: 'no',
					description:
						'No charge — which is what every schedule written before this field existed does',
				},
				{
					name: 'Immediately',
					value: 'now',
					description:
						'The charge is issued as the schedule is created. There is a boleto at the end of this.',
				},
			],
			default: 'no',
			description:
				'Whether this receivable is born with a charge — a boleto, with the Pix QR printed on it. A schedule carries at most one charge, and cancelling it later is done with the Collection resource. ⚠️ Its public link is the charge itself: whoever holds it opens the payment page with no token.',
			displayOptions: { show: onCreate },
		},
		{
			displayName: 'Days Before Due Date',
			name: 'boletoDaysBefore',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 5,
			description: 'How many days before the due date Nibo issues the charge',
			displayOptions: { show: { ...onCreate, generateBoleto: ['before'] } },
		},
		{
			displayName: 'Collection Profile Name or ID',
			name: 'boletoCollectionProfileId',
			type: 'options',
			typeOptions: {
				loadOptionsMethod: 'loadCollectionProfiles',
				loadOptionsDependsOn: ['authMode'],
			},
			default: '',
			description:
				'Which profile issues the charge — it ties the bank provider to it, and the API refuses without one. An organization with no profile cannot issue charges at all. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: { show: onBoleto },
		},
		{
			displayName: 'Delivery',
			name: 'boletoDeliveryType',
			type: 'options',
			options: [
				{ name: 'By E-Mail', value: 0, description: 'Nibo sends it from the financial side' },
				{ name: 'Leave It to Nibo', value: 'default', description: 'The key is not sent at all' },
				{
					name: 'Through the Accountant',
					value: 1,
					description:
						"The charge is handed to Nibo's accountant module and reaches the payer in the client portal there",
				},
			],
			default: 'default',
			description:
				'Which way the charge leaves. Both deliver — the choice is the route, not whether. Through the Accountant only makes sense for an organization whose Nibo is integrated with that module.',
			displayOptions: { show: onBoleto },
		},
	];
}

export function automationPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
): IDataObject {
	const payload: IDataObject = {};
	const boleto = String(collected.generateBoleto ?? 'no');

	if (boleto === 'no') {
		return payload;
	}

	const profile = String(collected.boletoCollectionProfileId ?? '').trim();
	if (profile === '') {
		throw new NodeOperationError(this.getNode(), 'This boleto names no collection profile', {
			itemIndex,
			description:
				'Pick a Collection Profile, which is what ties a bank provider to the charge. An empty list there means the organization cannot issue charges at all — that is set up in Nibo, with the provider contracted.',
		});
	}

	const collection: IDataObject = {
		AutoGenerateCollectionType: AUTO_COLLECTION[boleto],
		CollectionProfileId: profile,
	};

	if (boleto === 'before') {
		const days = Number(collected.boletoDaysBefore ?? 0);
		if (!Number.isFinite(days) || days < 1) {
			throw new NodeOperationError(
				this.getNode(),
				'This boleto is due before a number of days it does not give',
				{
					itemIndex,
					description:
						'Days Before Due Date needs a number of 1 or more. For a charge issued at once, choose Immediately instead.',
				},
			);
		}
		collection.DaysBeforeDueDateToGenerateCollection = days;
	}

	const delivery = collected.boletoDeliveryType;
	if (delivery !== 'default' && delivery !== '' && delivery !== undefined) {
		collection.deliveryType = Number(delivery);
	}

	payload.collection = collection;

	return payload;
}
