import type { Translations } from '../localize';

/** Escopo `collection` — 24 entradas. */
export const collection: Translations = {
	"collection.operation": {
		displayName: "Operação",
	},
	"collection.operation.cancel": {
		name: "Cancelar",
		description: "Cancela uma cobrança, o que deixa o registro no lugar com o status definido como Cancelled",
		action: "Cancelar uma cobrança",
	},
	"collection.operation.create": {
		name: "Criar",
		description: "Emite uma cobrança a partir de uma conta a receber, escolhendo se o Nibo a envia ao pagador ou a retém para revisão",
		action: "Criar uma cobrança",
	},
	"collection.operation.get": {
		name: "Buscar",
		description: "Recupera uma cobrança pelo ID, lida através da listagem — esta API não tem rota de busca por ID para uma cobrança",
		action: "Buscar uma cobrança",
	},
	"collection.operation.list": {
		name: "Buscar Várias",
		description: "Recupera as cobranças da organização",
		action: "Buscar várias cobranças",
	},
	"collection.operation.listProfiles": {
		name: "Buscar Vários Perfis",
		description: "Recupera os perfis de cobrança, que é por onde uma cobrança é emitida e a única forma de saber se esta organização pode emitir uma",
		action: "Buscar vários perfis de cobrança",
	},
	"collection.createNotice": {
		displayName: "Os dois tipos de envio mandam a cobrança — a escolha é por qual caminho ela sai, não se sai. Por E-Mail sai pelo lado financeiro do Nibo; Pelo Contador entrega a cobrança ao módulo do contador, onde ela chega ao pagador no portal do cliente junto com o restante do tráfego daquele módulo. Nada nesta tela retém uma cobrança, e o node não consegue acompanhá-la dentro do módulo do contador para contar o que aconteceu lá.",
	},
	"collection.scheduleId": {
		displayName: "ID da Conta a Receber",
		description: "A conta a receber para a qual cobrar. O valor e a descrição da cobrança vêm dela — não são perguntados aqui. Uma conta carrega no máximo uma cobrança: o node verifica antes de emitir e nomeia a que já existe.",
		placeholder: "04a6a2a9-ef71-4733-9ac7-33737ac4d40c",
	},
	"collection.dueDate": {
		displayName: "Data de Vencimento",
		description: "O dia em que a cobrança vence, geralmente o mesmo da conta da qual ela vem",
	},
	"collection.collectionProfileId": {
		displayName: "Perfil de Cobrança Name or ID",
		description: "Qual perfil emite a cobrança — é o que liga o provedor bancário a ela, e a API recusa uma criação sem um. Uma organização sem perfil não consegue emitir cobranças de forma alguma. Escolha na lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"collection.deliveryType": {
		displayName: "Tipo de Envio",
		description: "Por qual caminho a cobrança sai: por e-mail a partir do módulo financeiro do Nibo, ou pelo módulo do contador e o portal do cliente. Os dois entregam. É somente de escrita — o valor nunca volta — mas o efeito dele fica: leia accountantIntegrationStatus para ver qual caminho uma cobrança tomou. ⚠️ Pelo Contador só faz sentido para uma organização cuja Nibo está integrada ao módulo do contador; sem isso, o roteamento não tem onde pousar, e uma cobrança da amostra fica em \"Não foi possível criar o item de conferência no Nibo Obrigações\".",
	},
	"collection.deliveryType.0": {
		name: "Por E-Mail",
		description: "A Nibo envia o boleto ao pagador pelo lado da gestão financeira. Medido: accountantIntegrationStatus permanece \"Não definida\".",
	},
	"collection.deliveryType.default": {
		name: "Deixar para o Nibo",
		description: "O campo não é enviado de forma alguma, então o Nibo roteia como faz por padrão",
	},
	"collection.deliveryType.1": {
		name: "Pelo Contador",
		description: "A cobrança é entregue ao módulo do contador do Nibo e chega ao pagador no portal do cliente por lá. Medido: accountantIntegrationStatus passa a \"Habilitada\" — o que registra o pedido, não o resultado.",
	},
	"collection.listNotice": {
		displayName: "A url de cada um desses registros é pública: quem a tiver abre a página de pagamento sem token. Trate-a como a própria cobrança, não como uma referência a ela.",
	},
	"collection.cancelNotice": {
		displayName: "Cancelar não remove a cobrança: o registro fica onde está com o status definido como Cancelled, e o link público continua respondendo depois. Há uma segunda forma de isso acontecer que ninguém espera — excluir a conta cancela a cobrança pendurada nela. E uma cobrança só pode ser cancelada uma vez: pedir duas vezes é recusado pela API.",
	},
	"collection.collectionId": {
		displayName: "ID da Cobrança",
		description: "A cobrança, como Buscar Várias a retorna. Não há rota de busca por ID nesta API — o registro é obtido através da listagem filtrada por este ID.",
		placeholder: "c1a5e0d4-77b0-4f1a-9b3e-2a6a1d0f9c11",
	},
	"collection.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"collection.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"collection.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"collection.filters.conditions": {
		displayName: "Condição",
	},
	"collection.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"collection.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"collection.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
