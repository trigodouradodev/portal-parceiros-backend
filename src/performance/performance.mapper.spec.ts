import { Prisma } from '@prisma/client';
import { mapPerformance, mapPerformanceMonths } from './performance.mapper';
import { performanceRow } from './performance.fixture';

describe('mapPerformance', () => {
  it('apresenta a competência e as medições oficiais, sem substituir as taxas do bônus', () => {
    expect(mapPerformance(performanceRow())).toEqual({
      month: '2026-09',
      availability: 'AVAILABLE',
      data: {
        level: { key: 'BRONZE', label: 'Bronze' },
        remuneration: {
          fixedAmount: 4000,
          disbursementBonusAmount: 400,
          rateBonusAmount: 400,
          riskBonusAmount: 1320,
          agreementAmount: 0,
          productionBonusAmount: null,
          reimbursementBonusAmount: null,
          totalAmount: 6120,
        },
        indicators: {
          origination: {
            status: 'AVAILABLE',
            amount: 110000,
            targetAmount: 100000,
            targetPercent: 110,
            appliedBand: null,
          },
          interestRate: {
            status: 'AVAILABLE',
            rate: 9.5,
            simpleRate: 9.5,
            weightedRate: 9.7,
            appliedBand: null,
          },
          delinquency: {
            status: 'AVAILABLE',
            rate: 3.33,
            portfolioRate: 6,
            overdueAmount: 6000,
            portfolioAmount: 100000,
            disregardedOverdueAmount: 3000,
            disregardedPortfolioAmount: 10000,
            appliedBand: null,
          },
          reimbursement: { status: 'NOT_APPLICABLE', amount: null },
        },
      },
    });
  });

  it('mantém a competência solicitada quando não há dados, sem procurar um mês anterior', () => {
    expect(
      mapPerformance(
        performanceRow({ requested_month: '2026-10', id_consultor: null }),
      ),
    ).toEqual({
      month: '2026-10',
      availability: 'NO_DATA',
      data: null,
    });
  });

  it('não recalcula percentuais nem limita performance acima de 100%', () => {
    const data = mapPerformance(
      performanceRow({
        pct_meta_atingido: '180.1234',
        taxa_media_bonus: '9.4996',
        pct_inadimplencia_bonus: '3.5001',
      }),
    ).data!;
    expect(data.indicators.origination.targetPercent).toBe(180.1234);
    expect(data.indicators.interestRate.rate).toBe(9.4996);
    expect(data.indicators.delinquency.rate).toBe(3.5001);
    expect(data.indicators.interestRate.appliedBand).toBeNull();
    expect(data.indicators.delinquency.appliedBand).toBeNull();
  });

  it('converte Decimal do Prisma preservando zero, precisão e valores nulos', () => {
    const data = mapPerformance(
      performanceRow({
        valor_originado_mes: new Prisma.Decimal('0'),
        meta_originacao_mensal: new Prisma.Decimal('100000'),
        pct_meta_atingido: new Prisma.Decimal('0'),
        taxa_media_bonus: new Prisma.Decimal('9.4996'),
        pct_inadimplencia_bonus: null,
      }),
    ).data!;
    expect(data.indicators.origination).toMatchObject({
      status: 'AVAILABLE',
      amount: 0,
      targetAmount: 100000,
      targetPercent: 0,
    });
    expect(data.indicators.interestRate.rate).toBe(9.4996);
    expect(data.indicators.delinquency.rate).toBeNull();
  });

  it.each([new Prisma.Decimal('NaN'), new Prisma.Decimal('Infinity')])(
    'recusa Decimal não finito %s',
    (value) => {
      expect(() =>
        mapPerformance(performanceRow({ taxa_media_bonus: value })),
      ).toThrow('invalid_performance_number');
    },
  );

  it('distingue zero medido de ausência de medição', () => {
    const data = mapPerformance(
      performanceRow({
        valor_originado_mes: '0',
        taxa_media_bonus: null,
        pct_inadimplencia_bonus: null,
        valor_carteira_ativa: '0',
      }),
    ).data!;
    expect(data.indicators.origination).toMatchObject({
      status: 'AVAILABLE',
      amount: 0,
    });
    expect(data.indicators.interestRate).toMatchObject({
      status: 'NO_MEASUREMENT',
      rate: null,
    });
    expect(data.indicators.delinquency).toMatchObject({
      status: 'NO_MEASUREMENT',
      rate: null,
      portfolioAmount: 0,
    });
  });

  it.each([
    ['Bronze', 'BRONZE'],
    ['Prata', 'SILVER'],
    ['Ouro', 'GOLD'],
    ['Platinum', 'PLATINUM'],
  ])('preserva a meta da competência para %s', (label, key) => {
    const data = mapPerformance(performanceRow({ nivel: label })).data!;
    expect(data.level).toEqual({ key, label });
    expect(data.indicators.origination.targetAmount).toBe(100000);
  });

  it('apresenta Aurea com indicadores informativos e sem meta de outro nível', () => {
    const data = mapPerformance(performanceRow({ nivel: 'Aurea' })).data!;
    expect(data.level.key).toBe('AUREA');
    expect(data.indicators.origination.targetAmount).toBeNull();
    expect(data.indicators.origination.targetPercent).toBeNull();
    expect(data.indicators.interestRate.rate).toBe(9.5);
    expect(data.indicators.delinquency.rate).toBe(3.33);
  });

  it.each([
    ['Híbrido', 'HYBRID'],
    ['Reembolso', 'REIMBURSEMENT'],
  ])(
    'apresenta produção e reembolso para %s, sem meta ou indicadores exclusivos',
    (label, key) => {
      const data = mapPerformance(
        performanceRow({ nivel: label, valor_reembolso_mes: '42000.00' }),
      ).data!;
      expect(data.level.key).toBe(key);
      expect(data.indicators.origination).toMatchObject({
        amount: 110000,
        targetAmount: null,
        targetPercent: null,
      });
      expect(data.indicators.interestRate).toMatchObject({
        status: 'NOT_APPLICABLE',
        rate: null,
      });
      expect(data.indicators.delinquency).toMatchObject({
        status: 'NOT_APPLICABLE',
        portfolioRate: null,
        overdueAmount: null,
      });
      expect(data.indicators.reimbursement).toEqual({
        status: 'AVAILABLE',
        amount: 42000,
      });
    },
  );

  it('apresenta somente o movimento de reembolso para Cobrador', () => {
    const data = mapPerformance(
      performanceRow({ nivel: 'Cobrador', valor_reembolso_mes: 0 }),
    ).data!;
    expect(data.level.key).toBe('COLLECTION_AGENT');
    expect(data.indicators.origination).toMatchObject({
      status: 'NOT_APPLICABLE',
      amount: null,
      targetAmount: null,
    });
    expect(data.indicators.reimbursement).toEqual({
      status: 'AVAILABLE',
      amount: 0,
    });
  });

  it.each(['Híbrido', 'Reembolso', 'Cobrador'])(
    'distingue campos não aplicáveis de reembolso sem medição em %s',
    (nivel) => {
      const data = mapPerformance(
        performanceRow({
          nivel,
          meta_originacao_mensal: null,
          pct_meta_atingido: null,
          taxa_media_bonus: null,
          taxa_media_simples: null,
          taxa_media_ponderada: null,
          pct_inadimplencia_bonus: null,
          pct_inadimplencia: null,
          valor_inadimplencia: null,
          valor_carteira_ativa: null,
          valor_reembolso_mes: null,
        }),
      ).data!;
      expect(data.indicators.interestRate.status).toBe('NOT_APPLICABLE');
      expect(data.indicators.delinquency.status).toBe('NOT_APPLICABLE');
      expect(data.indicators.origination.targetAmount).toBeNull();
      expect(data.indicators.reimbursement).toEqual({
        status: 'NO_MEASUREMENT',
        amount: null,
      });
    },
  );

  it('consulta o mês atual disponível sem exigir metadados de snapshot', () => {
    const response = mapPerformance(
      performanceRow({ requested_month: '2026-10' }),
    );
    expect(response.month).toBe('2026-10');
    expect(response.availability).toBe('AVAILABLE');
    expect(response.data).not.toHaveProperty('snapshot');
  });

  it.each(['Nova categoria', null])(
    'preserva o rótulo desconhecido %s sem inventar meta',
    (label) => {
      const data = mapPerformance(performanceRow({ nivel: label })).data!;
      expect(data.level).toEqual({ key: 'UNKNOWN', label });
      expect(data.indicators.origination).toMatchObject({
        amount: 110000,
        targetAmount: null,
        targetPercent: null,
      });
    },
  );

  it.each(['', ' ', 'NaN', 'Infinity', 'inválido', Infinity])(
    'recusa numeric inválido %p sem convertê-lo em zero',
    (value) => {
      expect(() =>
        mapPerformance(performanceRow({ valor_originado_mes: value })),
      ).toThrow('invalid_performance_number');
    },
  );
});

