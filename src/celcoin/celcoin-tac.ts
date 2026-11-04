/**
 * Como a TAC vai à Celcoin: taxa (`tac_rate`) enquanto ela rende ao menos o
 * piso; abaixo dele, o piso em valor (`tac_amount`). Sem TAC (taxa 0) vai
 * `tac_amount: 0`, que a Celcoin exige para isenção, e o piso não se aplica.
 * Mesma regra do conector (`src/utils/tac.ts`): a simulação do portal e a
 * criação da solicitação têm de chegar ao mesmo valor.
 */
export type CelcoinTac = { tac_rate: number } | { tac_amount: number };

export function resolveCelcoinTac(
  rate: number,
  requestedAmount: number,
  minAmount = 0,
): CelcoinTac {
  if (!(rate > 0)) return { tac_amount: 0 };
  const byRate = Math.round(rate * requestedAmount * 100) / 100;
  if (minAmount > 0 && byRate < minAmount) return { tac_amount: minAmount };
  return { tac_rate: rate };
}
