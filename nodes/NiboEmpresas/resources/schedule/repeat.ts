import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { onlyTheDay } from './normalize';

/**
 * Como um agendamento se repete — e é **uma pergunta com três respostas**, não duas
 * caixas. A API recusa recorrência e parcelamento no mesmo pedido, e uma pergunta
 * só é o que torna essa combinação inalcançável pela tela. É o mesmo raciocínio do
 * `Apportion By`, que é uma caixa e não duas.
 */
const REPEAT = 'repeat';

/** O que a API chama de `intervalType`: 0 dia, 1 semana, 2 mês, 3 ano */
const INTERVAL_TYPE: Record<string, number> = { day: 0, week: 1, month: 2, year: 3 };

/** O que a API chama de `recurrenceEndType`: 0 indeterminado, 1 por ocorrências, 2 por data */
const END_TYPE: Record<string, number> = { never: 0, occurrences: 1, date: 2 };

const INTERVAL_OPTIONS = [
	{ name: 'Day', value: 'day' },
	{ name: 'Month', value: 'month' },
	{ name: 'Week', value: 'week' },
	{ name: 'Year', value: 'year' },
];

export function repeatProperties(resources: string[]): INodeProperties[] {
	const onCreate = { resource: resources, operation: ['create'] };
	const onRecurrence = { ...onCreate, [REPEAT]: ['recurrence'] };
	const onInstallments = { ...onCreate, [REPEAT]: ['installments'] };
	const onGenerated = { ...onInstallments, installmentsAre: ['generated'] };

	return [
		{
			displayName: 'Repeat',
			name: REPEAT,
			type: 'options',
			options: [
				{
					name: "Don't Repeat",
					value: 'no',
					description:
						'One schedule, on the due date above — which is what every schedule written before this field existed does',
				},
				{
					name: 'Installments',
					value: 'installments',
					description:
						'One amount split into parcels, each with its own due date. Nibo tags them "Parcelado — X/Y".',
				},
				{
					name: 'Recurrence',
					value: 'recurrence',
					description:
						'The same amount again and again. Nibo provisions the occurrences up to 36 months ahead.',
				},
			],
			default: 'no',
			description:
				'How this schedule repeats. It is one question with three answers because the API refuses recurrence and installments in the same request — and neither can be turned into the other afterwards.',
			displayOptions: { show: onCreate },
		},
		{
			displayName: 'Repeat Every',
			name: 'recurrenceInterval',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
			description: 'How many of the units below go by between one occurrence and the next',
			displayOptions: { show: onRecurrence },
		},
		{
			displayName: 'Interval',
			name: 'recurrenceIntervalType',
			type: 'options',
			options: INTERVAL_OPTIONS,
			default: 'month',
			description: 'The unit the interval above counts in',
			displayOptions: { show: onRecurrence },
		},
		{
			displayName: 'Ends',
			name: 'recurrenceEnds',
			type: 'options',
			options: [
				{ name: 'After a Number of Occurrences', value: 'occurrences' },
				{ name: 'Never', value: 'never' },
				{ name: 'On a Date', value: 'date' },
			],
			default: 'occurrences',
			description:
				'When the repetition stops. Ending it later is done in Nibo, not here: this API has no route that reads or changes a recurrence once it exists.',
			displayOptions: { show: onRecurrence },
		},
		{
			displayName: 'Occurrences',
			name: 'recurrenceOccurrences',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 12,
			description: 'How many times in total, counting the first one',
			displayOptions: { show: { ...onRecurrence, recurrenceEnds: ['occurrences'] } },
		},
		{
			displayName: 'End Date',
			name: 'recurrenceEndDate',
			type: 'dateTime',
			// Um dia, não um instante: a API toma YYYY-MM-DD, e meia-noite em Brasília
			// é o dia anterior em UTC.
			typeOptions: { dateOnly: true },
			default: '',
			description: 'The last day the repetition may fall on',
			displayOptions: { show: { ...onRecurrence, recurrenceEnds: ['date'] } },
		},
		{
			displayName: 'Installments Are',
			name: 'installmentsAre',
			type: 'options',
			options: [
				{
					name: 'Generated',
					value: 'generated',
					description:
						'Say how many and how far apart, and the node writes the parcels — the first one falling on the Due Date above',
				},
				{
					name: 'Listed One by One',
					value: 'listed',
					description:
						'Type every parcel, for a plan that is not regular — a bigger first parcel, a broken due date',
				},
			],
			default: 'generated',
			description:
				'How the parcels are told to the node. The API always wants them one by one; this is only who writes them out.',
			displayOptions: { show: onInstallments },
		},
		// Os quatro campos do parcelamento calculado. `generated()` os lê desde a
		// 0.15.0 e a tela nunca os declarou, então o modo — que é o **padrão** de
		// `Installments Are` — chegava ao handler sem `installmentCount`, caía no
		// fallback de 0 e morria em "0 is not a number of installments". A data da
		// primeira parcela não está aqui de propósito: é o Due Date do agendamento,
		// na tela desde a 0.1.0, e declará-la de novo seria dois campos com um nome.
		{
			displayName: 'Number of Installments',
			name: 'installmentCount',
			type: 'number',
			typeOptions: { minValue: 2, maxValue: MAX_INSTALLMENTS },
			default: 2,
			description: `How many parcels, counting the first. Nibo allows up to ${MAX_INSTALLMENTS}.`,
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Repeat Every',
			name: 'installmentInterval',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
			description: 'How far apart the parcels fall',
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Interval',
			name: 'installmentIntervalType',
			type: 'options',
			options: INTERVAL_OPTIONS,
			default: 'month',
			description:
				'The unit the interval above counts in. On months the day is kept and clamped to the end of a short month — a plan starting on the 31st falls on the 28th in February and back on the 31st in March.',
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Amount',
			name: 'installmentAmount',
			type: 'options',
			options: [
				{
					name: 'Repeat the Amount on Every Installment',
					value: 'repeat',
					description: 'Each parcel is worth the whole sum of the lines under Categories',
				},
				{
					name: 'Split the Total Across the Installments',
					value: 'split',
					description:
						'The sum of the lines under Categories is divided, and the leftover cents go on the first parcels so the total closes',
				},
			],
			default: 'split',
			description:
				'What the amount of each parcel is. "The total" is the sum of the lines under Categories: this API keeps no total of its own.',
			displayOptions: { show: onGenerated },
		},
		{
			displayName: 'Installments',
			name: 'installments',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Installment',
			default: {},
			description: 'The parcels, as the API takes them. Up to 100.',
			displayOptions: { show: { ...onInstallments, installmentsAre: ['listed'] } },
			options: [
				{
					displayName: 'Installment',
					name: 'installment',
					values: [
						{
							displayName: 'Number',
							name: 'installmentNumber',
							type: 'number',
							typeOptions: { minValue: 1 },
							default: 1,
							description:
								'Which parcel this is — 1 for the first. Nibo shows it as "Parcelado — X/Y".',
						},
						{
							displayName: 'Due Date',
							name: 'dueDate',
							type: 'dateTime',
							typeOptions: { dateOnly: true },
							default: '',
							description: 'The day this parcel falls due',
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'number',
							default: 0,
							description: 'The amount of this parcel, always typed as a positive number',
						},
						{
							displayName: 'Detail',
							name: 'description',
							type: 'string',
							default: '',
							description:
								'What this parcel is about. Left empty, the Description of the schedule is written here instead — the API keeps only the line\'s text, tagged "X/Y", and discards the one at the root.',
						},
					],
				},
			],
		},
	];
}

