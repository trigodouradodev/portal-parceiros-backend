/** Dados financeiros necessários para solicitar um preview à Celcoin. */
export interface CelcoinSimulationInput {
  requestedAmount: number;
  interestRate: number;
  installments: number;
  firstPaymentDate: string;
}

/**
 * Resposta do preview da Celcoin.
 *
 * O contrato público da Celcoin possui outros campos, preservados no JSON
 * persistido para auditoria. Estes são os campos que o domínio consome.
 */
export interface CelcoinSimulationResult {
  payment_amount: number;
  total_amount_owed: number;
  [key: string]: unknown;
}
