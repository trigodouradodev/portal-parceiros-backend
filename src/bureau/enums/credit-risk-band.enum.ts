/**
 * Indicativo de risco de crédito mostrado ao parceiro (nunca o score).
 * `INELIGIBLE` é a faixa abaixo do mínimo: não elegível, reprovação automática.
 */
export enum CreditRiskBand {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  INELIGIBLE = 'ineligible',
}
