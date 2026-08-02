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

/** O que a API chama de `autoGenerateNFSeType` */
const AUTO_NFSE: Record<string, number> = { before: 2, settled: 3, boleto: 4, now: 5 };

/**
 * Os quatro campos que esta organização preenche sempre, ao emitir uma nota —
 * por isso aparecem direto na tela, sem o "+ Add Field" que a operação Issue
 * avulsa ainda usa, e o node recusa a criação se um deles ficar vazio.
 *
 * `param` é o nome do campo aqui dentro do node; `key` é como a API chama a
 * mesma informação — a mesma grafia da operação Issue, que continua opcional
 * porque é outra tela e essa obrigatoriedade é deste bloco, não da API.
 */
const INVOICE_FIELDS: Array<{ param: string; key: string; label: string }> = [
	{
		param: 'invoiceServiceDescription',
		key: 'additionalServiceDescription',
		label: 'Service Description',
	},
	{
		param: 'invoiceAdditionalRemarks',
		key: 'additionalRemarks',
		label: 'Additional Remarks',
	},
	{
		param: 'invoiceCityWhereServiceWasProvided',
		key: 'cityWhereServiceWasProvided',
		label: 'City Where Service Was Provided',
	},
	{
		param: 'invoiceStateWhereServiceWasProvided',
		key: 'stateWhereServiceWasProvided',
		label: 'State Where Service Was Provided',
	},
];

export function automationProperties(resources: string[]): INodeProperties[] {
	const onCreate = { resource: resources, operation: ['create'] };
	const onBoleto = { ...onCreate, generateBoleto: ['before', 'now'] };
	const onInvoice = { ...onCreate, issueInvoice: ['before', 'boleto', 'now', 'settled'] };

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
		{
			// "Issue Invoice (NFS-e)" no plano — mas o linter do n8n põe todo
			// displayName em title case e NFS-e viraria NFS-E, grafia que não
			// existe. Mesmo muro da 0.14.0, mesma saída: o documento é nomeado
			// na descrição, onde nada o reescreve.
			displayName: 'Issue Invoice',
			name: 'issueInvoice',
			type: 'options',
			options: [
				{ name: 'A Number of Days Before the Due Date', value: 'before' },
				{
					name: "Don't Issue",
					value: 'no',
					description:
						'No note, which is what every schedule written before this field existed does',
				},
				{
					name: 'Immediately',
					value: 'now',
					description:
						'The note is issued as the schedule is created. This reaches a city hall, and there is no undo.',
				},
				{
					name: 'When the Boleto Is Generated',
					value: 'boleto',
					description:
						'Waits for a charge on this schedule — one asked for above, or one made by hand in Nibo later',
				},
				{
					name: 'When the Receipt Is Settled',
					value: 'settled',
					description: 'Waits for the money to be marked as received',
				},
			],
			default: 'no',
			description:
				"Whether this receivable is born with a service invoice — an NFS-e — programmed. ⚠️ Issuing reaches a city hall and there is no undo: a note can only be cancelled afterwards, which leaves it in the company's fiscal history for good and keeps its public PDF and XML answering. The amount and the taker come from this schedule.",
			displayOptions: { show: onCreate },
		},
		{
			displayName: 'Days Before Due Date',
			name: 'invoiceDaysBefore',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 3,
			description: 'How many days before the due date Nibo issues the note',
			displayOptions: { show: { ...onCreate, issueInvoice: ['before'] } },
		},
		{
			displayName: 'Service Profile Name or ID',
			name: 'invoiceServiceProfileId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'loadServiceProfiles', loadOptionsDependsOn: ['authMode'] },
			default: '',
			description:
				'Which profile the note is declared under. It decides the service, the tax and the remarks printed on it. ⚠️ A wrong profile is not fixed afterwards: undoing it is a cancellation at the city hall. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: { show: onInvoice },
		},
		{
			displayName: 'Additional Remarks',
			name: 'invoiceAdditionalRemarks',
			type: 'string',
			required: true,
			default: '',
			description:
				'Supplementary information printed on the note. Required for every note this schedule issues.',
			displayOptions: { show: onInvoice },
		},
		{
			displayName: 'City Where Service Was Provided',
			name: 'invoiceCityWhereServiceWasProvided',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'Rio de Janeiro',
			description:
				'Where the service was provided. Required for every note this schedule issues.',
			displayOptions: { show: onInvoice },
		},
		{
			displayName: 'Service Description',
			name: 'invoiceServiceDescription',
			type: 'string',
			required: true,
			default: '',
			description:
				'The text that fills the {{Descricao}} template the profile carries. Required for every note this schedule issues.',
			displayOptions: { show: onInvoice },
		},
		{
			displayName: 'State Where Service Was Provided',
			name: 'invoiceStateWhereServiceWasProvided',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'RJ',
			description:
				'The state of the city above, as the two-letter abbreviation. Required for every note this schedule issues.',
			displayOptions: { show: onInvoice },
		},
	];
}

export function automationPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
): IDataObject {
	// Os dois blocos são independentes: uma nota sem boleto e um boleto sem nota
	// são pedidos legítimos, então nenhum dos dois retorna cedo pelo outro.
	const payload: IDataObject = {};

	boletoPayload.call(this, itemIndex, collected, payload);
	invoicePayload.call(this, itemIndex, collected, payload);

	return payload;
}

function boletoPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	payload: IDataObject,
): void {
	const boleto = String(collected.generateBoleto ?? 'no');

	if (boleto === 'no') {
		return;
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
}

function invoicePayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	payload: IDataObject,
): void {
	const invoice = String(collected.issueInvoice ?? 'no');
	if (invoice === 'no') {
		return;
	}

	const profile = String(collected.invoiceServiceProfileId ?? '').trim();
	if (profile === '') {
		throw new NodeOperationError(this.getNode(), 'This invoice names no service profile', {
			itemIndex,
			description:
				'Pick a Service Profile. It decides which service the note declares, how much tax it charges and the remarks printed on it, and the API refuses without one. An empty list there means the organization does not issue NFS-e — that needs a digital certificate and a profile approved by the city hall.',
		});
	}

	payload.autoGenerateNFSeType = AUTO_NFSE[invoice];
	payload.serviceProfileId = profile;

	if (invoice === 'before') {
		const days = Number(collected.invoiceDaysBefore ?? 0);
		if (!Number.isFinite(days) || days < 1) {
			throw new NodeOperationError(
				this.getNode(),
				'This invoice is due before a number of days it does not give',
				{
					itemIndex,
					description:
						'Days Before Due Date needs a number of 1 or more. For a note issued at once, choose Immediately instead.',
				},
			);
		}
		payload.daysBeforeDueDateToGenerateNFSe = days;
	}

	for (const field of INVOICE_FIELDS) {
		const value = String(collected[field.param] ?? '').trim();
		if (value === '') {
			throw new NodeOperationError(this.getNode(), `This invoice has no ${field.label}`, {
				itemIndex,
				description: `${field.label} is required for every note this schedule issues.`,
			});
		}
		payload[field.key] = value;
	}
}
