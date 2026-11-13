/** Motivo da recusa de um rascunho da Canal Digital pelo parceiro. */
export enum QuoteDeclineReason {
  // Contato e cadastro
  NO_RESPONSE = 'no_response',
  INVALID_CONTACT = 'invalid_contact',
  DOES_NOT_RECOGNIZE_REQUEST = 'does_not_recognize_request',
  DUPLICATE_REGISTRATION = 'duplicate_registration',
  // Perfil do cliente
  OUTSIDE_SERVICE_AREA = 'outside_service_area',
  PERSONAL_PURPOSE_CREDIT = 'personal_purpose_credit',
  PRODUCT_CRITERIA_NOT_MET = 'product_criteria_not_met',
  // Documentação e exigências
  DOCUMENTS_NOT_SENT = 'documents_not_sent',
  INCOME_NOT_PROVEN = 'income_not_proven',
  NO_GUARANTOR = 'no_guarantor',
  DECLINED_SITE_VISIT = 'declined_site_visit',
  // Condições da oferta
  INTEREST_RATE_NOT_ACCEPTED = 'interest_rate_not_accepted',
  APPROVED_AMOUNT_INSUFFICIENT = 'approved_amount_insufficient',
  INSTALLMENT_OVER_BUDGET = 'installment_over_budget',
  PAYMENT_TERM_UNSUITABLE = 'payment_term_unsuitable',
  RELEASE_TIME_UNSUITABLE = 'release_time_unsuitable',
  // Decisão do cliente
  HIRED_ANOTHER_INSTITUTION = 'hired_another_institution',
  NO_LONGER_NEEDS_CREDIT = 'no_longer_needs_credit',
  POSTPONED = 'postponed',
  INSECURITY_ABOUT_COMPANY = 'insecurity_about_company',
  GAVE_UP_NO_REASON = 'gave_up_no_reason',
  // Decisão da análise
  CREDIT_NOT_APPROVED = 'credit_not_approved',
  // Outro
  OTHER = 'other',
}

/** Tamanho mínimo da observação nos motivos que a exigem. */
export const DECLINE_NOTE_MIN_LENGTH = 3;

/**
 * Motivos que só fazem sentido com um complemento: "outro" precisa de uma
 * breve descrição e "não atende aos critérios do produto" precisa dizer qual
 * critério.
 */
export const DECLINE_REASONS_REQUIRING_NOTE: readonly QuoteDeclineReason[] = [
  QuoteDeclineReason.PRODUCT_CRITERIA_NOT_MET,
  QuoteDeclineReason.OTHER,
];
