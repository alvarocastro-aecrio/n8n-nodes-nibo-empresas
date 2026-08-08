import type { Translations } from '../localize';

/** Escopo `_` — 29 entradas. */
export const shared: Translations = {
	"_.authMode": {
		displayName: "Autenticação",
	},
	"_.authMode.credential": {
		name: "Credencial",
		description: "Usa uma credencial salva para o node inteiro",
	},
	"_.authMode.field": {
		name: "API Token (Por Item)",
		description: "Lê o token do campo abaixo, resolvido para cada item de entrada",
	},
	"_.apiToken": {
		displayName: "API Token",
		description: "O API Token da organização a usar para este item. Normalmente uma expressão que o lê do item de entrada, o que é o que permite a um único node percorrer uma carteira inteira de organizações. Nesta API o token é a organização: cada item lê os livros do seu próprio token.",
	},
	"_.resource": {
		displayName: "Recurso",
	},
	"_.resource.bankAccount": {
		name: "Conta Bancária",
		description: "Uma conta da organização, que um lançamento liquidado tem que apontar",
	},
	"_.resource.bankTransfer": {
		name: "Transferência Bancária",
		description: "Dinheiro movido de uma conta da organização para outra",
	},
	"_.resource.category": {
		name: "Categoria",
		description: "Uma linha do plano de contas, sob a qual uma conta é arquivada",
	},
	"_.resource.collection": {
		name: "Cobrança",
		description: "Uma cobrança — boleto e Pix — emitida a partir de uma conta a receber",
	},
	"_.resource.customer": {
		name: "Contato - Cliente",
	},
	"_.resource.employee": {
		name: "Contato - Funcionário",
	},
	"_.resource.partner": {
		name: "Contato - Sócio",
	},
	"_.resource.supplier": {
		name: "Contato - Fornecedor",
	},
	"_.resource.costCenter": {
		name: "Centro de Custo",
		description: "Uma parte da empresa a que um valor é atribuído, sozinha ou compartilhada",
	},
	"_.resource.file": {
		name: "Arquivo",
		description: "Um documento armazenado no Nibo, antes e depois de pertencer a uma conta",
	},
	"_.resource.annotation": {
		name: "Conta - Anotação",
		description: "Uma nota escrita numa conta, que esta API consegue escrever mas nunca ler de volta",
	},
	"_.resource.creditSchedule": {
		name: "Conta - A Receber",
		description: "Um lançamento de contas a receber, com vencimento numa data e dividido em categorias",
	},
	"_.resource.debitSchedule": {
		name: "Conta - A Pagar",
		description: "Um lançamento de contas a pagar, com vencimento numa data e dividido em categorias",
	},
	"_.resource.scheduleFile": {
		name: "Conta - Anexo",
		description: "Os documentos anexados a uma conta",
	},
	"_.resource.serviceInvoice": {
		name: "Nota Fiscal de Serviço",
		description: "Uma nota fiscal de serviço brasileira — NFS-e — emitida a partir de uma conta a receber",
	},
	"_.resource.payment": {
		name: "Lançamento - Pagamento",
		description: "uma conta a pagar liquidada — a conta a pagar depois de o dinheiro ter se movido",
	},
	"_.resource.receipt": {
		name: "Lançamento - Recebimento",
		description: "uma conta a receber liquidada — a conta a receber depois de o dinheiro ter se movido",
	},
	"_.options": {
		displayName: "Opções",
		placeholder: "Adicionar opção",
	},
	"_.options.allowMovingLockBack": {
		displayName: "Permitir Voltar o Bloqueio",
		description: "Se uma Data de Bloqueio de Saldo anterior à atual pode ser enviada. Voltar o bloqueio destranca um período contábil que estava fechado, então o node recusa a menos que isto esteja ligado.",
	},
	"_.options.authorizationTimeout": {
		displayName: "Timeout de Autorização",
		description: "Por quanto tempo acompanhar uma nota antes de devolvê-la, em segundos. É um teto, não uma espera: o node retorna assim que a prefeitura responde, então um número generoso não custa nada numa nota que autoriza em cinco segundos. Atingido, o node retorna o registro como está, dizendo que a nota foi emitida e ainda não está autorizada — nunca que algo falhou.",
	},
	"_.options.failOnIncomplete": {
		displayName: "Falhar em Resultados Incompletos",
		description: "Se deve falhar quando o resultado pode estar incompleto, em vez de retornar os registros com um aviso no último item. Registros gravados enquanto as páginas são lidas podem escapar do cursor, o que aparece como uma contagem de registros que muda no meio da varredura ou como menos registros do que o servidor informou. Deixado de fora, a varredura falha: uma lista que pode ter perdido registros é o tipo de coisa que faz um workflow ser descartado.",
	},
	"_.options.filter": {
		displayName: "Filtro (OData)",
		description: "Expressão OData enviada como $filter, escrita à mão, para o que as condições não conseguem dizer — um grupo aninhado como (A or B) and C. Preencha e ela vira o filtro inteiro: as condições saem da tela e saem da requisição junto. Texto acentuado não precisa de tratamento especial, ex. contains(name,'SERVIÇOS'). Apóstrofo precisa: tem que ser dobrado, como em contains(name,'D''ALESSANDRO'), que é exatamente o que as condições fazem por você.",
		placeholder: "contains(name,'LTDA')",
	},
	"_.options.requestInterval": {
		displayName: "Intervalo Entre Requisições",
		description: "Quanto tempo esperar, em milissegundos, entre duas chamadas à API. Aplica-se entre itens de entrada e entre as páginas de uma varredura, nunca antes da primeira chamada. Deixe de fora e o node espera um segundo; ajuste para 0 para enviar as chamadas uma logo após a outra.",
	},
	"_.options.waitForAuthorization": {
		displayName: "Aguardar Autorização",
		description: "Se deve acompanhar uma nota até a prefeitura responder e devolver o registro final — com seu número, seu PDF e seu XML quando autorizada. Desligado, o node retorna a nota como ela nasceu, geralmente ainda na fila.",
	},
};
