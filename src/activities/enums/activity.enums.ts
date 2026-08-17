/** Tipo da tarefa (espelha o CHECK de activity_tasks.task_type). */
export enum ActivityTaskType {
  CONTACT = 'contact',
  VISIT = 'visit',
}

/** Canal REAL da interação, escolhido na execução (CHECK de activity_interactions.channel). */
export enum ActivityChannel {
  WHATSAPP = 'whatsapp',
  CALL = 'call',
  VISIT = 'visit',
}

/** Status da tarefa (CHECK de activity_tasks.status). */
export enum ActivityTaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  SYSTEM_CLOSED = 'system_closed', // fechada pelo sistema (não executada na janela)
  CANCELLED = 'cancelled',
}

/** Destinatário do contato (CHECK de activity_interactions.recipient_type). */
export enum ActivityRecipientType {
  CLIENT = 'client',
  GUARANTOR = 'guarantor',
  OTHER = 'other',
}

/** Resultados de uma interação (CHECK de activity_interactions.result, por task_type). */
export enum ActivityInteractionResult {
  NO_RESPONSE = 'no_response', // só contato
  NOT_LOCATED = 'not_located', // só visita
  PAYMENT_PROMISE = 'payment_promise',
  DISPUTE = 'dispute',
  RENEGOTIATION = 'renegotiation',
  DECEASED = 'deceased',
  NO_FORECAST = 'no_forecast',
  OTHER = 'other',
}

/** Canais válidos por tipo de tarefa. */
export const CHANNELS_BY_TASK_TYPE: Record<
  ActivityTaskType,
  ActivityChannel[]
> = {
  [ActivityTaskType.CONTACT]: [ActivityChannel.WHATSAPP, ActivityChannel.CALL],
  [ActivityTaskType.VISIT]: [ActivityChannel.VISIT],
};

/** Resultados válidos por tipo de tarefa (contato usa no_response; visita usa not_located). */
export const RESULTS_BY_TASK_TYPE: Record<
  ActivityTaskType,
  ActivityInteractionResult[]
> = {
  [ActivityTaskType.CONTACT]: [
    ActivityInteractionResult.NO_RESPONSE,
    ActivityInteractionResult.PAYMENT_PROMISE,
    ActivityInteractionResult.DISPUTE,
    ActivityInteractionResult.RENEGOTIATION,
    ActivityInteractionResult.DECEASED,
    ActivityInteractionResult.NO_FORECAST,
    ActivityInteractionResult.OTHER,
  ],
  [ActivityTaskType.VISIT]: [
    ActivityInteractionResult.NOT_LOCATED,
    ActivityInteractionResult.PAYMENT_PROMISE,
    ActivityInteractionResult.DISPUTE,
    ActivityInteractionResult.RENEGOTIATION,
    ActivityInteractionResult.DECEASED,
    ActivityInteractionResult.NO_FORECAST,
    ActivityInteractionResult.OTHER,
  ],
};

/** Janela de reagendamento de visita (dias a partir de hoje). */
export const RESCHEDULE_MIN_DAYS = 1;
export const RESCHEDULE_MAX_DAYS = 5;

/** Promessa de pagamento: data máxima (dias a partir de hoje). */
export const PROMISE_MAX_DAYS = 10;
