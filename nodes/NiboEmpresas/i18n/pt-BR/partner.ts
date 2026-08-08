import type { Translations } from '../localize';

/** Escopo `partner` — 7 entradas. */
export const partner: Translations = {
	"partner.operation": {
		displayName: "Operação",
	},
	"partner.operation.create": {
		name: "Criar",
		description: "Adiciona um sócio à organização",
		action: "Criar um sócio",
	},
	"partner.operation.delete": {
		name: "Excluir",
		description: "Remove um sócio da organização",
		action: "Excluir um sócio",
	},
	"partner.operation.get": {
		name: "Buscar",
		description: "Busca um sócio pelo ID",
		action: "Buscar um sócio",
	},
	"partner.operation.list": {
		name: "Buscar Vários",
		description: "Busca os sócios da organização",
		action: "Buscar vários sócios",
	},
	"partner.operation.update": {
		name: "Atualizar",
		description: "Altera os campos indicados abaixo, deixando todos os outros campos do sócio como estão",
		action: "Atualizar um sócio",
	},
	"partner.partnerId": {
		displayName: "ID do Sócio",
		description: "O ID do sócio sobre o qual atuar, como o Nibo o devolve no campo ID",
	},
};
