import type { Translations } from '../localize';

/** Escopo `debitSchedule` — 7 entradas. */
export const debitSchedule: Translations = {
	"debitSchedule.operation": {
		displayName: "Operação",
	},
	"debitSchedule.operation.create": {
		name: "Criar",
		description: "Programa um valor para ser pago em uma data",
		action: "Criar uma conta a pagar",
	},
	"debitSchedule.operation.delete": {
		name: "Excluir",
		description: "Remove uma conta a pagar da organização",
		action: "Excluir uma conta a pagar",
	},
	"debitSchedule.operation.get": {
		name: "Buscar",
		description: "Busca uma conta a pagar pelo ID",
		action: "Buscar uma conta a pagar",
	},
	"debitSchedule.operation.list": {
		name: "Buscar Várias",
		description: "Busca as contas a pagar da organização",
		action: "Buscar várias contas a pagar",
	},
	"debitSchedule.operation.update": {
		name: "Atualizar",
		description: "Altera os campos indicados abaixo, deixando todos os outros campos da conta a pagar como estão",
		action: "Atualizar uma conta a pagar",
	},
	"debitSchedule.debitScheduleId": {
		displayName: "ID da Conta a Pagar",
		description: "O ID da conta a pagar em que trabalhar, como o Nibo o devolve no campo schedule ID",
	},
};
