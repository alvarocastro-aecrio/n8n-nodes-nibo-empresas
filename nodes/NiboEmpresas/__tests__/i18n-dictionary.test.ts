import { NiboEmpresas } from '../NiboEmpresas.node';
import { collectTranslatableEntries } from '../i18n/localize';
import { ptBR } from '../i18n/pt-BR';

/**
 * O dicionário contra a árvore real. Chave que não existe não estoura em runtime — o
 * rótulo simplesmente fica em inglês, e o erro só apareceria olhando a tela campo a
 * campo. Estes três testes trocam esse silêncio por vermelho.
 */
const inventory = collectTranslatableEntries(new NiboEmpresas().description.properties);

/**
 * Entradas cujo português é, de propósito, igual ao inglês: jargão que ninguém traduz,
 * exemplo de dado que não é frase, e termo que já nasceu em português. Toda entrada
 * listada aqui é uma decisão registrada; toda entrada NÃO listada e ainda em inglês é
 * serviço por fazer.
 *
 * A chave é `<caminho>.<campo>`, e não só o caminho: declarar o placeholder de um campo
 * não pode isentar o displayName e a description do mesmo campo de serem traduzidos.
 */
const KEPT_IN_ENGLISH: Record<string, string> = {
	'annotation.scheduleId.placeholder': 'GUID de exemplo',
	'bankAccount.name.placeholder': 'exemplo de dado, já em português',
	'bankAccount.batchName.placeholder': 'nome de arquivo de exemplo',
	'bankTransfer.transferId.placeholder': 'GUID de exemplo',
	'category.categoryId.placeholder': 'GUID de exemplo',
	'collection.scheduleId.placeholder': 'GUID de exemplo',
	'collection.collectionId.placeholder': 'GUID de exemplo',
	'costCenter.costCenterId.placeholder': 'GUID de exemplo',
	'creditSchedule.invoiceCityWhereServiceWasProvided.placeholder': 'exemplo de dado',
	'creditSchedule.invoiceStateWhereServiceWasProvided.placeholder': 'sigla de UF',
	'customer.documentType.CNPJ.name': 'já é o termo em português',
	'customer.documentType.CPF.name': 'já é o termo em português',
	'customer.documentNumber.placeholder': 'exemplo de dado',
	'customer.additionalFields.addressState.placeholder': 'sigla de UF',
	'customer.additionalFields.addressZipCode.placeholder': 'exemplo de dado',
	'customer.additionalFields.email.placeholder': 'e-mail de exemplo',
	'customer.updateFields.addressState.placeholder': 'sigla de UF',
	'customer.updateFields.addressZipCode.placeholder': 'exemplo de dado',
	'customer.updateFields.documentType.CNPJ.name': 'já é o termo em português',
	'customer.updateFields.documentType.CPF.name': 'já é o termo em português',
	'customer.updateFields.email.placeholder': 'e-mail de exemplo',
	'employee.documentType.CPF.name': 'já é o termo em português',
	'employee.updateFields.addressState.placeholder': 'sigla de UF',
	'employee.updateFields.addressZipCode.placeholder': 'exemplo de dado',
	'employee.updateFields.documentType.CPF.name': 'já é o termo em português',
	'employee.updateFields.email.placeholder': 'e-mail de exemplo',
	'file.scheduleId.placeholder': 'GUID de exemplo',
	'file.fileId.placeholder': 'GUID de exemplo',
	'file.fileName.placeholder': 'nome de arquivo de exemplo',
	'payment.scheduleId.placeholder': 'GUID de exemplo',
	'payment.entryId.placeholder': 'GUID de exemplo',
	'receipt.scheduleId.placeholder': 'GUID de exemplo',
	'scheduleFile.scheduleId.placeholder': 'GUID de exemplo',
	'scheduleFile.fileId.placeholder': 'GUID de exemplo',
	'serviceInvoice.scheduleId.placeholder': 'GUID de exemplo',
	'serviceInvoice.cityWhereServiceWasProvided.placeholder': 'exemplo de dado',
	'serviceInvoice.stateWhereServiceWasProvided.placeholder': 'sigla de UF',
	'serviceInvoice.serviceInvoiceId.placeholder': 'GUID de exemplo',
	'_.apiToken.displayName': 'jargão: token',
	'_.options.filter.placeholder': 'expressão OData de exemplo',
};

describe('o dicionário pt-BR contra a árvore real do node', () => {
	it('não tem chave órfã', () => {
		const orphans = Object.keys(ptBR).filter((key) => inventory[key] === undefined);

		expect(orphans).toEqual([]);
	});

	it('não nomeia campo que a propriedade não tem', () => {
		const unknown: string[] = [];

		for (const [key, fields] of Object.entries(ptBR)) {
			for (const field of Object.keys(fields)) {
				if (inventory[key]?.[field] === undefined) unknown.push(`${key}.${field}`);
			}
		}

		expect(unknown).toEqual([]);
	});

	it('declara todo texto que ficou em inglês', () => {
		const untranslated: string[] = [];

		for (const [key, fields] of Object.entries(ptBR)) {
			for (const [field, text] of Object.entries(fields)) {
				if (text === inventory[key]?.[field] && KEPT_IN_ENGLISH[`${key}.${field}`] === undefined) {
					untranslated.push(`${key}.${field}`);
				}
			}
		}

		expect(untranslated).toEqual([]);
	});

	/**
	 * A lista acima só serve enquanto descrever a realidade: uma entrada que foi
	 * traduzida depois, e continuou declarada, esconderia a próxima que ficar em inglês
	 * no mesmo lugar.
	 */
	it('não carrega declaração que sobrou', () => {
		const stale = Object.keys(KEPT_IN_ENGLISH).filter((declared) => {
			const field = declared.slice(declared.lastIndexOf('.') + 1);
			const key = declared.slice(0, declared.lastIndexOf('.'));

			return ptBR[key]?.[field] !== inventory[key]?.[field];
		});

		expect(stale).toEqual([]);
	});
});
