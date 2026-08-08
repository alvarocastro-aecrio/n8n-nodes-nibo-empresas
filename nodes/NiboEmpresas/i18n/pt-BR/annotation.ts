import type { Translations } from '../localize';

/** Escopo `annotation` — 5 entradas. */
export const annotation: Translations = {
	"annotation.operation": {
		displayName: "Operação",
	},
	"annotation.operation.create": {
		name: "Criar",
		description: "Escreve uma anotação numa conta, depois de checar que a conta existe — o único momento em que isso pode ser checado",
		action: "Criar uma anotação numa conta",
	},
	"annotation.createNotice": {
		displayName: "Uma anotação não pode ser lida de volta, editada ou excluída: esta API só as escreve, e o ID que ela retorna não abre nada. Ela também não deduplica — rodar o mesmo item de novo escreve a anotação uma segunda vez, e não há como remover nenhuma das cópias. Se um item é processado duas vezes é inteiramente responsabilidade do workflow em torno deste node.",
	},
	"annotation.scheduleId": {
		displayName: "ID da Conta",
		description: "A conta em que a anotação é escrita, a receber ou a pagar — uma única rota atende as duas, e é a de contas a receber. O node lê a conta antes de escrever: esta API aceita uma anotação numa conta que não existe, respondendo 200 com um ID, e essa anotação nunca mais pode ser encontrada.",
		placeholder: "b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90",
	},
	"annotation.body": {
		displayName: "Texto",
		description: "O que a anotação diz. Acentos e URLs passam sem alteração. Um texto vazio é recusado aqui em vez de pela API, que responde com HTTP 500 \"Informe uma anotação.\".",
	},
};