export function repeatPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	total: number,
): IDataObject {
	const chosen = String(collected[REPEAT] ?? 'no');

	if (chosen === 'recurrence') {
		return { recurrence: recurrence.call(this, itemIndex, collected) };
	}

	if (chosen === 'installments') {
		return { instalment: instalments.call(this, itemIndex, collected, total) };
	}

	return {};
}

function instalments(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	total: number,
): IDataObject[] {
	if (String(collected.installmentsAre ?? 'generated') === 'listed') {
		return listed.call(this, itemIndex, collected);
	}

	return generated.call(this, itemIndex, collected, total);
}

/**
 * As parcelas digitadas, na grafia da API — **`instalment`, com um "l" só**. Não é
 * engano deste arquivo: é como a documentação da Nibo escreve a chave, e esta API
 * aceita-e-ignora o que não reconhece — medido na sonda de 2026-08-02, a grafia com
 * dois "l" respondeu 200 e criou um agendamento sem parcela nenhuma.
 *
 * A linha sem detalhe herda a descrição do agendamento, porque a API **descarta a
 * descrição da raiz** quando há parcelas: cada uma nasce com `"{detalhe} - X/Y"`,
 * medido na mesma sonda. Sem a herança, o que o usuário escreveu some em silêncio
 * e as parcelas ficam inencontráveis por descrição.
 */
