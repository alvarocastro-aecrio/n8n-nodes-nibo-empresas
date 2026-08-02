import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { automationPayload, automationProperties } from '../resources/schedule/automation';

const NODE: INode = {
	id: 'test-node',
	name: 'Nibo Empresas',
	type: 'n8n-nodes-nibo-empresas.niboEmpresas',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const context = { getNode: () => NODE } as unknown as IExecuteFunctions;
const payload = (collected: IDataObject) => automationPayload.call(context, 0, collected);

describe('automation — o boleto', () => {
	it('não põe chave nenhuma quando ninguém pediu boleto', () => {
		expect(payload({ generateBoleto: 'no' })).toEqual({});
		expect(payload({})).toEqual({});
	});

	it('manda o boleto imediato sem falar em dias', () => {
		expect(
			payload({
				generateBoleto: 'now',
				boletoCollectionProfileId: 'perfil-1',
				boletoDeliveryType: 'default',
			}),
		).toEqual({ collection: { AutoGenerateCollectionType: 3, CollectionProfileId: 'perfil-1' } });
	});

	it('manda o boleto de dias antes com os dias', () => {
		expect(
			payload({
				generateBoleto: 'before',
				boletoDaysBefore: 5,
				boletoCollectionProfileId: 'perfil-1',
				boletoDeliveryType: 1,
			}),
		).toEqual({
			collection: {
				AutoGenerateCollectionType: 2,
				DaysBeforeDueDateToGenerateCollection: 5,
				CollectionProfileId: 'perfil-1',
				deliveryType: 1,
			},
		});
	});

	it('recusa boleto sem perfil', () => {
		expect(() => payload({ generateBoleto: 'now', boletoCollectionProfileId: '  ' })).toThrow(
			NodeOperationError,
		);
	});

	it('recusa dias antes vazio ou zero', () => {
		expect(() =>
			payload({ generateBoleto: 'before', boletoDaysBefore: 0, boletoCollectionProfileId: 'perfil-1' }),
		).toThrow(NodeOperationError);
	});
});

describe('automation — a nota', () => {
	it('não põe chave nenhuma quando ninguém pediu nota', () => {
		expect(payload({ issueInvoice: 'no' })).toEqual({});
	});

	it('manda cada gatilho com o número que a API usa', () => {
		const numero = (escolha: string) =>
			payload({ issueInvoice: escolha, invoiceServiceProfileId: 'perfil-nfse', invoiceDaysBefore: 3 })
				.autoGenerateNFSeType;

		expect(numero('before')).toBe(2);
		expect(numero('settled')).toBe(3);
		expect(numero('boleto')).toBe(4);
		expect(numero('now')).toBe(5);
	});

	it('manda os dias só no gatilho que os usa', () => {
		expect(
			payload({ issueInvoice: 'before', invoiceDaysBefore: 3, invoiceServiceProfileId: 'perfil-nfse' }),
		).toEqual({
			autoGenerateNFSeType: 2,
			daysBeforeDueDateToGenerateNFSe: 3,
			serviceProfileId: 'perfil-nfse',
		});

		expect(payload({ issueInvoice: 'settled', invoiceServiceProfileId: 'perfil-nfse' })).toEqual({
			autoGenerateNFSeType: 3,
			serviceProfileId: 'perfil-nfse',
		});
	});

	it('leva os campos opcionais só quando estão preenchidos', () => {
		expect(
			payload({
				issueInvoice: 'now',
				invoiceServiceProfileId: 'perfil-nfse',
				invoiceFields: {
					additionalServiceDescription: 'Assinatura mensal',
					cityWhereServiceWasProvided: '',
				},
			}),
		).toEqual({
			autoGenerateNFSeType: 5,
			serviceProfileId: 'perfil-nfse',
			additionalServiceDescription: 'Assinatura mensal',
		});
	});

	it('recusa nota sem perfil de serviço', () => {
		expect(() => payload({ issueInvoice: 'now', invoiceServiceProfileId: '' })).toThrow(
			NodeOperationError,
		);
	});

	it('boleto e nota convivem no mesmo corpo', () => {
		const corpo = payload({
			generateBoleto: 'now',
			boletoCollectionProfileId: 'perfil-1',
			boletoDeliveryType: 'default',
			issueInvoice: 'boleto',
			invoiceServiceProfileId: 'perfil-nfse',
		});

		expect(corpo.collection).toMatchObject({ AutoGenerateCollectionType: 3 });
		expect(corpo.autoGenerateNFSeType).toBe(4);
	});
});

describe('automation — a tela', () => {
	it('nenhuma condição da tela olha para dentro de uma coleção', () => {
		for (const field of automationProperties(['creditSchedule'])) {
			for (const path of Object.keys(field.displayOptions?.show ?? {})) {
				expect(path).not.toContain('.');
				expect(path).not.toContain('/');
			}
		}
	});
});
