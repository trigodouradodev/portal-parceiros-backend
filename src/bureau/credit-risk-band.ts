import { CreditRiskBand } from './enums/credit-risk-band.enum';
import { CreditRiskBands } from './credit-risk-config.service';

/**
 * Abaixo de `highBelow` é alto risco; de `highBelow` a `lowAbove`, inclusive,
 * médio; acima de `lowAbove`, baixo. Sem score ou sem faixas, sem indicativo.
 */
export function classifyCreditRisk(
  score: number | null,
  bands: CreditRiskBands | null,
): CreditRiskBand | null {
  if (score === null || bands === null) return null;
  if (score < bands.highBelow) return CreditRiskBand.HIGH;
  if (score > bands.lowAbove) return CreditRiskBand.LOW;
  return CreditRiskBand.MEDIUM;
}
