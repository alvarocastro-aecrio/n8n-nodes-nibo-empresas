import type { Translations } from '../localize';

/** Escopo `costCenter` — 20 entradas. */
export const costCenter: Translations = {
	"costCenter.operation": {
		displayName: "Operação",
	},
	"costCenter.operation.create": {
		name: "Criar",
		description: "Adiciona um centro de custo à organização",
		action: "Criar um centro de custo",
	},
	"costCenter.operation.delete": {
		name: "Excluir",
		description: "Remove um centro de custo da organização",
		action: "Excluir um centro de custo",
	},
	"costCenter.operation.get": {
		name: "Buscar",
		description: "Busca um centro de custo por ID",
		action: "Buscar um centro de custo",
	},
	"costCenter.operation.list": {
		name: "Buscar Vários",
		description: "Busca os centros de custo da organização",
		action: "Buscar vários centros de custo",
	},
	"costCenter.operation.update": {
		name: "Atualizar",
		description: "Altera os campos informados abaixo, deixando todo o resto do centro de custo como está",
		action: "Atualizar um centro de custo",
	},
	"costCenter.costCenterId": {
		displayName: "ID do Centro de Custo",
		description: "O ID do centro de custo a trabalhar, como o Nibo o retorna no campo costCenterId. É assim que esta coleção chama sua chave: o nome mais curto que toda outra coleção usa não é sequer um campo aqui, e ordenar por ele responde HTTP 500.",
		placeholder: "2efffcd0-8730-4348-86da-6d9a95be6149",
	},
	"costCenter.description": {
		displayName: "Descrição",
		description: "Como este centro de custo se chama, como vai aparecer no Nibo",
	},
	"costCenter.additionalFields": {
		displayName: "Campos Adicionais",
		placeholder: "Adicionar Campo",
	},
	"costCenter.additionalFields.externalCode": {
		displayName: "Código Externo",
		description: "Um código seu, como o que este centro de custo carrega em outro sistema. O Nibo o armazena exatamente como digitado e o oferece como filtro.",
	},
	"costCenter.updateFields": {
		displayName: "Campos a Atualizar",
		description: "Os campos a alterar. Um campo deixado de fora não é tocado: o centro de custo mantém o que já está armazenado no Nibo. Um campo adicionado e deixado vazio é gravado vazio, que é como se apaga um valor de propósito.",
		placeholder: "Adicionar Campo",
	},
	"costCenter.updateFields.description": {
		displayName: "Descrição",
		description: "Como este centro de custo se chama, como vai aparecer no Nibo",
	},
	"costCenter.updateFields.externalCode": {
		displayName: "Código Externo",
		description: "Um código seu, como o que este centro de custo carrega em outro sistema. O Nibo o armazena exatamente como digitado e o oferece como filtro.",
	},
	"costCenter.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"costCenter.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"costCenter.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"costCenter.filters.conditions": {
		displayName: "Condição",
	},
	"costCenter.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"costCenter.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"costCenter.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