function listed(this: IExecuteFunctions, itemIndex: number, collected: IDataObject): IDataObject[] {
	const rows = (collected.installments as IDataObject | undefined)?.installment;

	if (!Array.isArray(rows) || rows.length === 0) {
		throw new NodeOperationError(this.getNode(), 'This installment plan has no installment', {
			itemIndex,
			description:
				'Add at least one line under Installments, with its number, its due date and its amount — or switch Installments Are to "Generated" and say how many.',
		});
	}

	const fallback = String(collected.description ?? '').trim();
	const seen = new Set<number>();

	return rows.map((row) => {
		const { installmentNumber, dueDate, value, description } = (row ?? {}) as IDataObject;
		const day = onlyTheDay(String(dueDate ?? ''));
		const number = Number(installmentNumber);

		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			throw new NodeOperationError(this.getNode(), 'An installment line has no due date', {
				itemIndex,
				description:
					'Every line under Installments needs the day it falls due. The API refuses the plan without it.',
			});
		}

		if (!Number.isFinite(number) || seen.has(number)) {
			throw new NodeOperationError(
				this.getNode(),
				`Installment number ${String(installmentNumber)} is missing or repeated`,
				{
					itemIndex,
					description:
						'Each line needs its own number, and the numbers are what tell the parcels apart in Nibo — where they are shown as "Parcelado — X/Y".',
				},
			);
		}
		seen.add(number);

		const amount = Number(value);
		if (!Number.isFinite(amount) || amount <= 0) {
			throw new NodeOperationError(this.getNode(), `Installment ${number} has no amount`, {
				itemIndex,
				description:
					'Every line under Installments needs a positive amount. A parcel worth nothing is not a parcel, and the API refuses the plan rather than the line.',
			});
		}

		const line: IDataObject = { installmentNumber: number, dueDate: day, value: amount };
		const detail = String(description ?? '').trim() || fallback;

		return detail === '' ? line : { ...line, description: detail };
	});
}

function recurrence(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
): IDataObject {
	const ends = String(collected.recurrenceEnds ?? 'occurrences');
	const endType = END_TYPE[ends] ?? 1;

	const body: IDataObject = {
		enabled: true,
		intervalType: INTERVAL_TYPE[String(collected.recurrenceIntervalType ?? 'month')] ?? 2,
		interval: Number(collected.recurrenceInterval ?? 1),
		recurrenceEndType: endType,
	};

	if (ends === 'occurrences') {
		const times = Number(collected.recurrenceOccurrences ?? 0);
		if (!Number.isFinite(times) || times < 1) {
			throw new NodeOperationError(
				this.getNode(),
				'This recurrence says how it ends but not when',
				{
					itemIndex,
					description:
						'Ends is set to "After a number of occurrences", so Occurrences needs a number of 1 or more. One occurrence is allowed and means the same as not repeating at all.',
				},
			);
		}
		body.maxOccurrences = times;
	}

	if (ends === 'date') {
		const day = onlyTheDay(String(collected.recurrenceEndDate ?? ''));
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			throw new NodeOperationError(
				this.getNode(),
				'This recurrence ends on a date it does not give',
				{
					itemIndex,
					description:
						'Ends is set to "On a date", so End Date has to carry one. Left empty, the API would be told to repeat until a day that does not exist.',
				},
			);
		}
		body.endDate = day;
	}

	return body;
}

