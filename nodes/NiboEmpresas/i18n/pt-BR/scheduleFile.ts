import type { Translations } from '../localize';

/** Escopo `scheduleFile` — 11 entradas. */
export const scheduleFile: Translations = {
	"scheduleFile.operation": {
		displayName: "Operação",
	},
	"scheduleFile.operation.attach": {
		name: "Anexar",
		description: "Coloca um documento já armazenado na Nibo numa conta, verificando primeiro que a conta existe e confirmando depois que o arquivo está nela",
		action: "Anexar um arquivo a uma conta",
	},
	"scheduleFile.operation.delete": {
		name: "Excluir",
		description: "Exclui o próprio documento, o que é mais do que tirá-lo desta conta: ele nunca mais pode ser anexado em lugar nenhum",
		action: "Excluir um arquivo de uma conta",
	},
	"scheduleFile.operation.listFiles": {
		name: "Buscar Várias",
		description: "Recupera os documentos anexados a uma conta",
		action: "Buscar vários arquivos de uma conta",
	},
	"scheduleFile.listNotice": {
		displayName: "A url de cada um desses registros é pública: quem a tiver baixa o documento sem token. Trate-o como o próprio documento, não como uma referência a ele.",
	},
	"scheduleFile.attachNotice": {
		displayName: "Um documento pertence a uma conta por vez. Anexar um arquivo que já está em outra conta o move: ele desaparece da primeira. Para ter o mesmo documento em duas contas, envie-o duas vezes.",
	},
	"scheduleFile.deleteNotice": {
		displayName: "Isto exclui o documento, não o vínculo entre ele e esta conta: o arquivo não pode ser anexado de novo em lugar nenhum, e a Nibo responde a qualquer tentativa com \"Arquivo não encontrado\". O arquivo armazenado em si também não é removido — um link para baixá-lo, obtido antes disso, ainda serve o documento depois.",
	},
	"scheduleFile.scheduleId": {
		displayName: "ID da Conta",
		description: "A conta a que os documentos pertencem. Uma conta a receber ou a pagar tanto faz: esta API tem uma única rota para as duas, e é a de contas a receber — perguntar pelo caminho de contas a pagar responde 404 seja qual for o ID.",
		placeholder: "b4d0a1e7-08bd-4a44-9f1e-6c2f7d3e5a90",
	},
	"scheduleFile.fileId": {
		displayName: "ID do Arquivo",
		description: "O documento, como Arquivo · Enviar o retornou ou como Buscar Várias o lista aqui. A Nibo verifica este ID e nunca verifica a conta a que ele está sendo anexado, motivo pelo qual o node pergunta pela conta primeiro.",
		placeholder: "5a0ab0ec-6f26-4f4e-9b7f-0e02f6a2c4d1",
	},
	"scheduleFile.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"scheduleFile.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "Uma conta carrega um punhado de documentos, então esta coleção é lida numa única chamada e o limite é aplicado ao que voltou",
	},
};
