import { checkInsuranceEligibility } from './insurance-eligibility';

describe('checkInsuranceEligibility', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('é elegível quando a idade está dentro da faixa em toda a vigência', () => {
    const birthDate = new Date('1990-05-20T00:00:00.000Z'); // 36 anos hoje

    expect(checkInsuranceEligibility(birthDate, 12, null)).toEqual({
      eligible: true,
    });
  });

  it('reprova sem data de nascimento', () => {
    expect(checkInsuranceEligibility(null, 12, null)).toEqual({
      eligible: false,
      reason: 'SEM_DATA_NASCIMENTO',
    });
  });

  it('reprova menor de 18 anos hoje', () => {
    const birthDate = new Date('2015-01-01T00:00:00.000Z'); // 11 anos hoje

    expect(checkInsuranceEligibility(birthDate, 12, null)).toEqual({
      eligible: false,
      reason: 'MENOR_DE_IDADE',
    });
  });

  it('reprova quando o cliente completa mais de 70 anos até o fim da vigência', () => {
    // 69 anos hoje, mas a vigência de 24 meses ultrapassa os 70.
    const birthDate = new Date('1957-01-01T00:00:00.000Z');

    expect(checkInsuranceEligibility(birthDate, 24, null)).toEqual({
      eligible: false,
      reason: 'MAX_AGE_AT_CONTRACT_END',
    });
  });

  it('o mesmo cliente pode ser elegível num prazo e não em outro', () => {
    // 69 anos e 11 meses hoje: em 1 mês de prazo ainda não completa 70;
    // em 24 meses, completa — nunca deve ser tratado como sim/não fixo.
    const birthDate = new Date('1956-10-25T00:00:00.000Z');

    expect(checkInsuranceEligibility(birthDate, 1, null).eligible).toBe(true);
    expect(checkInsuranceEligibility(birthDate, 24, null).eligible).toBe(false);
  });

  it('usa a data da primeira parcela, não hoje, como início da vigência', () => {
    const birthDate = new Date('1956-06-01T00:00:00.000Z'); // 70 anos hoje
    // Primeira parcela daqui a 1 ano: aos 71 anos a vigência de 1 mês já
    // some ultrapassar os 70.
    const firstInstallmentDate = new Date('2027-09-25T00:00:00.000Z');

    expect(
      checkInsuranceEligibility(birthDate, 1, firstInstallmentDate).eligible,
    ).toBe(false);
  });
});
