import type { Translations } from '../localize';

/** Escopo `bankTransfer` — 18 entradas. */
export const bankTransfer: Translations = {
	"bankTransfer.operation": {
		displayName: "Operação",
	},
	"bankTransfer.operation.create": {
		name: "Criar",
		description: "Move dinheiro de uma conta da organização para outra, o que registra um pagamento em uma e um recebimento na outra",
		action: "Criar uma transferência bancária",
	},
	"bankTransfer.operation.delete": {
		name: "Excluir",
		description: "Desfaz a transferência, o que remove os dois lançamentos que ela criou e devolve os dois saldos ao que eram",
		action: "Excluir uma transferência bancária",
	},
	"bankTransfer.operation.list": {
		name: "Buscar Várias",
		description: "Busca as transferências da organização",
		action: "Buscar várias transferências bancárias",
	},
	"bankTransfer.createNotice": {
		displayName: "Uma conta ausente ou desconhecida é respondida por esta API com \"Não é possivel transferir valores de contas virtuais\" — uma frase sobre uma configuração que não tem nada a ver com isso. O node confere as duas contas, o valor e os dois lados antes de enviar qualquer coisa.",
	},
	"bankTransfer.originAccountId": {
		displayName: "Conta de Origem Name or ID",
		description: "A conta de onde o dinheiro sai. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"bankTransfer.destinyAccountId": {
		displayName: "Conta de Destino Name or ID",
		description: "A conta a que o dinheiro chega. Ela não pode ser igual à origem — esta API recusa isso com \"Você não pode transferir valores entre as mesmas contas correntes\", e o node recusa primeiro. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"bankTransfer.date": {
		displayName: "Data",
		description: "O dia em que o dinheiro se moveu. Diferente de uma baixa, esta data pode cair antes da data do saldo de abertura de qualquer uma das contas: a API foi medida para aceitar isso, então o node não a recusa.",
	},
	"bankTransfer.value": {
		displayName: "Valor",
		description: "Quanto se moveu, como um número positivo. Zero, um valor negativo e nenhum valor são a mesma recusa nesta API — \"O valor informado deve ser positivo\" — e o node faz essa recusa antes de enviar.",
	},
	"bankTransfer.description": {
		displayName: "Descrição",
		description: "Do que se trata a transferência. Deixado vazio, ele não é enviado, e o Nibo escreve o seu próprio — \"Transferência de {origin} para {destination}\". De um jeito ou de outro o texto volta no campo de identificador dos dois lançamentos: esta API não tem campo de descrição em uma transferência.",
	},
	"bankTransfer.transferId": {
		displayName: "ID da Transferência",
		description: "O ID da transferência a desfazer, como Buscar Várias o retorna. É o ID da própria transferência, não de nenhum dos lançamentos que ela criou: um ID de lançamento aqui responde HTTP 500 \"Transferência não encontrada\", que foi como esta rota foi descoberta, para início de conversa.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"bankTransfer.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"bankTransfer.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"bankTransfer.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"bankTransfer.filters.conditions": {
		displayName: "Condição",
	},
	"bankTransfer.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"bankTransfer.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"bankTransfer.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
