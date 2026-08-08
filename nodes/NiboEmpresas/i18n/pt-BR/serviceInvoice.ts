import type { Translations } from '../localize';

/** Escopo `serviceInvoice` — 24 entradas. */
export const serviceInvoice: Translations = {
	"serviceInvoice.operation": {
		displayName: "Operação",
	},
	"serviceInvoice.operation.cancel": {
		name: "Cancelar",
		description: "Cancela a nota na prefeitura, o que mantém o registro no lugar com o status definido como Cancelada",
		action: "Cancelar uma nota fiscal de serviço",
	},
	"serviceInvoice.operation.get": {
		name: "Buscar",
		description: "Busca uma nota pelo ID, lida através da lista — esta API não tem uma rota de busca por ID para uma nota",
		action: "Buscar uma nota fiscal de serviço",
	},
	"serviceInvoice.operation.list": {
		name: "Buscar Várias",
		description: "Busca as notas fiscais de serviço da organização",
		action: "Buscar várias notas fiscais de serviço",
	},
	"serviceInvoice.operation.listProfiles": {
		name: "Buscar Vários Perfis de Serviço",
		description: "Busca os perfis de serviço, que é por onde uma nota é emitida e a única forma de saber se esta organização sequer emite uma",
		action: "Buscar vários perfis de serviço",
	},
	"serviceInvoice.operation.issue": {
		name: "Emitir",
		description: "Emite uma nota a partir de uma conta a receber e, a menos que a espera esteja desligada, acompanha-a até a prefeitura responder",
		action: "Emitir uma nota fiscal de serviço",
	},
	"serviceInvoice.listNotice": {
		displayName: "O pdfFileUrl e o xmlFileUrl destes registros são públicos: abrem sem token, e continuam respondendo depois que a nota é cancelada. Trate um link como o próprio documento, não como uma referência a ele.",
	},
	"serviceInvoice.profilesNotice": {
		displayName: "Um perfil de serviço decide qual serviço a nota declara, quanto imposto cobra e as observações impressas nela — onde costumam ir dados bancários e uma chave Pix. Uma resposta vazia aqui não é um erro: significa que esta organização não emite NFS-e, o que exige um certificado digital válido e um perfil aprovado pela prefeitura.",
	},
	"serviceInvoice.issueNotice": {
		displayName: "Emitir envia um RPS para a prefeitura, e não há como desfazer: a nota só pode ser cancelada depois, o que mantém o registro no lugar e mantém seu PDF e XML respondendo. O valor e o tomador não são pedidos aqui porque ambos vêm da conta a receber. Se a prefeitura recusar a nota, isso não é uma falha deste node — o item sai com a recusa e o próprio texto da prefeitura em lastMessage.",
	},
	"serviceInvoice.scheduleId": {
		displayName: "ID da Conta a Receber",
		description: "A conta a receber da qual a nota é emitida. Tanto o valor quanto o tomador vêm dela e não são pedidos aqui — a API quer o tomador como uma chave separada, e este node o lê a partir da conta, para que os dois nunca fiquem em desacordo. A conta é lida antes de qualquer coisa ser enviada, então um ID errado para aqui, e não na prefeitura. Uma conta foi medida carregando três notas, então esta API não tem uma regra de uma nota por conta, e o node não põe nenhuma guarda própria aí.",
		placeholder: "a01f0058-d321-4805-bd73-810e88b98557",
	},
	"serviceInvoice.serviceProfileId": {
		displayName: "Perfil de Serviço Name or ID",
		description: "Sob qual perfil a nota é declarada. Ele decide o serviço, o imposto e as observações impressas na nota, e a API recusa uma emissão sem um. ⚠️ Um perfil errado não é algo que se conserta depois: desfazê-lo é um cancelamento na prefeitura. A lista mostra o código de serviço e a alíquota do ISS ao lado de cada nome, que é o que diferencia dois perfis parecidos. Escolha na lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"serviceInvoice.accrualDate": {
		displayName: "Data de Competência",
		description: "A competência do RPS — o mês em que o serviço é declarado. Pedida em vez de adivinhada: nas contas a receber desta API, uma data de competência omitida é copiada da data de vencimento, o que joga a competência para o mês errado.",
	},
	"serviceInvoice.cityWhereServiceWasProvided": {
		displayName: "Cidade Onde o Serviço Foi Prestado",
		description: "Onde o serviço foi prestado. Obrigatório para toda nota que esta organização emite.",
		placeholder: "Rio de Janeiro",
	},
	"serviceInvoice.additionalServiceDescription": {
		displayName: "Descrição do Serviço",
		description: "O texto que preenche o modelo de descrição do perfil — o {{Descricao}} que ele carrega. Obrigatório para toda nota que esta organização emite.",
	},
	"serviceInvoice.stateWhereServiceWasProvided": {
		displayName: "Estado Onde o Serviço Foi Prestado",
		description: "O estado da cidade acima, como a sigla de duas letras. Obrigatório para toda nota que esta organização emite.",
		placeholder: "RJ",
	},
	"serviceInvoice.cancelNotice": {
		displayName: "Cancelar é feito na prefeitura e não remove nada: a nota permanece no histórico da empresa para sempre, marcada como Cancelada — é um documento fiscal. Seu PDF e XML continuam respondendo depois, e são públicos, então quem recebeu um link antes ainda baixa a nota depois de cancelada, sem nada no documento dizendo isso.",
	},
	"serviceInvoice.serviceInvoiceId": {
		displayName: "ID da Nota Fiscal de Serviço",
		description: "A nota, como Buscar Várias a retorna. Não há rota de busca por ID nesta API — o registro é obtido através da lista filtrada por este ID.",
		placeholder: "be35e904-0669-40d3-bad1-cc7277d56781",
	},
	"serviceInvoice.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"serviceInvoice.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"serviceInvoice.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar condição",
	},
	"serviceInvoice.filters.conditions": {
		displayName: "Condição",
	},
	"serviceInvoice.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"serviceInvoice.filterCombine.and": {
		name: "E",
		description: "Retorna somente os registros que atendem a todas as condições",
	},
	"serviceInvoice.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
