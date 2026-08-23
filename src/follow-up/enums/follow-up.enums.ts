/**
 * Valores espelham exatamente os CHECK constraints da tabela
 * `installment_followups` no banco (regido pelo trigo-connector).
 */

/** Coluna `status` — CHECK `installment_followups_status_check`. */
export enum FollowUpStatus {
  CONTACTED = 'contacted',
  NO_ANSWER = 'no_answer',
  PROMISE_TO_PAY = 'promise_to_pay',
  DISPUTE = 'dispute',
  OTHER = 'other',
  CLIENT_CALL = 'client_call',
  GUARANTOR_CALL = 'guarantor_call',
  CLIENT_VISIT = 'client_visit',
  GUARANTOR_VISIT = 'guarantor_visit',
  CLIENT_COLLECTION_LETTER = 'client_collection_letter',
  GUARANTOR_COLLECTION_LETTER = 'guarantor_collection_letter',
  NEGATIVATION = 'negativation',
  RENEGOTIATION = 'renegotiation',
  DECEASED = 'deceased',
  NO_FORECAST = 'no_forecast',
  WHATSAPP_MESSAGE = 'whatsapp_message',
}

/** Coluna `followup_type` — modelo estruturado de follow-up. */
export enum FollowUpType {
  CALL = 'call',
  MESSAGE = 'message',
  VISIT = 'visit',
  AUTOMATIC = 'automatic',
}

/** Coluna `party` — parte envolvida no follow-up. */
export enum FollowUpParty {
  CLIENT = 'client',
  GUARANTOR = 'guarantor',
}

/** Coluna `automatic_action` — obrigatória em follow-ups automáticos. */
export enum AutomaticFollowUpAction {
  COLLECTION_LETTER = 'collection_letter',
  NEGATIVATION = 'negativation',
  RENEGOTIATION = 'renegotiation',
}

/** Coluna `expected_result` — CHECK `installment_followups_expected_result_check`. */
export enum FollowUpExpectedResult {
  WILL_PAY_ON_DATE = 'will_pay_on_date', // Pagará no dia
  NO_RETURN = 'no_return', // Sem retorno
  REQUESTED_EXTENSION = 'requested_extension', // Pediu prazo extra
  DISPUTE = 'dispute', // Disputa / contestação
  WANTS_RENEGOTIATION = 'wants_renegotiation', // Quer renegociar
  DECEASED = 'deceased', // Falecido
  OTHER = 'other', // Outro
}
