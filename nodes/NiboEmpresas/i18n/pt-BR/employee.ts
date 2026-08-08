import type { Translations } from '../localize';

/** Escopo `employee` — 28 entradas. */
export const employee: Translations = {
	"employee.operation": {
		displayName: "Operação",
	},
	"employee.operation.create": {
		name: "Criar",
		description: "Adiciona um funcionário à organização",
		action: "Criar um funcionário",
	},
	"employee.operation.delete": {
		name: "Excluir",
		description: "Remove um funcionário da organização",
		action: "Excluir um funcionário",
	},
	"employee.operation.get": {
		name: "Buscar",
		description: "Busca um funcionário pelo ID",
		action: "Buscar um funcionário",
	},
	"employee.operation.list": {
		name: "Buscar Vários",
		description: "Busca os funcionários da organização",
		action: "Buscar vários funcionários",
	},
	"employee.operation.update": {
		name: "Atualizar",
		description: "Altera os campos indicados abaixo, deixando todos os outros campos do funcionário como estão",
		action: "Atualizar um funcionário",
	},
	"employee.employeeId": {
		displayName: "ID do Funcionário",
		description: "O ID do funcionário sobre o qual atuar, como o Nibo o devolve no campo ID",
	},
	"employee.documentType": {
		displayName: "Tipo de Documento",
	},
	"employee.documentType.CPF": {
		name: "CPF",
	},
	"employee.updateFields": {
		displayName: "Campos a Atualizar",
		description: "Os campos a alterar. Um campo omitido não é tocado: o contato mantém o que já está guardado no Nibo. Um campo adicionado e deixado vazio é gravado vazio, que é como se apaga um valor de propósito.",
		placeholder: "Adicionar Campo",
	},
	"employee.updateFields.addressCity": {
		displayName: "Cidade do Endereço",
	},
	"employee.updateFields.addressCountry": {
		displayName: "País do Endereço",
	},
	"employee.updateFields.addressDistrict": {
		displayName: "Bairro do Endereço",
	},
	"employee.updateFields.addressLine1": {
		displayName: "Endereço Linha 1",
		description: "Nome da rua",
	},
	"employee.updateFields.addressLine2": {
		displayName: "Endereço Linha 2",
		description: "O que completa o endereço, como um andar ou uma unidade",
	},
	"employee.updateFields.addressNumber": {
		displayName: "Número do Endereço",
		description: "Número da casa ou do prédio, que esta API guarda como um número",
	},
	"employee.updateFields.addressState": {
		displayName: "Estado do Endereço",
		placeholder: "RJ",
	},
	"employee.updateFields.addressZipCode": {
		displayName: "CEP do Endereço",
		placeholder: "20000000",
	},
	"employee.updateFields.cellPhone": {
		displayName: "Celular",
	},
	"employee.updateFields.companyName": {
		displayName: "Nome da Empresa",
		description: "O nome fantasia, quando for diferente do nome cadastrado",
	},
	"employee.updateFields.contactName": {
		displayName: "Nome do Contato",
	},
	"employee.updateFields.documentNumber": {
		displayName: "Número do Documento",
		description: "Somente dígitos, sem pontos, barras ou hífens",
	},
	"employee.updateFields.documentType": {
		displayName: "Tipo de Documento",
	},
	"employee.updateFields.documentType.CPF": {
		name: "CPF",
	},
	"employee.updateFields.email": {
		displayName: "E-mail",
		description: "Uma única string com todos os endereços, separados por vírgula. Esta API guarda os e-mails de um contato em um único campo, não em uma lista.",
		placeholder: "billing@example.com,accounts@example.com",
	},
	"employee.updateFields.name": {
		displayName: "Nome",
		description: "O nome cadastrado do contato",
	},
	"employee.updateFields.phone": {
		displayName: "Telefone",
	},
	"employee.updateFields.webSite": {
		displayName: "Site",
	},
};
