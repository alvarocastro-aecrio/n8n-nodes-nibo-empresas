import type { Translations } from '../localize';

/** Escopo `creditSchedule` — 97 entradas. */
export const creditSchedule: Translations = {
	"creditSchedule.operation": {
		displayName: "Operação",
	},
	"creditSchedule.operation.create": {
		name: "Criar",
		description: "Agenda um valor a ser recebido em uma data",
		action: "Criar uma conta a receber",
	},
	"creditSchedule.operation.delete": {
		name: "Excluir",
		description: "Remove uma conta a receber da organização",
		action: "Excluir uma conta a receber",
	},
	"creditSchedule.operation.get": {
		name: "Buscar",
		description: "Busca uma conta a receber pelo ID",
		action: "Buscar uma conta a receber",
	},
	"creditSchedule.operation.list": {
		name: "Buscar Várias",
		description: "Busca as contas a receber da organização",
		action: "Buscar várias contas a receber",
	},
	"creditSchedule.operation.update": {
		name: "Atualizar",
		description: "Altera os campos indicados abaixo, deixando todos os outros campos da conta a receber como estão",
		action: "Atualizar uma conta a receber",
	},
	"creditSchedule.creditScheduleId": {
		displayName: "ID da Conta a Receber",
		description: "O ID da conta a receber a ser tratada, como o Nibo o retorna no campo de ID da conta",
	},
	"creditSchedule.stakeholderId": {
		displayName: "Contato",
		description: "O contato a que esta conta pertence. A lista é pesquisada no servidor e oferece apenas os tipos que a API aceita aqui — um cliente ou um sócio em uma conta a receber, um fornecedor, um funcionário ou um sócio em uma conta a pagar; qualquer outro é recusado com \"Stakeholder is not compatible\".",
	},
	"creditSchedule.dueDate": {
		displayName: "Data de Vencimento",
		description: "A data em que o valor vence",
	},
	"creditSchedule.scheduleDate": {
		displayName: "Data Prevista",
		description: "A data em que se espera que o dinheiro se mova, que nem sempre é a data em que ele vence",
	},
	"creditSchedule.accrualDate": {
		displayName: "Data de Competência",
		description: "O mês a que isto pertence na contabilidade. Deixado vazio, a API copia o vencimento silenciosamente — o que lança a receita ou a despesa no mês em que o dinheiro se move, e não no mês em que foi ganho ou incorrido.",
	},
	"creditSchedule.description": {
		displayName: "Descrição",
		description: "Do que se trata esta conta, como vai aparecer no Nibo",
	},
	"creditSchedule.isFlagged": {
		displayName: "Sinalizada",
		description: "Se levanta a sinalização que o Nibo mostra ao lado de uma conta que precisa de atenção",
	},
	"creditSchedule.categories": {
		displayName: "Categorias",
		description: "As linhas em que esta conta é dividida. O valor da conta é a soma delas — esta API não guarda total próprio. Dividir entre várias categorias tem que estar habilitado para a organização no Nibo: onde está desligado, a API recusa uma segunda linha com \"Utilize apenas uma categoria\", e o node diz o que isso significa.",
		placeholder: "Adicionar Categoria",
	},
	"creditSchedule.categories.category": {
		displayName: "Categoria",
	},
	"creditSchedule.costCenters": {
		displayName: "Centros de Custo",
		description: "As partes da empresa a que este valor é atribuído. Deixe vazio e a conta não carrega rateio nenhum, o que toda conta escrita antes deste campo existir faz.",
		placeholder: "Adicionar Centro de Custo",
	},
	"creditSchedule.costCenters.costCenter": {
		displayName: "Centro de Custo",
	},
	"creditSchedule.apportionBy": {
		displayName: "Ratear Por",
		description: "Como a parte de cada linha de centro de custo acima é lida. É enviado só quando há ao menos uma linha, então uma conta sem rateio é escrita exatamente como era antes deste campo existir.",
	},
	"creditSchedule.apportionBy.percent": {
		name: "Porcentagem",
		description: "Cada linha carrega uma parte do todo, e as partes têm que somar 100",
	},
	"creditSchedule.apportionBy.value": {
		name: "Valor",
		description: "Cada linha carrega um valor, e os valores têm que somar o valor da conta",
	},
	"creditSchedule.generateBoleto": {
		displayName: "Gerar Boleto",
		description: "Se esta conta a receber já nasce com uma cobrança — um boleto, com o QR do Pix impresso nele. Uma conta carrega no máximo uma cobrança, e cancelá-la depois se faz com o recurso Cobrança. ⚠️ O link público dela é a cobrança em si: quem o tiver abre a página de pagamento sem token nenhum.",
	},
	"creditSchedule.generateBoleto.before": {
		name: "Um Número de Dias Antes do Vencimento",
		description: "O Nibo emite a cobrança esses dias antes do vencimento",
	},
	"creditSchedule.generateBoleto.no": {
		name: "Não Gerar",
		description: "Nenhuma cobrança — o que toda conta escrita antes deste campo existir faz",
	},
	"creditSchedule.generateBoleto.now": {
		name: "Imediatamente",
		description: "A cobrança é emitida no momento em que a conta é criada. Há um boleto no fim disso.",
	},
	"creditSchedule.boletoDaysBefore": {
		displayName: "Dias Antes do Vencimento",
		description: "Quantos dias antes do vencimento o Nibo emite a cobrança",
	},
	"creditSchedule.boletoCollectionProfileId": {
		displayName: "Perfil de Cobrança Name or ID",
		description: "Qual perfil emite a cobrança — é ele que a liga ao provedor bancário, e a API recusa sem um. Uma organização sem perfil não consegue emitir cobrança nenhuma. Escolha na lista, ou informe um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"creditSchedule.boletoDeliveryType": {
		displayName: "Entrega",
		description: "Por qual via a cobrança sai. As duas entregam — a escolha é a rota, não o se. Pelo Contador só faz sentido para uma organização cujo Nibo está integrado a esse módulo.",
	},
	"creditSchedule.boletoDeliveryType.0": {
		name: "Por E-Mail",
		description: "O Nibo a envia pelo lado financeiro",
	},
	"creditSchedule.boletoDeliveryType.default": {
		name: "Deixar para o Nibo",
		description: "A chave não é enviada",
	},
	"creditSchedule.boletoDeliveryType.1": {
		name: "Pelo Contador",
		description: "A cobrança é entregue ao módulo de contador do Nibo e chega ao pagador pelo portal do cliente de lá",
	},
	"creditSchedule.issueInvoice": {
		displayName: "Emitir Nota Fiscal",
		description: "Se esta conta a receber já nasce com uma nota fiscal de serviço — uma NFS-e — programada. ⚠️ A emissão chega à prefeitura e não tem volta: uma nota só pode ser cancelada depois, o que a deixa para sempre no histórico fiscal da empresa e mantém seu PDF e XML públicos respondendo. O valor e o tomador vêm desta conta.",
	},
	"creditSchedule.issueInvoice.before": {
		name: "Um Número de Dias Antes do Vencimento",
	},
	"creditSchedule.issueInvoice.no": {
		name: "Não Emitir",
		description: "Nenhuma nota, o que toda conta escrita antes deste campo existir faz",
	},
	"creditSchedule.issueInvoice.now": {
		name: "Imediatamente",
		description: "A nota é emitida no momento em que a conta é criada. Isso chega à prefeitura, e não tem volta.",
	},
	"creditSchedule.issueInvoice.boleto": {
		name: "Quando o Boleto For Gerado",
		description: "Espera por uma cobrança nesta conta — uma pedida acima, ou uma feita à mão no Nibo depois",
	},
	"creditSchedule.issueInvoice.settled": {
		name: "Quando o Recebimento For Liquidado",
		description: "Espera o dinheiro ser marcado como recebido",
	},
	"creditSchedule.invoiceDaysBefore": {
		displayName: "Dias Antes do Vencimento",
		description: "Quantos dias antes do vencimento o Nibo emite a nota",
	},
	"creditSchedule.invoiceServiceProfileId": {
		displayName: "Perfil de Serviço Name or ID",
		description: "Sob qual perfil a nota é declarada. É ele que decide o serviço, o imposto e as observações impressas nela. ⚠️ Um perfil errado não se corrige depois: desfazer é um cancelamento na prefeitura. Escolha na lista, ou informe um ID usando uma <a href=\"https://docs.n8n.io/code/expressions/\">expressão</a>.",
	},
	"creditSchedule.invoiceAdditionalRemarks": {
		displayName: "Observações Adicionais",
		description: "Informação complementar impressa na nota. Obrigatório para toda nota que esta conta emitir.",
	},
	"creditSchedule.invoiceCityWhereServiceWasProvided": {
		displayName: "Cidade Onde o Serviço Foi Prestado",
		description: "Onde o serviço foi prestado. Obrigatório para toda nota que esta conta emitir.",
		placeholder: "Rio de Janeiro",
	},
	"creditSchedule.invoiceServiceDescription": {
		displayName: "Descrição do Serviço",
		description: "O texto que preenche o modelo {{Descricao}} que o perfil carrega. Obrigatório para toda nota que esta conta emitir.",
	},
	"creditSchedule.invoiceStateWhereServiceWasProvided": {
		displayName: "Estado Onde o Serviço Foi Prestado",
		description: "O estado da cidade acima, na sigla de duas letras. Obrigatório para toda nota que esta conta emitir.",
		placeholder: "RJ",
	},
	"creditSchedule.repeat": {
		displayName: "Repetição",
		description: "Como esta conta se repete. É uma pergunta com três respostas porque a API recusa recorrência e parcelamento na mesma requisição — e nenhum dos dois vira o outro depois.",
	},
	"creditSchedule.repeat.no": {
		name: "Não Repetir",
		description: "Uma conta só, no vencimento acima — o que toda conta escrita antes deste campo existir faz",
	},
	"creditSchedule.repeat.installments": {
		name: "Parcelamento",
		description: "Um valor dividido em parcelas, cada uma com seu próprio vencimento. O Nibo as marca como \"Parcelado — X/Y\".",
	},
	"creditSchedule.repeat.recurrence": {
		name: "Recorrência",
		description: "O mesmo valor de novo e de novo. O Nibo provisiona as ocorrências até 36 meses à frente.",
	},
	"creditSchedule.recurrenceInterval": {
		displayName: "Repetir a Cada",
		description: "Quantas unidades abaixo se passam entre uma ocorrência e a próxima",
	},
	"creditSchedule.recurrenceIntervalType": {
		displayName: "Intervalo",
		description: "A unidade em que o intervalo acima é contado",
	},
	"creditSchedule.recurrenceIntervalType.day": {
		name: "Dia",
	},
	"creditSchedule.recurrenceIntervalType.month": {
		name: "Mês",
	},
	"creditSchedule.recurrenceIntervalType.week": {
		name: "Semana",
	},
	"creditSchedule.recurrenceIntervalType.year": {
		name: "Ano",
	},
	"creditSchedule.recurrenceEnds": {
		displayName: "Termina",
		description: "Quando a repetição para. Terminá-la depois se faz no Nibo, não aqui: esta API não tem rota que leia ou altere uma recorrência depois de criada.",
	},
	"creditSchedule.recurrenceEnds.occurrences": {
		name: "Depois de um Número de Ocorrências",
	},
	"creditSchedule.recurrenceEnds.never": {
		name: "Nunca",
	},
	"creditSchedule.recurrenceEnds.date": {
		name: "Em uma Data",
	},
	"creditSchedule.recurrenceOccurrences": {
		displayName: "Ocorrências",
		description: "Quantas vezes no total, contando a primeira",
	},
	"creditSchedule.recurrenceEndDate": {
		displayName: "Data Final",
		description: "O último dia em que a repetição pode cair",
	},
	"creditSchedule.installmentsAre": {
		displayName: "As Parcelas São",
		description: "Como as parcelas são informadas ao node. A API sempre as quer uma a uma; isto é só quem as escreve.",
	},
	"creditSchedule.installmentsAre.generated": {
		name: "Geradas",
		description: "Diga quantas e a que distância, e o node escreve as parcelas — a primeira caindo na Data de Vencimento acima",
	},
	"creditSchedule.installmentsAre.listed": {
		name: "Listadas Uma a Uma",
		description: "Digite cada parcela, para um plano que não é regular — uma primeira parcela maior, um vencimento quebrado",
	},
	"creditSchedule.installmentCount": {
		displayName: "Número de Parcelas",
		description: "Quantas parcelas, contando a primeira. O Nibo permite até 100.",
	},
	"creditSchedule.installmentInterval": {
		displayName: "Repetir a Cada",
		description: "A que distância as parcelas caem",
	},
	"creditSchedule.installmentIntervalType": {
		displayName: "Intervalo",
		description: "A unidade em que o intervalo acima é contado. Em meses o dia é mantido e limitado ao fim de um mês curto — um plano que começa no dia 31 cai no dia 28 em fevereiro e volta ao 31 em março.",
	},
	"creditSchedule.installmentIntervalType.day": {
		name: "Dia",
	},
	"creditSchedule.installmentIntervalType.month": {
		name: "Mês",
	},
	"creditSchedule.installmentIntervalType.week": {
		name: "Semana",
	},
	"creditSchedule.installmentIntervalType.year": {
		name: "Ano",
	},
	"creditSchedule.installmentAmount": {
		displayName: "Valor",
		description: "Qual é o valor de cada parcela. \"O total\" é a soma das linhas em Categorias: esta API não guarda total próprio.",
	},
	"creditSchedule.installmentAmount.repeat": {
		name: "Repetir o Valor em Cada Parcela",
		description: "Cada parcela vale a soma inteira das linhas em Categorias",
	},
	"creditSchedule.installmentAmount.split": {
		name: "Dividir o Total Entre as Parcelas",
		description: "A soma das linhas em Categorias é dividida, e os centavos restantes vão para as primeiras parcelas para o total fechar",
	},
	"creditSchedule.installments": {
		displayName: "Parcelas",
		description: "As parcelas, como a API as recebe. Até 100.",
		placeholder: "Adicionar Parcela",
	},
	"creditSchedule.installments.installment": {
		displayName: "Parcela",
	},
	"creditSchedule.additionalFields": {
		displayName: "Campos Adicionais",
		placeholder: "Adicionar Campo",
	},
	"creditSchedule.additionalFields.reference": {
		displayName: "Referência",
		description: "Uma referência livre, sua, como um número de fatura ou de contrato",
	},
	"creditSchedule.updateFields": {
		displayName: "Campos a Atualizar",
		description: "Os campos a alterar. Um campo deixado de fora não é tocado: a conta mantém o que está guardado no Nibo. Um campo de texto adicionado e deixado vazio é escrito vazio, que é como se apaga um valor de propósito — mas uma data ou uma categoria deixada vazia é ignorada, já que uma conta sem vencimento ou sem valor não é uma conta que esta API guarda.",
		placeholder: "Adicionar Campo",
	},
	"creditSchedule.updateFields.accrualDate": {
		displayName: "Data de Competência",
		description: "O mês a que isto pertence na contabilidade",
	},
	"creditSchedule.updateFields.apportionBy": {
		displayName: "Ratear Por",
		description: "Como a parte de cada linha de centro de custo acima é lida. É enviado só quando há ao menos uma linha, então uma conta sem rateio é escrita exatamente como era antes deste campo existir.",
	},
	"creditSchedule.updateFields.apportionBy.percent": {
		name: "Porcentagem",
		description: "Cada linha carrega uma parte do todo, e as partes têm que somar 100",
	},
	"creditSchedule.updateFields.apportionBy.value": {
		name: "Valor",
		description: "Cada linha carrega um valor, e os valores têm que somar o valor da conta",
	},
	"creditSchedule.updateFields.categories": {
		displayName: "Categorias",
		description: "As linhas em que esta conta é dividida. O valor da conta é a soma delas — esta API não guarda total próprio. Dividir entre várias categorias tem que estar habilitado para a organização no Nibo: onde está desligado, a API recusa uma segunda linha com \"Utilize apenas uma categoria\", e o node diz o que isso significa.",
		placeholder: "Adicionar Categoria",
	},
	"creditSchedule.updateFields.categories.category": {
		displayName: "Categoria",
	},
	"creditSchedule.updateFields.costCenters": {
		displayName: "Centros de Custo",
		description: "As partes da empresa a que este valor é atribuído. Deixe vazio e a conta não carrega rateio nenhum, o que toda conta escrita antes deste campo existir faz.",
		placeholder: "Adicionar Centro de Custo",
	},
	"creditSchedule.updateFields.costCenters.costCenter": {
		displayName: "Centro de Custo",
	},
	"creditSchedule.updateFields.description": {
		displayName: "Descrição",
		description: "Do que se trata esta conta, como vai aparecer no Nibo",
	},
	"creditSchedule.updateFields.dueDate": {
		displayName: "Data de Vencimento",
		description: "A data em que o valor vence",
	},
	"creditSchedule.updateFields.isFlagged": {
		displayName: "Sinalizada",
		description: "Se levanta a sinalização que o Nibo mostra ao lado de uma conta que precisa de atenção",
	},
	"creditSchedule.updateFields.reference": {
		displayName: "Referência",
		description: "Uma referência livre, sua, como um número de fatura ou de contrato",
	},
	"creditSchedule.updateFields.scheduleDate": {
		displayName: "Data Prevista",
		description: "A data em que se espera que o dinheiro se mova",
	},
	"creditSchedule.updateFields.stakeholderId": {
		displayName: "Contato",
		description: "O contato a que esta conta pertence. A lista é pesquisada no servidor e oferece apenas os tipos que a API aceita aqui — um cliente ou um sócio em uma conta a receber, um fornecedor, um funcionário ou um sócio em uma conta a pagar; qualquer outro é recusado com \"Stakeholder is not compatible\".",
	},
	"creditSchedule.returnAll": {
		displayName: "Retornar Tudo",
		description: "Se deve retornar todos os resultados ou apenas até um limite definido",
	},
	"creditSchedule.limit": {
		displayName: "Limite",
		description: "Número máximo de resultados a retornar",
		hint: "A API limita cada página a 500 registros, então um limite maior é reunido em várias páginas",
	},
	"creditSchedule.filters": {
		displayName: "Filtros",
		description: "As condições que um registro precisa atender para ser retornado",
		placeholder: "Adicionar Condição",
	},
	"creditSchedule.filters.conditions": {
		displayName: "Condição",
	},
	"creditSchedule.filterCombine": {
		displayName: "Combinar Condições",
		description: "Como as condições acima são combinadas. Um único operador para todas elas: uma mistura dos dois, como (A ou B) e C, é para isso que existe o Filtro (OData) em Opções.",
	},
	"creditSchedule.filterCombine.and": {
		name: "E",
		description: "Retorna apenas os registros que atendem a todas as condições",
	},
	"creditSchedule.filterCombine.or": {
		name: "Ou",
		description: "Retorna os registros que atendem a pelo menos uma das condições",
	},
};