/** O teto do parcelamento, declarado pela central de ajuda da Nibo */
const MAX_INSTALLMENTS = 100;

function generated(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	total: number,
): IDataObject[] {
	const count = Number(collected.installmentCount ?? 0);

	if (!Number.isInteger(count) || count < 2 || count > MAX_INSTALLMENTS) {
		throw new NodeOperationError(
			this.getNode(),
			`${String(collected.installmentCount ?? '')} is not a number of installments`,
			{
				itemIndex,
				description: `Number of Installments goes from 2 to ${MAX_INSTALLMENTS}. Splitting an amount into one part is not a split — leave Repeat on "Don't repeat" for that.`,
			},
		);
	}

	const split = String(collected.installmentAmount ?? 'split') === 'split';
	const first = onlyTheDay(String(collected.dueDate ?? ''));

	if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) {
		throw new NodeOperationError(this.getNode(), 'The installments have no first due date', {
			itemIndex,
			description: 'The first parcel falls on the Due Date of the schedule, and that field is empty.',
		});
	}

	if (!Number.isFinite(total) || total <= 0) {
		throw new NodeOperationError(this.getNode(), 'There is no amount to split into installments', {
			itemIndex,
			description:
				'The amount of a schedule is the sum of its lines under Categories — this API keeps no total of its own — and that sum is zero.',
		});
	}

	const every = Number(collected.installmentInterval ?? 1);
	const unit = String(collected.installmentIntervalType ?? 'month');
	const amounts = split ? shareOut(total, count) : new Array<number>(count).fill(total);

	// A descrição do agendamento, escrita em cada parcela: a API descarta a da
	// raiz e guarda só a da linha, com o "X/Y" atrás — medido em 2026-08-02.
	const detail = String(collected.description ?? '').trim();

	return amounts.map((value, index) => ({
		installmentNumber: index + 1,
		dueDate: addInterval(first, unit, every * index),
		value,
		...(detail === '' ? {} : { description: detail }),
	}));
}

/**
 * O total repartido em centavos, e a sobra distribuída nas primeiras parcelas —
 * um centavo em cada, não todos no primeiro. 100 em três é 33,34 / 33,33 / 33,33,
 * e a soma fecha. Feito em inteiros porque `100 / 3` em ponto flutuante não fecha
 * nunca, e uma parcela a mais ou a menos é a API recusando o plano inteiro.
 */
function shareOut(total: number, count: number): number[] {
	const cents = Math.round(total * 100);
	const base = Math.floor(cents / count);
	const left = cents - base * count;

	return Array.from({ length: count }, (_, index) => (base + (index < left ? 1 : 0)) / 100);
}

/**
 * A data da parcela, andando pelo calendário e não por milissegundos.
 *
 * Mês é a parte que dói: 31/01 mais um mês não existe, e o que se faz é **grudar no
 * último dia do mês de destino** — 28 ou 29 de fevereiro. E a parcela seguinte volta
 * a ser 31, porque a conta é sempre feita a partir do **primeiro** vencimento, nunca
 * do anterior: encadear encolheria o dia para sempre depois do primeiro fevereiro.
 */
function addInterval(first: string, unit: string, amount: number): string {
	const [year, month, day] = first.split('-').map(Number);

	if (unit === 'day' || unit === 'week') {
		const moved = new Date(Date.UTC(year, month - 1, day + amount * (unit === 'week' ? 7 : 1)));
		return iso(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
	}

	const months = amount * (unit === 'year' ? 12 : 1);
	const target = new Date(Date.UTC(year, month - 1 + months, 1));
	const targetYear = target.getUTCFullYear();
	const targetMonth = target.getUTCMonth() + 1;
	const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();

	return iso(targetYear, targetMonth, Math.min(day, lastDay));
}

function iso(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
