import { classifyCreditRisk } from './credit-risk-band';
import { DEFAULT_CREDIT_RISK_BANDS } from './credit-risk-config.service';
import { CreditRiskBand } from './enums/credit-risk-band.enum';

describe('classifyCreditRisk', () => {
  it.each([
    [0, CreditRiskBand.HIGH],
    [399, CreditRiskBand.HIGH],
    [400, CreditRiskBand.MEDIUM],
    [600, CreditRiskBand.MEDIUM],
    [700, CreditRiskBand.MEDIUM],
    [701, CreditRiskBand.LOW],
    [1000, CreditRiskBand.LOW],
  ])('score %i com o padrão 400/700 é %s', (score, band) => {
    expect(classifyCreditRisk(score, DEFAULT_CREDIT_RISK_BANDS)).toBe(band);
  });

  it('respeita limites configurados', () => {
    const bands = { highBelow: 500, lowAbove: 700 };
    expect(classifyCreditRisk(450, bands)).toBe(CreditRiskBand.HIGH);
    expect(classifyCreditRisk(650, bands)).toBe(CreditRiskBand.MEDIUM);
    expect(classifyCreditRisk(701, bands)).toBe(CreditRiskBand.LOW);
  });

  it('aceita limites iguais: não sobra faixa média além do ponto', () => {
    const bands = { highBelow: 500, lowAbove: 500 };
    expect(classifyCreditRisk(499, bands)).toBe(CreditRiskBand.HIGH);
    expect(classifyCreditRisk(500, bands)).toBe(CreditRiskBand.MEDIUM);
    expect(classifyCreditRisk(501, bands)).toBe(CreditRiskBand.LOW);
  });

  it('sem score ou sem faixas válidas não há indicativo', () => {
    expect(classifyCreditRisk(null, DEFAULT_CREDIT_RISK_BANDS)).toBeNull();
    expect(classifyCreditRisk(450, null)).toBeNull();
  });
});
