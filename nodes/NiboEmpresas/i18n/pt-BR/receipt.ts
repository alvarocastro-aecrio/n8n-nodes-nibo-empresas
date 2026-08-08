import type { Translations } from '../localize';

/** Escopo `receipt` — 8 entradas. */
export const receipt: Translations = {
	"receipt.operation": {
		displayName: "Operação",
	},
	"receipt.operation.create": {
		name: "Criar",
		description: "Registra um valor já recebido, criando a conta a receber e liquidando-a de uma vez",
		action: "Criar um recebimento",
	},
	"receipt.operation.delete": {
		name: "Excluir",
		description: "Remove o recebimento, o que devolve a conta a receber que ele liquidou para não paga",
		action: "Excluir um recebimento",
	},
	"receipt.operation.get": {
		name: "Buscar",
		description: "Busca um recebimento pelo ID",
		action: "Buscar um recebimento",
	},
	"receipt.operation.list": {
		name: "Buscar Vários",
		description: "Busca os recebimentos da organização",
		action: "Buscar vários recebimentos",
	},
	"receipt.operation.settle": {
		name: "Liquidar",
		description: "Registra que uma conta a receber já existente foi recebida",
		action: "Liquidar uma conta a receber",
	},
	"receipt.stakeholderId": {
		displayName: "Contato",
		description: "O contato ao qual este recebimento se refere. A lista mostra apenas os tipos que a API aceita deste lado — medido em 27/07/2026, a mesma matriz que as contas seguem, já que um recebimento cria uma conta a receber por baixo. Qualquer outro tipo é recusado com \"Stakeholder is not compatible\".",
	},
	"receipt.scheduleId": {
		displayName: "ID da Conta a Receber",
		description: "O ID da conta a receber a liquidar, como o Nibo o devolve no campo scheduleId. O node lê essa conta antes de escrever qualquer coisa: esta API aceita uma conta a pagar por essa mesma rota e lança o dinheiro no lado errado do caixa sem avisar.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
};
