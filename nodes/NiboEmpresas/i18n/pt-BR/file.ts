import type { Translations } from '../localize';

/** Escopo `file` — 10 entradas. */
export const file: Translations = {
	"file.operation": {
		displayName: "Operação",
	},
	"file.operation.download": {
		name: "Baixar",
		description: "Recupera de volta um documento armazenado, para o campo binário do item",
		action: "Baixar um arquivo",
	},
	"file.operation.upload": {
		name: "Enviar",
		description: "Armazena um documento no Nibo e recebe o ID de volta, sem anexá-lo a nada ainda",
		action: "Enviar um arquivo",
	},
	"file.operation.uploadAndAttach": {
		name: "Enviar e Anexar",
		description: "Armazena um documento e o coloca numa conta em uma única operação, confirmando depois que ele está lá",
		action: "Enviar um arquivo e anexá-lo a uma conta",
	},
	"file.uploadNotice": {
		displayName: "Quem tiver o ID de um arquivo armazenado aqui consegue baixar o documento sem token: o link que o Nibo publica para ele é público. Não envie nada que não possa ser lido por quem tiver o link.",
	},
	"file.binaryProperty": {
		displayName: "Campo Binário de Entrada",
		description: "O campo binário do item de entrada que contém o documento. O arquivo nunca vem do disco — é o que quer que o node anterior tenha colocado no item, que é o que um node no programa de verificação do n8n tem permissão de ler.",
	},
	"file.scheduleId": {
		displayName: "ID da Conta",
		description: "A conta em que o documento entra, a receber ou a pagar tanto faz — esta API tem uma única rota para as duas, e é a de contas a receber. O node consulta o Nibo sobre esta conta antes de enviar qualquer coisa: uma conta que não existe é aceita ao anexar sem dizer uma palavra, e o documento ficaria no armazenamento, onde nenhuma rota desta API consegue encontrá-lo de novo.",
		placeholder: "b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90",
	},
	"file.fileId": {
		displayName: "ID do Arquivo",
		description: "O ID que Enviar retornou, ou o fileId de um anexo como Conta - Anexo o lista. Não há rota que liste os arquivos de uma organização, então um ID que nunca foi anotado não pode ser encontrado de novo.",
		placeholder: "5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1",
	},
	"file.outputBinaryProperty": {
		displayName: "Colocar Arquivo de Saída no Campo",
		description: "O campo binário do item de saída em que o documento é colocado",
	},
	"file.fileName": {
		displayName: "Nome do Arquivo",
		description: "Como o documento é chamado: o nome sob o qual o Nibo o arquiva ao enviar, e o nome que o campo binário recebe ao baixar. Deixado em branco, é usado o nome que o arquivo já carrega.",
		placeholder: "invoice-2026-07.pdf",
	},
};
