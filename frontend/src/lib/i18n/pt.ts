export const pt = {
	// Nav
	'nav.events': 'Eventos',
	'nav.myOrders': 'Meus pedidos',
	'nav.newEvent': '+ Novo evento',
	'nav.invitations': 'Convites',
	'nav.logout': 'Sair',
	'nav.login': 'Entrar',

	// Common
	'common.loading': 'Carregando...',
	'common.saving': 'Salvando...',
	'common.delete': 'Excluir',
	'common.edit': 'Editar',
	'common.email': 'E-mail',
	'common.status': 'Status',
	'common.total': 'Total',
	'common.name': 'Nome',
	'common.cancel': 'Cancelar',
	'common.confirm': 'Confirmar',

	// Auth
	'auth.login.title': 'Entrar',
	'auth.login.subtitle': 'Enviaremos um código de 6 dígitos para o seu e-mail.',
	'auth.login.sendCode': 'Enviar código',
	'auth.login.sending': 'Enviando...',
	'auth.login.errorFallback': 'Falha ao enviar código',
	'auth.verify.title': 'Digite o seu código',
	'auth.verify.sentTo': 'Enviado para',
	'auth.verify.label': 'Código de 6 dígitos',
	'auth.verify.verify': 'Verificar',
	'auth.verify.verifying': 'Verificando...',
	'auth.verify.changeEmail': 'Alterar e-mail',
	'auth.verify.errorFallback': 'Falha na verificação',

	// Home
	'home.title': 'Próximos eventos',
	'home.subtitle': 'Encontre ingressos e complementos para eventos perto de você.',
	'home.searchPlaceholder': 'Buscar eventos...',
	'home.noResults': 'Nenhum evento encontrado.',
	'home.errorFallback': 'Falha ao carregar eventos',
	'home.guestTitle': 'Entre para ver os eventos',
	'home.guestSubtitle': 'O Tickets é uma plataforma sem senha — entre com o seu e-mail.',
	'home.guestCta': 'Entrar',

	// Event detail
	'event.tickets': 'Ingressos',
	'event.addons': 'Complementos',
	'event.noTickets': 'Nenhum ingresso disponível.',
	'event.left': 'restantes',
	'event.orderSummary': 'Resumo do pedido',
	'event.noItems': 'Nenhum item selecionado.',
	'event.buy': 'Comprar',
	'event.buying': 'Criando pedido...',
	'event.errorFallback': 'Falha ao carregar evento',
	'event.notFound': 'Evento não encontrado',

	// Event form
	'eventForm.title': 'Título',
	'eventForm.description': 'Descrição',
	'eventForm.location': 'Local',
	'eventForm.startsAt': 'Início',
	'eventForm.coverUrl': 'URL da imagem de capa',
	'eventForm.status': 'Status',
	'eventForm.draft': 'Rascunho',
	'eventForm.published': 'Publicado',
	'eventForm.saveFailed': 'Falha ao salvar',

	// Event new
	'eventNew.title': 'Novo evento',
	'eventNew.subtitle': 'Crie o evento e depois adicione tipos de ingresso e complementos.',
	'eventNew.cta': 'Criar evento',

	// Event edit
	'eventEdit.title': 'Editar evento',
	'eventEdit.saveEvent': 'Salvar evento',
	'eventEdit.ticketTypes': 'Tipos de ingresso',
	'eventEdit.addons': 'Complementos',
	'eventEdit.deleteEvent': 'Excluir evento',
	'eventEdit.confirmDeleteEvent': 'Excluir o evento "{title}"?',
	'eventEdit.confirmDeleteTicket': 'Excluir "{name}"?',
	'eventEdit.confirmDeleteExtra': 'Excluir "{name}"?',
	'eventEdit.add': 'Adicionar',
	'eventEdit.priceCents': 'Preço (centavos)',
	'eventEdit.qty': 'Qtde',
	'eventEdit.qtyUnlimited': 'Qtde (0 = ilimitado)',
	'eventEdit.sold': 'vendidos',
	'eventEdit.errorFallback': 'Falha ao carregar',
	'eventEdit.notFound': 'Não encontrado',
	'eventEdit.deleteEventError': 'Falha ao excluir evento',
	'eventEdit.deleteTicketError': 'Falha ao excluir tipo de ingresso',
	'eventEdit.deleteExtraError': 'Falha ao excluir complemento',

	// Orders
	'orders.title': 'Meus pedidos',
	'orders.empty': 'Nenhum pedido ainda.',
	'orders.browseEvents': 'Ver eventos',
	'orders.errorFallback': 'Falha ao carregar pedidos',

	// Order detail
	'order.title': 'Pedido',
	'order.items': 'Itens',
	'order.awaitingPayment': 'Seu pedido aguarda pagamento.',
	'order.continueToPay': 'Concluir pagamento',
	'order.paidAt': 'Pago em',
	'order.paymentConfirmed': '✅ Pagamento confirmado. Seus ingressos estão reservados.',
	'order.errorFallback': 'Falha ao carregar pedido',
	'order.notFound': 'Pedido não encontrado',

	// Invitations
	'invitations.title': 'Convites',
	'invitations.subtitle': 'Convide alguém para se tornar criador no Tickets.',
	'invitations.send': 'Enviar convite',
	'invitations.sending': 'Enviando...',
	'invitations.empty': 'Nenhum convite enviado ainda.',
	'invitations.errorFallback': 'Falha ao carregar',
	'invitations.sendErrorFallback': 'Falha ao enviar',

	// Profile
	'profile.title': 'Perfil',
	'profile.email': 'E-mail',
	'profile.role': 'Função',
	'profile.logout': 'Sair',

	// Status badges
	'status.draft': 'Rascunho',
	'status.published': 'Publicado',
	'status.cancelled': 'Cancelado',
	'status.pending': 'Pendente',
	'status.paid': 'Pago',
	'status.expired': 'Expirado',
	'status.refunded': 'Reembolsado',
	'status.accepted': 'Aceito',
} as const;

export type TranslationKey = keyof typeof pt;
