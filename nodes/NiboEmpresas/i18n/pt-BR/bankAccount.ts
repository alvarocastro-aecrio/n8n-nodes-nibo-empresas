import type { Translations } from '../localize';

/** Escopo `bankAccount` — 29 entradas. */
export const bankAccount: Translations = {
	"bankAccount.operation": {
		displayName: "Operação",
	},
	"bankAccount.operation.create": {
		name: "Criar",
		description: "Abre uma conta nova na organização — um ato que esta API não desfaz",
		action: "Criar uma conta bancária",
	},
	"bankAccount.operation.listBalances": {
		name: "Buscar Saldos",
		description: "Busca o que cada conta possui, a partir da visão de saldos — uma coleção própria, com campos próprios",
		action: "Buscar os saldos das contas bancárias",
	},
	"bankAccount.operation.list": {
		name: "Buscar Várias",
		description: "Busca as contas bancárias da organização",
		action: "Buscar várias contas bancárias",
	},
	"bankAccount.operation.importBankStatement": {
		name: "Importar Extrato Bancário",
		description: "Envia as linhas de um extrato para a fila de conciliação de uma conta, um item de entrada por linha",
		action: "Importar um extrato bancário",
	},
	"bankAccount.operation.update": {
		name: "Atualizar",
		description: "Altera os campos que você listar e deixa todos os outros exatamente como estão — incluindo a data de bloqueio do saldo, que é como uma automação de fechamento tranca um período",
		action: "Atualizar uma conta bancária",
	},
	"bankAccount.createAccountNotice": {
		displayName: "Uma conta não pode ser excluída nem arquivada por esta API: o que isto cria é permanente, e escondê-la só é possível na própria tela do Nibo. O node também confere a data de abertura depois de criar — esta API a grava um dia antes na criação, e o node a corrige.",
	},
	"bankAccount.name": {
		displayName: "Nome",
		description: "Como a conta é chamada no Nibo",
		placeholder: "Conta corrente Itaú",
	},
	"bankAccount.openBalance": {
		displayName: "Saldo de Abertura",
		description: "O que a conta possui no dia de abertura. Torna-se o saldo inicial que Buscar Saldos reporta.",
	},
	"bankAccount.dateOfOpenBalance": {
		displayName: "Data do Saldo de Abertura",
		description: "O dia em que o saldo de abertura foi fixado. Nada pode ser lançado na conta antes dele. A API grava isto um dia antes na criação; o node lê a conta de volta e corrige a data, para que o dia que você escolher seja o dia que permanece.",
	},
	"bankAccount.bankAccountId": {
		displayName: "Conta Bancária Name or ID",
		description: "A conta a alterar. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"bankAccount.updateFields": {
		displayName: "Campos a Atualizar",
		description: "Os campos a alterar. Todo campo que você não adicionar permanece exatamente como está — o bloqueio de saldo incluído.",
		placeholder: "Adicionar Campo",
	},
	"bankAccount.updateFields.balanceLockDate": {
		displayName: "Data de Bloqueio do Saldo",
		description: "O dia até o qual a contabilidade está bloqueada — nada antes dele pode ser escrito ou editado. Avançá-lo é como uma automação de fechamento fecha um mês. Recuá-lo desbloqueia um período fechado, então o node recusa isso a menos que a opção \"Allow Moving the Lock Back\" esteja ativada.",
	},
	"bankAccount.updateFields.name": {
		displayName: "Nome",
		description: "Como a conta é chamada no Nibo",
	},
	"bankAccount.updateFields.openBalance": {
		displayName: "Saldo de Abertura",
		description: "O que a conta possuía no dia de abertura",
	},
	"bankAccount.updateFields.dateOfOpenBalance": {
		displayName: "Data do Saldo de Abertura",
		description: "O dia em que o saldo de abertura foi fixado. Nada pode ser lançado na conta antes dele.",
	},
	"bankAccount.importNotice": {
		displayName: "Cada item de entrada é uma linha do extrato, e o node os envia como um lote único. As linhas vão para a fila de conciliação, não para o livro-razão: nenhum lançamento aparece e nenhum saldo se altera. O Nibo responde a isso com 204 e um corpo vazio, tenha arquivado tudo ou apenas metade, e nada nesta API permite ler a fila de volta — por isso toda conferência que este node faz acontece antes de as linhas serem enviadas.",
	},
	"bankAccount.accountId": {
		displayName: "Conta Bancária Name or ID",
		description: "A conta a que o extrato pertence. É lida do primeiro item de entrada, e todo item precisa concordar com ela: um lote vai para uma conta. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"bankAccount.batchName": {
		displayName: "Nome do Lote",
		description: "Como chamar este lote no Nibo, normalmente o nome do arquivo de onde ele veio. Lido do primeiro item de entrada, já que o lote é uma coisa só.",
		placeholder: "extrato.csv",
	},
	"bankAccount.description": {
		displayName: "Descrição",
		description: "O que esta linha do extrato diz, como vai aparecer na tela de conciliação. Lida por item, então normalmente é uma expressão sobre a linha recebida.",
	},
	"bankAccount.value": {
		displayName: "Valor",
		description: "Quanto se moveu nesta linha, negativo para saída de dinheiro e positivo para entrada de dinheiro. Diferente do resto deste node, aqui é o sinal que diz a direção: um extrato tem as duas.",
	},
	"bankAccount.date": {
		displayName: "Data",
		description: "O dia desta linha. Ele não pode cair antes do dia em que a conta foi aberta: o Nibo aceita essa linha com 204 e não arquiva nada, então o node a recusa em vez disso. Escrita à mão, ela precisa ser ano-mês-dia — uma data como 29/07/2026 é recusada em vez de adivinhada, porque 07/12/2026 poderia ser qualquer um dos dois meses.",
	},
	"bankAccount.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"bankAccount.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "Uma organização normalmente tem poucas contas, então uma página costuma bastar",
	},
	"bankAccount.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"bankAccount.filters.conditions": {
		displayName: "Condição",
	},
	"bankAccount.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que serve o Filter (OData) em Opções.",
	},
	"bankAccount.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"bankAccount.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
