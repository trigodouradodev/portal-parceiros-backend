/** Canais da régua de cobrança (espelha o CHECK de activity_tasks.channel). */
export enum ActivityChannel {
  WHATSAPP_MESSAGE = 'whatsapp_message',
  CLIENT_CALL = 'client_call',
  CLIENT_VISIT = 'client_visit',
}

/** Resultados de uma interação (espelha o CHECK de activity_interactions.result). */
export enum ActivityInteractionResult {
  WILL_PAY_ON_DATE = 'will_pay_on_date',
  REQUESTED_EXTENSION = 'requested_extension',
  WANTS_RENEGOTIATION = 'wants_renegotiation',
  PAYMENT_PROMISE = 'payment_promise',
  NO_RETURN = 'no_return',
}

/** Status de uma tarefa (espelha o CHECK de activity_tasks.status). */
export enum ActivityTaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