describe('mapPerformanceMonths', () => {
  it('mantém o mês corrente separado do último mês disponível', () => {
    expect(
      mapPerformanceMonths([
        {
          current_month: '2026-10',
          month: '2026-09',
        },
      ]),
    ).toEqual({
      currentMonth: '2026-10',
      months: [{ month: '2026-09' }],
    });
  });

  it('retorna histórico vazio sem simular ausência de inscrição', () => {
    expect(
      mapPerformanceMonths([{ current_month: '2026-10', month: null }]),
    ).toEqual({ currentMonth: '2026-10', months: [] });
  });

  it('recusa resultado sem referência do banco', () => {
    expect(() => mapPerformanceMonths([])).toThrow(
      'missing_performance_reference_month',
    );
  });
});

describe('remuneração oficial', () => {
  it('preserva os valores do BI, inclusive zero e total sem recompor as parcelas', () => {
    const data = mapPerformance(
      performanceRow({
        valor_fixo_mensal: new Prisma.Decimal('4000'),
        valor_bonus_desembolso: '0.00',
        valor_bonus_taxa: '800.00',
        valor_bonus_risco: 0,
        valor_acordos: '-50.25',
        valor_bonus_producao: null,
        valor_bonus_reembolso: null,
        valor_remuneracao_total: '4800.00',
      }),
    ).data!;
    expect(data.remuneration).toEqual({
      fixedAmount: 4000,
      disbursementBonusAmount: 0,
      rateBonusAmount: 800,
      riskBonusAmount: 0,
      agreementAmount: -50.25,
      productionBonusAmount: null,
      reimbursementBonusAmount: null,
      totalAmount: 4800,
    });
  });

  it('não soma produção e reembolso do híbrido para alterar o total oficial', () => {
    const data = mapPerformance(
      performanceRow({
        nivel: 'Híbrido',
        valor_fixo_mensal: null,
        valor_bonus_desembolso: null,
        valor_bonus_taxa: null,
        valor_bonus_risco: null,
        valor_acordos: null,
        valor_bonus_producao: '1000.00',
        valor_bonus_reembolso: '1800.00',
        valor_reembolso_mes: '36000.00',
        valor_remuneracao_total: '1800.00',
      }),
    ).data!;
    expect(data.remuneration).toEqual({
      fixedAmount: null,
      disbursementBonusAmount: null,
      rateBonusAmount: null,
      riskBonusAmount: null,
      agreementAmount: null,
      productionBonusAmount: 1000,
      reimbursementBonusAmount: 1800,
      totalAmount: 1800,
    });
  });

  it('mantém total nulo e total zero como valores distintos', () => {
    expect(
      mapPerformance(performanceRow({ valor_remuneracao_total: null })).data!
        .remuneration.totalAmount,
    ).toBeNull();
    expect(
      mapPerformance(performanceRow({ valor_remuneracao_total: '0' })).data!
        .remuneration.totalAmount,
    ).toBe(0);
  });

  it('recusa total financeiro inválido sem substituí-lo por zero', () => {
    expect(() =>
      mapPerformance(performanceRow({ valor_remuneracao_total: 'NaN' })),
    ).toThrow('invalid_performance_number');
  });
});
