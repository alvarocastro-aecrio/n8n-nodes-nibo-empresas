import type { Translations } from '../localize';

/** Escopo `supplier` — 7 entradas. */
export const supplier: Translations = {
	"supplier.operation": {
		displayName: "Operação",
	},
	"supplier.operation.create": {
		name: "Criar",
		description: "Adiciona um fornecedor à organização",
		action: "Criar um fornecedor",
	},
	"supplier.operation.delete": {
		name: "Excluir",
		description: "Remove um fornecedor da organização",
		action: "Excluir um fornecedor",
	},
	"supplier.operation.get": {
		name: "Buscar",
		description: "Busca um fornecedor pelo ID",
		action: "Buscar um fornecedor",
	},
	"supplier.operation.list": {
		name: "Buscar Vários",
		description: "Busca os fornecedores da organização",
		action: "Buscar vários fornecedores",
	},
	"supplier.operation.update": {
		name: "Atualizar",
		description: "Altera os campos indicados abaixo, deixando todos os outros campos do fornecedor como estão",
		action: "Atualizar um fornecedor",
	},
	"supplier.supplierId": {
		displayName: "ID do Fornecedor",
		description: "O ID do fornecedor sobre o qual atuar, como o Nibo o devolve no campo ID",
	},
};
