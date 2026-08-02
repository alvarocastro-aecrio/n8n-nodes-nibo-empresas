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
	];
}

export function repeatPayload(
	this: IExecuteFunctions,
	itemIndex: number,
	collected: IDataObject,
	_total: number,
): IDataObject {
	const chosen = String(collected[REPEAT] ?? 'no');

	if (chosen === 'recurrence') {
		return { recurrence: recurrence.call(this, itemIndex, collected) };
	}

	return {};
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
