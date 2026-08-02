import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { repeatPayload, repeatProperties } from '../resources/schedule/repeat';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const context = { getNode: () => NODE } as unknown as IExecuteFunctions;

function payload(collected: IDataObject, total = 300): IDataObject {
	return repeatPayload.call(context, 0, collected, total);
}

describe('repeat — a recorrência', () => {
	it('não põe chave nenhuma quando ninguém pediu repetição', () => {
		expect(payload({ repeat: 'no' })).toEqual({});
		expect(payload({})).toEqual({});
	});

	it('manda a recorrência mensal por ocorrências', () => {
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 1,
				recurrenceIntervalType: 'month',
				recurrenceEnds: 'occurrences',
				recurrenceOccurrences: 12,
			}),
		).toEqual({
			recurrence: {
				enabled: true,
				intervalType: 2,
				interval: 1,
				recurrenceEndType: 1,
				maxOccurrences: 12,
			},
		});
	});

	it('manda a recorrência por data, e só o dia da data', () => {
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 2,
				recurrenceIntervalType: 'week',
				recurrenceEnds: 'date',
				recurrenceEndDate: '2027-06-30T00:00:00.000-03:00',
			}),
		).toEqual({
			recurrence: {
				enabled: true,
				intervalType: 1,
				interval: 2,
				recurrenceEndType: 2,
				endDate: '2027-06-30',
			},
		});
	});

	it('manda a recorrência indeterminada sem número nem data', () => {
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 1,
				recurrenceIntervalType: 'year',
				recurrenceEnds: 'never',
			}),
		).toEqual({
			recurrence: { enabled: true, intervalType: 3, interval: 1, recurrenceEndType: 0 },
		});
	});

	it('recusa a recorrência por data sem data', () => {
		expect(() =>
			payload({ repeat: 'recurrence', recurrenceEnds: 'date', recurrenceEndDate: '' }),
		).toThrow(NodeOperationError);
	});

	it('recusa ocorrências zero ou negativas, e aceita uma só', () => {
		expect(() =>
			payload({ repeat: 'recurrence', recurrenceEnds: 'occurrences', recurrenceOccurrences: 0 }),
		).toThrow(NodeOperationError);
		expect(
			payload({
				repeat: 'recurrence',
				recurrenceInterval: 1,
				recurrenceIntervalType: 'month',
				recurrenceEnds: 'occurrences',
				recurrenceOccurrences: 1,
			}).recurrence,
		).toMatchObject({ maxOccurrences: 1 });
	});
});

describe('repeat — a tela', () => {
	it('mostra Repeat nas duas famílias e esconde os filhos até haver resposta', () => {
		const fields = repeatProperties(['creditSchedule', 'debitSchedule']);
		const repeat = fields.find((field) => field.name === 'repeat');

		expect(repeat?.default).toBe('no');
		expect(repeat?.displayOptions?.show?.resource).toEqual(['creditSchedule', 'debitSchedule']);
		expect(repeat?.displayOptions?.show?.operation).toEqual(['create']);

		const ends = fields.find((field) => field.name === 'recurrenceEnds');
		expect(ends?.displayOptions?.show?.repeat).toEqual(['recurrence']);
	});

	it('nenhuma condição da tela olha para dentro de uma coleção', () => {
		for (const field of repeatProperties(['creditSchedule'])) {
			for (const path of Object.keys(field.displayOptions?.show ?? {})) {
				expect(path).not.toContain('.');
				expect(path).not.toContain('/');
			}
		}
	});
});
