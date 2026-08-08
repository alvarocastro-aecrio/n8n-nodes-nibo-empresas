import type { Translations } from '../localize';

/** Escopo `customer` — 54 entradas. */
export const customer: Translations = {
	"customer.operation": {
		displayName: "Operação",
	},
	"customer.operation.create": {
		name: "Criar",
		description: "Adiciona um cliente à organização",
		action: "Criar um cliente",
	},
	"customer.operation.delete": {
		name: "Excluir",
		description: "Remove um cliente da organização",
		action: "Excluir um cliente",
	},
	"customer.operation.get": {
		name: "Buscar",
		description: "Busca um cliente pelo ID",
		action: "Buscar um cliente",
	},
	"customer.operation.list": {
		name: "Buscar Várias",
		description: "Busca os clientes da organização",
		action: "Buscar vários clientes",
	},
	"customer.operation.update": {
		name: "Atualizar",
		description: "Altera os campos indicados abaixo, deixando todos os outros campos do cliente como estão",
		action: "Atualizar um cliente",
	},
	"customer.customerId": {
		displayName: "ID do Cliente",
		description: "O ID do cliente sobre o qual atuar, como o Nibo o devolve no campo ID",
	},
	"customer.name": {
		displayName: "Nome",
		description: "O nome cadastrado do contato",
	},
	"customer.documentType": {
		displayName: "Tipo de Documento",
	},
	"customer.documentType.CNPJ": {
		name: "CNPJ",
	},
	"customer.documentType.CPF": {
		name: "CPF",
	},
	"customer.documentNumber": {
		displayName: "Número do Documento",
		description: "Somente dígitos, sem pontos, barras ou hífens. Opcional: se deixado em branco, o contato é criado sem nenhum documento.",
		placeholder: "00000000000000",
	},
	"customer.additionalFields": {
		displayName: "Campos Adicionais",
		placeholder: "Adicionar Campo",
	},
	"customer.additionalFields.addressCity": {
		displayName: "Cidade do Endereço",
	},
	"customer.additionalFields.addressCountry": {
		displayName: "País do Endereço",
	},
	"customer.additionalFields.addressDistrict": {
		displayName: "Bairro do Endereço",
	},
	"customer.additionalFields.addressLine1": {
		displayName: "Endereço Linha 1",
		description: "Nome da rua",
	},
	"customer.additionalFields.addressLine2": {
		displayName: "Endereço Linha 2",
		description: "O que completa o endereço, como um andar ou uma unidade",
	},
	"customer.additionalFields.addressNumber": {
		displayName: "Número do Endereço",
		description: "Número da casa ou do prédio, que esta API guarda como um número",
	},
	"customer.additionalFields.addressState": {
		displayName: "Estado do Endereço",
		placeholder: "RJ",
	},
	"customer.additionalFields.addressZipCode": {
		displayName: "CEP do Endereço",
		placeholder: "20000000",
	},
	"customer.additionalFields.cellPhone": {
		displayName: "Celular",
	},
	"customer.additionalFields.companyName": {
		displayName: "Nome da Empresa",
		description: "O nome fantasia, quando for diferente do nome cadastrado",
	},
	"customer.additionalFields.contactName": {
		displayName: "Nome do Contato",
	},
	"customer.additionalFields.email": {
		displayName: "E-mail",
		description: "Uma única string com todos os endereços, separados por vírgula. Esta API guarda os e-mails de um contato em um único campo, não em uma lista.",
		placeholder: "billing@example.com,accounts@example.com",
	},
	"customer.additionalFields.phone": {
		displayName: "Telefone",
	},
	"customer.additionalFields.webSite": {
		displayName: "Site",
	},
	"customer.updateFields": {
		displayName: "Campos a Atualizar",
		description: "Os campos a alterar. Um campo omitido não é tocado: o contato mantém o que já está guardado no Nibo. Um campo adicionado e deixado vazio é gravado vazio, que é como se apaga um valor de propósito.",
		placeholder: "Adicionar Campo",
	},
	"customer.updateFields.addressCity": {
		displayName: "Cidade do Endereço",
	},
	"customer.updateFields.addressCountry": {
		displayName: "País do Endereço",
	},
	"customer.updateFields.addressDistrict": {
		displayName: "Bairro do Endereço",
	},
	"customer.updateFields.addressLine1": {
		displayName: "Endereço Linha 1",
		description: "Nome da rua",
	},
	"customer.updateFields.addressLine2": {
		displayName: "Endereço Linha 2",
		description: "O que completa o endereço, como um andar ou uma unidade",
	},
	"customer.updateFields.addressNumber": {
		displayName: "Número do Endereço",
		description: "Número da casa ou do prédio, que esta API guarda como um número",
	},
	"customer.updateFields.addressState": {
		displayName: "Estado do Endereço",
		placeholder: "RJ",
	},
	"customer.updateFields.addressZipCode": {
		displayName: "CEP do Endereço",
		placeholder: "20000000",
	},
	"customer.updateFields.cellPhone": {
		displayName: "Celular",
	},
	"customer.updateFields.companyName": {
		displayName: "Nome da Empresa",
		description: "O nome fantasia, quando for diferente do nome cadastrado",
	},
	"customer.updateFields.contactName": {
		displayName: "Nome do Contato",
	},
	"customer.updateFields.documentNumber": {
		displayName: "Número do Documento",
		description: "Somente dígitos, sem pontos, barras ou hífens",
	},
	"customer.updateFields.documentType": {
		displayName: "Tipo de Documento",
	},
	"customer.updateFields.documentType.CNPJ": {
		name: "CNPJ",
	},
	"customer.updateFields.documentType.CPF": {
		name: "CPF",
	},
	"customer.updateFields.email": {
		displayName: "E-mail",
		description: "Uma única string com todos os endereços, separados por vírgula. Esta API guarda os e-mails de um contato em um único campo, não em uma lista.",
		placeholder: "billing@example.com,accounts@example.com",
	},
	"customer.updateFields.name": {
		displayName: "Nome",
		description: "O nome cadastrado do contato",
	},
	"customer.updateFields.phone": {
		displayName: "Telefone",
	},
	"customer.updateFields.webSite": {
		displayName: "Site",
	},
	"customer.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"customer.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"customer.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"customer.filters.conditions": {
		displayName: "Condição",
	},
	"customer.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A or B) and C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"customer.filterCombine.and": {
		name: "E",
		description: "Retorna somente os registros que atendem a todas as condições",
	},
	"customer.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
