import type { Translations } from '../localize';

/** Escopo `category` — 24 entradas. */
export const category: Translations = {
	"category.operation": {
		displayName: "Operação",
	},
	"category.operation.create": {
		name: "Criar",
		description: "Adiciona uma linha ao plano de contas, sob um grupo e opcionalmente um subgrupo. Isto não pode ser desfeito: a API não oferece nenhuma forma de editar ou excluir uma categoria.",
		action: "Criar uma categoria",
	},
	"category.operation.get": {
		name: "Buscar",
		description: "Busca uma categoria financeira por ID",
		action: "Buscar uma categoria",
	},
	"category.operation.list": {
		name: "Buscar Várias",
		description: "Busca as categorias financeiras da organização",
		action: "Buscar várias categorias",
	},
	"category.operation.groups": {
		name: "Buscar Vários Grupos",
		description: "Busca os grupos em que o plano de contas está dividido",
		action: "Buscar vários grupos de categoria",
	},
	"category.operation.tree": {
		name: "Buscar Árvore",
		description: "Busca a hierarquia inteira — grupos, subgrupos e as categorias dentro deles",
		action: "Buscar a árvore de categorias",
	},
	"category.createNotice": {
		displayName: "Criar uma categoria não pode ser desfeito — esta API não tem nenhuma forma de editar ou excluir uma. Uma categoria criada por engano só pode ser corrigida na tela do Nibo.",
	},
	"category.categoryGroupId": {
		displayName: "Grupo de Categoria Name or ID",
		description: "O grupo do plano de contas ao qual esta categoria pertence — o nível que o Nibo mostra acima do nome da categoria. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"category.name": {
		displayName: "Nome",
		description: "O nome da categoria, como vai aparecer no Nibo",
	},
	"category.type": {
		displayName: "Tipo",
		description: "Para qual lado do dinheiro esta categoria serve. É o que assina uma linha de conta, portanto também é o que decide qual tipo de conta pode ser lançado nesta categoria — se é que pode.",
	},
	"category.type.out": {
		name: "Despesa",
		description: "Uma categoria sob a qual um pagamento é lançado",
	},
	"category.type.in": {
		name: "Receita",
		description: "Uma categoria sob a qual um recebimento é lançado",
	},
	"category.additionalFields": {
		displayName: "Campos Adicionais",
		placeholder: "Adicionar Campo",
	},
	"category.additionalFields.subGroupId": {
		displayName: "Subgrupo Name or ID",
		description: "Um subgrupo dentro do grupo acima, quando o grupo tiver algum. Subgrupos não existem em Buscar Várias — só em Buscar Árvore — então esta lista é lida a partir da árvore. Escolha da lista, ou especifique um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"category.categoryId": {
		displayName: "ID da Categoria",
		description: "O ID da categoria a ser lida, como o Nibo o retorna. É lido através da lista filtrada por ID, e não através da rota que lê um registro por ID, para que Buscar e Buscar Várias respondam exatamente o mesmo registro — aquela rota descarta o subgrupo, e um node que respondesse um formato aqui e outro ali estaria inventando uma diferença que a API não tem.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"category.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"category.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "Um plano de contas costuma ter poucas dezenas de linhas, então uma página normalmente já é tudo",
	},
	"category.includeDeleted": {
		displayName: "Incluir Categorias Excluídas",
		description: "Se deve incluir as categorias que foram excluídas no Nibo. Elas carregam isDeleted como true, o que permite diferenciá-las das demais.",
	},
	"category.nfseValueOnly": {
		displayName: "Apenas Categorias de NFS-e",
		description: "Se deve restringir a árvore às categorias que podem compor o valor de uma NFS-e. Medido em 2026-07-26: isso remove juros, multas e \"Outras receitas\" da resposta, e revela um subgrupo que a chamada sem essa opção não mostra.",
	},
	"category.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"category.filters.conditions": {
		displayName: "Condição",
	},
	"category.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"category.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"category.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
