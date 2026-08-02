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

describe('repeat — as parcelas digitadas', () => {
	it('manda o array na grafia da API, uma entrada por linha', () => {
		expect(
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: {
					installment: [
						{ installmentNumber: 1, dueDate: '2027-03-10T00:00:00.000-03:00', value: 100 },
						{
							installmentNumber: 2,
							dueDate: '2027-04-10T00:00:00.000-03:00',
							value: 200,
							description: 'segunda',
						},
					],
				},
			}),
		).toEqual({
			instalment: [
				{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
				{ installmentNumber: 2, dueDate: '2027-04-10', value: 200, description: 'segunda' },
			],
		});
	});

	it('a linha sem detalhe herda a descrição do agendamento — a API descarta a da raiz', () => {
		const out = payload({
			repeat: 'installments',
			installmentsAre: 'listed',
			description: 'raiz',
			installments: {
				installment: [
					{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
					{ installmentNumber: 2, dueDate: '2027-04-10', value: 100, description: 'própria' },
				],
			},
		}).instalment as IDataObject[];

		expect(out[0].description).toBe('raiz');
		expect(out[1].description).toBe('própria');
	});

	it('recusa linha sem vencimento', () => {
		expect(() =>
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: { installment: [{ installmentNumber: 1, dueDate: '', value: 100 }] },
			}),
		).toThrow(NodeOperationError);
	});

	it('recusa números de parcela repetidos', () => {
		expect(() =>
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: {
					installment: [
						{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
						{ installmentNumber: 1, dueDate: '2027-04-10', value: 100 },
					],
				},
			}),
		).toThrow(NodeOperationError);
	});

	it('recusa linha sem valor', () => {
		expect(() =>
			payload({
				repeat: 'installments',
				installmentsAre: 'listed',
				installments: { installment: [{ installmentNumber: 1, dueDate: '2027-03-10', value: 0 }] },
			}),
		).toThrow(NodeOperationError);
	});

	it('recusa a lista vazia — parcelar em nada não é parcelar', () => {
		expect(() =>
			payload({ repeat: 'installments', installmentsAre: 'listed', installments: {} }),
		).toThrow(NodeOperationError);
	});
});

describe('repeat — as parcelas calculadas', () => {
	const plano = (extra: IDataObject, total = 300) =>
		payload(
			{
				repeat: 'installments',
				installmentsAre: 'generated',
				dueDate: '2027-03-10',
				installmentInterval: 1,
				installmentIntervalType: 'month',
				installmentAmount: 'split',
				...extra,
			},
			total,
		).instalment as IDataObject[];

	it('divide o total e anda de mês em mês', () => {
		expect(plano({ installmentCount: 3 })).toEqual([
			{ installmentNumber: 1, dueDate: '2027-03-10', value: 100 },
			{ installmentNumber: 2, dueDate: '2027-04-10', value: 100 },
			{ installmentNumber: 3, dueDate: '2027-05-10', value: 100 },
		]);
	});

	it('repete o valor em cada parcela quando é o que se pediu', () => {
		expect(plano({ installmentCount: 2, installmentAmount: 'repeat' })).toEqual([
			{ installmentNumber: 1, dueDate: '2027-03-10', value: 300 },
			{ installmentNumber: 2, dueDate: '2027-04-10', value: 300 },
		]);
	});

	it('cada parcela gerada carrega a descrição do agendamento — a API descarta a da raiz', () => {
		const parcelas = plano({ installmentCount: 2, description: 'mensalidade' });
		expect(parcelas.map((p) => p.description)).toEqual(['mensalidade', 'mensalidade']);
	});

	it('fecha a soma em centavos, distribuindo a sobra nas primeiras', () => {
		const parcelas = plano({ installmentCount: 3 }, 100);
		expect(parcelas.map((p) => p.value)).toEqual([33.34, 33.33, 33.33]);
		expect(parcelas.reduce((sum, p) => sum + (p.value as number), 0)).toBeCloseTo(100, 10);
	});

	it('mês curto: 31/01 vira o último dia de fevereiro e VOLTA para 31 em março', () => {
		expect(
			plano({ installmentCount: 4, dueDate: '2027-01-31' }, 400).map((p) => p.dueDate),
		).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
	});

	it('ano bissexto: 31/12/2027 mais dois meses cai em 29/02/2028', () => {
		expect(
			plano({ installmentCount: 3, dueDate: '2027-12-31' }, 300).map((p) => p.dueDate),
		).toEqual(['2027-12-31', '2028-01-31', '2028-02-29']);
	});

	it('anda em dias, semanas e anos também', () => {
		expect(
			plano({ installmentCount: 2, installmentIntervalType: 'day', installmentInterval: 15 }).map(
				(p) => p.dueDate,
			),
		).toEqual(['2027-03-10', '2027-03-25']);
		expect(
			plano({ installmentCount: 2, installmentIntervalType: 'week', installmentInterval: 2 }).map(
				(p) => p.dueDate,
			),
		).toEqual(['2027-03-10', '2027-03-24']);
		expect(
			plano({ installmentCount: 2, installmentIntervalType: 'year', installmentInterval: 1 }).map(
				(p) => p.dueDate,
			),
		).toEqual(['2027-03-10', '2028-03-10']);
	});

	it('recusa menos de duas e mais de cem parcelas', () => {
		expect(() => plano({ installmentCount: 1 })).toThrow(NodeOperationError);
		expect(() => plano({ installmentCount: 101 })).toThrow(NodeOperationError);
	});

	it('recusa dividir um total que não existe', () => {
		expect(() => plano({ installmentCount: 3 }, 0)).toThrow(NodeOperationError);
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
