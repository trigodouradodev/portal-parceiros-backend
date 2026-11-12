import { classifyCreditRisk } from './credit-risk-band';
import { DEFAULT_CREDIT_RISK_BANDS } from './credit-risk-config.service';
import { CreditRiskBand } from './enums/credit-risk-band.enum';

describe('classifyCreditRisk', () => {
  it.each([
    [0, CreditRiskBand.INELIGIBLE],
    [349, CreditRiskBand.INELIGIBLE],
    [350, CreditRiskBand.HIGH],
    [499, CreditRiskBand.HIGH],
    [500, CreditRiskBand.MEDIUM],
    [650, CreditRiskBand.MEDIUM],
    [651, CreditRiskBand.LOW],
    [1000, CreditRiskBand.LOW],
  ])('score %i com o padrão 350/500/650 é %s', (score, band) => {
    expect(classifyCreditRisk(score, DEFAULT_CREDIT_RISK_BANDS)).toBe(band);
  });

  it('respeita limites configurados', () => {
    const bands = { ineligibleBelow: 450, highBelow: 550, lowAbove: 700 };
    expect(classifyCreditRisk(449, bands)).toBe(CreditRiskBand.INELIGIBLE);
    expect(classifyCreditRisk(450, bands)).toBe(CreditRiskBand.HIGH);
    expect(classifyCreditRisk(600, bands)).toBe(CreditRiskBand.MEDIUM);
    expect(classifyCreditRisk(701, bands)).toBe(CreditRiskBand.LOW);
  });

  it('aceita limites iguais: faixas intermediárias podem sumir', () => {
    const bands = { ineligibleBelow: 500, highBelow: 500, lowAbove: 500 };
    expect(classifyCreditRisk(499, bands)).toBe(CreditRiskBand.INELIGIBLE);
    expect(classifyCreditRisk(500, bands)).toBe(CreditRiskBand.MEDIUM);
    expect(classifyCreditRisk(501, bands)).toBe(CreditRiskBand.LOW);
  });

  it('sem score ou sem faixas válidas não há indicativo', () => {
    expect(classifyCreditRisk(null, DEFAULT_CREDIT_RISK_BANDS)).toBeNull();
    expect(classifyCreditRisk(450, null)).toBeNull();
  });
});
