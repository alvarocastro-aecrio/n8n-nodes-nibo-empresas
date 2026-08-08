import type { Translations } from '../localize';

/** Escopo `payment` — 27 entradas. */
export const payment: Translations = {
	"payment.operation": {
		displayName: "Operação",
	},
	"payment.operation.create": {
		name: "Criar",
		description: "Registra um valor já pago, criando a conta a pagar e liquidando-a de uma vez",
		action: "Criar um pagamento",
	},
	"payment.operation.delete": {
		name: "Excluir",
		description: "Remove o pagamento, o que devolve a conta a pagar que ele liquidou para não paga",
		action: "Excluir um pagamento",
	},
	"payment.operation.get": {
		name: "Buscar",
		description: "Busca um pagamento pelo ID",
		action: "Buscar um pagamento",
	},
	"payment.operation.list": {
		name: "Buscar Vários",
		description: "Busca os pagamentos da organização",
		action: "Buscar vários pagamentos",
	},
	"payment.operation.settle": {
		name: "Liquidar",
		description: "Registra que uma conta a pagar já existente foi paga",
		action: "Liquidar uma conta a pagar",
	},
	"payment.createNotice": {
		displayName: "Todos os campos abaixo são exigidos por esta API. Sem uma conta bancária, em especial, ela responde sucesso e cria uma conta a pagar em aberto em vez de um lançamento liquidado — por isso o node se recusa a enviar sem ela.",
	},
	"payment.stakeholderId": {
		displayName: "Contato",
		description: "O contato ao qual este pagamento se refere. A lista mostra apenas os tipos que a API aceita deste lado — medido em 27/07/2026, a mesma matriz que as contas seguem, já que um pagamento cria uma conta a pagar por baixo. Qualquer outro tipo é recusado com \"Stakeholder is not compatible\".",
	},
	"payment.categories": {
		displayName: "Categorias",
		description: "As linhas em que este lançamento é dividido. O valor é a soma delas — esta API também não guarda um total próprio aqui.",
		placeholder: "Adicionar Categoria",
	},
	"payment.categories.category": {
		displayName: "Categoria",
	},
	"payment.description": {
		displayName: "Descrição",
		description: "Do que se trata este lançamento, como vai aparecer no Nibo",
	},
	"payment.accrualDate": {
		displayName: "Data de Competência",
		description: "O mês a que isto pertence na contabilidade. Se deixado em branco, a API copia silenciosamente a data em que o dinheiro se moveu.",
	},
	"payment.isFlagged": {
		displayName: "Sinalizado",
		description: "Se deve levantar a sinalização que o Nibo mostra ao lado de um lançamento que precisa de atenção",
	},
	"payment.additionalFields": {
		displayName: "Campos Adicionais",
		placeholder: "Adicionar Campo",
	},
	"payment.additionalFields.reference": {
		displayName: "Referência",
		description: "Uma referência livre, sua, como um número de fatura ou de contrato",
	},
	"payment.scheduleId": {
		displayName: "ID da Conta a Pagar",
		description: "O ID da conta a pagar a liquidar, como o Nibo o devolve no campo scheduleId. O node lê essa conta antes de escrever qualquer coisa: esta API aceita uma conta a receber por essa mesma rota e lança o dinheiro no lado errado do caixa sem avisar.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"payment.accountId": {
		displayName: "Conta Bancária Name or ID",
		description: "A conta pela qual o dinheiro passou. A API recusa uma liquidação sem uma — ela responde HTTP 500 \"Conta bancária não encontrada.\" — por isso o node pede isso aqui em vez de deixar essa frase aparecer depois. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"payment.date": {
		displayName: "Data",
		description: "O dia em que o dinheiro realmente se moveu. Não pode ser anterior à data do saldo inicial da conta escolhida acima — a API recusa isso com \"A data da baixa é inferior a data do saldo inicial da conta\".",
	},
	"payment.value": {
		displayName: "Valor",
		description: "Quanto se moveu, digitado como um número positivo em ambos os casos. Um valor menor que o da conta é permitido e não é erro: um pagamento parcial é registrado e a conta continua em aberto — medido em 27/07/2026, onde 100 contra uma conta de 400 respondeu 200 e a deixou não paga.",
	},
	"payment.entryId": {
		displayName: "ID do Lançamento",
		description: "O ID do lançamento a ler, como o Nibo o devolve no campo entryId. É assim que esta coleção chama sua chave — o nome mais curto que toda outra coleção usa não é um campo aqui, e ordenar por ele responde HTTP 500. Ele é lido através da lista filtrada por ID, porque esta API não tem uma rota que leia um lançamento sozinho.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"payment.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"payment.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"payment.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"payment.filters.conditions": {
		displayName: "Condição",
	},
	"payment.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"payment.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"payment.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
