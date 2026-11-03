import { BadRequestException } from '@nestjs/common';
import {
  assertInsuranceAgeEligible,
  INSURANCE_AGE_INELIGIBLE,
} from './insurance-age.guard';

const FIRST_INSTALLMENT = new Date('2026-10-20T00:00:00.000Z');

function thrown(fn: () => void): BadRequestException {
  try {
    fn();
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('não lançou');
}

describe('assertInsuranceAgeEligible', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('não lança para cliente dentro da faixa durante toda a vigência', () => {
    expect(() =>
      assertInsuranceAgeEligible({
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        installments: 12,
        firstInstallmentDate: FIRST_INSTALLMENT,
      }),
    ).not.toThrow();
  });

  it('aceita quem faz exatamente 70 anos no fim da vigência (o corte é acima de 70)', () => {
    // nascido em 01/08/1956: em 20/07/2027 (9 parcelas) ainda tem 70
    expect(() =>
      assertInsuranceAgeEligible({
        birthDate: new Date('1956-08-01T00:00:00.000Z'),
        installments: 9,
        firstInstallmentDate: FIRST_INSTALLMENT,
      }),
    ).not.toThrow();
  });

  it('recusa acima de 70 anos ao fim da vigência, com código, motivo, idade e prazo máximo', () => {
    const error = thrown(() =>
      assertInsuranceAgeEligible({
        birthDate: new Date('1956-08-01T00:00:00.000Z'),
        installments: 10,
        firstInstallmentDate: FIRST_INSTALLMENT,
      }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      statusCode: 400,
      code: INSURANCE_AGE_INELIGIBLE,
      reason: 'MAX_AGE_AT_CONTRACT_END',
      message:
        'O seguro prestamista cobre clientes de até 70 anos ao fim da vigência, e com 10 parcelas o cliente teria 71 anos. Reduza o prazo para até 9 parcelas.',
    });
  });

  it('diz que nenhum prazo atende quando já passa do limite no primeiro mês', () => {
    const error = thrown(() =>
      assertInsuranceAgeEligible({
        birthDate: new Date('1940-01-01T00:00:00.000Z'),
        installments: 6,
        firstInstallmentDate: FIRST_INSTALLMENT,
      }),
    );

    expect((error.getResponse() as { message: string }).message).toContain(
      'Nenhum prazo atende a esta idade.',
    );
  });

  it('recusa menor de idade e falta de data de nascimento, com mensagens próprias', () => {
    const minor = thrown(() =>
      assertInsuranceAgeEligible({
        birthDate: new Date('2015-01-01T00:00:00.000Z'),
        installments: 12,
        firstInstallmentDate: FIRST_INSTALLMENT,
      }),
    );
    expect(minor.getResponse()).toMatchObject({
      code: INSURANCE_AGE_INELIGIBLE,
      reason: 'MENOR_DE_IDADE',
      message: 'O cliente é menor de idade e não pode contratar o seguro.',
    });

    const missing = thrown(() =>
      assertInsuranceAgeEligible({
        birthDate: null,
        installments: 12,
        firstInstallmentDate: FIRST_INSTALLMENT,
      }),
    );
    expect(missing.getResponse()).toMatchObject({
      reason: 'SEM_DATA_NASCIMENTO',
      message:
        'Informe a data de nascimento do cliente para contratar o seguro.',
    });
  });
});
