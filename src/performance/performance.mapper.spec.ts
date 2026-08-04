import {
  mapCurrentPerformance,
  mapPartnerProfile,
  roleLabel,
} from './performance.mapper';
import { MILESTONES, PROGRAM, pgDate } from './performance.fixture';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { CommissionComponentKind } from './interfaces/current-performance.interface';
import {
  DelinquencyRow,
  EnrollmentRow,
  OriginationRow,
} from './interfaces/performance-row.interface';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';

function enrollment(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    full_name: 'Treinamento',
    level_key: 'GOLD',
    level_name: 'Ouro',
    monthly_target: '200000.00',
    monthly_fixed: '8000.00',
    started_at: pgDate('2025-11-15'),
    reference_date: pgDate('2026-07-30'),
    ...overrides,
  };
}

function origination(overrides: Partial<OriginationRow> = {}): OriginationRow {
  return {
    month: '2026-07',
    period_start: pgDate('2026-07-01'),
    period_end: pgDate('2026-07-30'),
    origination_count: 0n,
    origination_amount: '0',
    avg_rate: null,
    ...overrides,
  };
}

function delinquency(overrides: Partial<DelinquencyRow> = {}): DelinquencyRow {
  return { overdue_amount: '0', open_amount: '0', ...overrides };
}

/** Cenário de performance máxima: ≥120% da meta, ≤2% de inadimplência, taxa >10%. */
function maxPerformance(monthlyTarget: number, monthNumber: number) {
  return {
    origination: origination({
      origination_count: 14n,
      origination_amount: String(monthlyTarget * 1.25),
      avg_rate: '0.1043',
    }),
    delinquency: delinquency({
      overdue_amount: '15000',
      open_amount: '1000000',
    }),
    program: PROGRAM,
    monthlyTarget,
    monthNumber,
  };
}

function amountOf(
  result: ReturnType<typeof mapCurrentPerformance>,
  kind: CommissionComponentKind,
): number {
  return result.commission.components.find((c) => c.kind === kind)!.amount;
}

describe('roleLabel', () => {
  it('mapeia a permissão para o cargo em português', () => {
    expect(roleLabel([PermissionKey.ROLE_COLLECTION_AGENT])).toBe(
      'Agente de cobrança',
    );
  });

  it('prefere o papel de negócio ao sistêmico quando o usuário tem os dois', () => {
    expect(
      roleLabel([PermissionKey.ROLE_ADMIN, PermissionKey.ROLE_MANAGER]),
    ).toBe('Gerente');
  });

  it('respeita a precedência entre papéis de negócio', () => {
    expect(
      roleLabel([PermissionKey.ROLE_CONSULTANT, PermissionKey.ROLE_DIRECTOR]),
    ).toBe('Diretor');
  });

  it('devolve null sem nenhuma ROLE_*, em vez de inventar rótulo', () => {
    expect(roleLabel(['INSTALLMENT_VIEW'])).toBeNull();
  });
});

describe('mapPartnerProfile', () => {
  it('monta o perfil do parceiro de teste com o dado real', () => {
    const profile = mapPartnerProfile(
      USER_ID,
      [PermissionKey.ROLE_CONSULTANT],
      enrollment(),
      MILESTONES,
    );

    expect(profile).toEqual({
      partner: {
        id: USER_ID,
        fullName: 'Treinamento',
        roleLabel: 'Consultor parceiro',
      },
      level: {
        key: 'GOLD',
        label: 'Ouro',
        monthlyTarget: 200000,
        monthlyFixed: 8000,
      },
      partnership: {
        startedAt: '2025-11-15',
        monthNumber: 9,
        isFirstMonth: false,
        nextMilestone: {
          month: 12,
          multiplier: 2,
          amount: 16000,
          monthsRemaining: 3,
        },
      },
    });
  });

  it('marca isFirstMonth no mês de entrada', () => {
    const profile = mapPartnerProfile(
      USER_ID,
      [],
      enrollment({
        started_at: pgDate('2026-07-02'),
        reference_date: pgDate('2026-07-30'),
      }),
      MILESTONES,
    );
    expect(profile.partnership.monthNumber).toBe(1);
    expect(profile.partnership.isFirstMonth).toBe(true);
  });

  it('zera o próximo marco depois do último', () => {
    const profile = mapPartnerProfile(
      USER_ID,
      [],
      enrollment({
        started_at: pgDate('2024-01-15'),
        reference_date: pgDate('2026-07-30'),
      }),
      MILESTONES,
    );
    expect(profile.partnership.monthNumber).toBe(31);
    expect(profile.partnership.nextMilestone).toBeNull();
  });

  it('calcula o valor do marco sobre o fixo do nível', () => {
    const profile = mapPartnerProfile(
      USER_ID,
      [],
      enrollment({ level_key: 'BRONZE', monthly_fixed: '4000.00' }),
      MILESTONES,
    );
    // Marco de 12 meses = 2× fixo.
    expect(profile.partnership.nextMilestone?.amount).toBe(8000);
  });
});

describe('mapCurrentPerformance', () => {
  /**
   * Cruzamento com a tabela comparativa entre níveis (seção 3.5 do documento
   * comercial), que fixa os valores de cada bônus em performance máxima no
   * mês 1. Se o cálculo divergir do material oficial, é aqui que aparece.
   */
  describe.each([
    // nível,      meta,   fixo,  +desemb, +risco, +taxa, total mês 1
    ['Bronze', 100000, 4000, 800, 2000, 1200, 12000],
    ['Prata', 150000, 6000, 1200, 3000, 1800, 16000],
    ['Ouro', 200000, 8000, 1600, 4000, 2400, 20000],
    ['Platinum', 300000, 12000, 2400, 6000, 3600, 28000],
  ])(
    'performance máxima no mês 1 — %s',
    (_level, target, fixed, disbursement, risk, rate, total) => {
      const result = mapCurrentPerformance({
        ...maxPerformance(target, 1),
        monthlyFixed: fixed,
      });

      it('destrava o teto dos três pilares', () => {
        expect(result.origination.bonusPercent).toBe(20);
        expect(result.delinquency.bonusPercent).toBe(50);
        expect(result.averageRate.bonusPercent).toBe(30);
      });

      it('bate com os valores da tabela oficial', () => {
        expect(amountOf(result, CommissionComponentKind.FIXED)).toBe(fixed);
        expect(amountOf(result, CommissionComponentKind.WELCOME)).toBe(4000);
        expect(
          amountOf(result, CommissionComponentKind.DISBURSEMENT_BONUS),
        ).toBe(disbursement);
        expect(amountOf(result, CommissionComponentKind.RISK_BONUS)).toBe(risk);
        expect(amountOf(result, CommissionComponentKind.RATE_BONUS)).toBe(rate);
      });

      it('soma o total do mês 1 da tabela oficial', () => {
        expect(result.commission.total).toBe(total);
      });
    },
  );

  it('reproduz a coluna "Permanência 18M" da tabela oficial (soma dos 3 marcos = 6× fixo)', () => {
    // Ouro: 1×8000 + 2×8000 + 3×8000 = 48000.
    const total = MILESTONES.reduce(
      (acc, milestone) =>
        acc +
        amountOf(
          mapCurrentPerformance({
            ...maxPerformance(200000, milestone.month),
            monthlyFixed: 8000,
          }),
          CommissionComponentKind.PERMANENCE_BONUS,
        ),
      0,
    );
    expect(total).toBe(48000);
  });

  it('paga o marco de permanência só no mês exato', () => {
    const atMilestone = mapCurrentPerformance({
      ...maxPerformance(200000, 12),
      monthlyFixed: 8000,
    });
    const between = mapCurrentPerformance({
      ...maxPerformance(200000, 13),
      monthlyFixed: 8000,
    });
    expect(
      amountOf(atMilestone, CommissionComponentKind.PERMANENCE_BONUS),
    ).toBe(16000);
    expect(amountOf(between, CommissionComponentKind.PERMANENCE_BONUS)).toBe(0);
  });

  it('paga boas-vindas só no 1º mês', () => {
    const later = mapCurrentPerformance({
      ...maxPerformance(200000, 2),
      monthlyFixed: 8000,
    });
    expect(amountOf(later, CommissionComponentKind.WELCOME)).toBe(0);
  });

  it('não dá bônus de risco para carteira vazia — devolve null em vez de 0%', () => {
    const result = mapCurrentPerformance({
      origination: origination(),
      delinquency: delinquency({ overdue_amount: '0', open_amount: '0' }),
      program: PROGRAM,
      monthlyTarget: 200000,
      monthlyFixed: 8000,
      monthNumber: 1,
    });
    // 0% cairia na melhor faixa e daria o teto de +50% a quem não tem carteira.
    expect(result.delinquency.rate).toBeNull();
    expect(result.delinquency.bonusPercent).toBe(0);
  });

  it('não dá bônus de taxa quando não houve originação no mês', () => {
    const result = mapCurrentPerformance({
      origination: origination({ avg_rate: null }),
      delinquency: delinquency({
        overdue_amount: '15000',
        open_amount: '1000000',
      }),
      program: PROGRAM,
      monthlyTarget: 200000,
      monthlyFixed: 8000,
      monthNumber: 9,
    });
    expect(result.averageRate.rate).toBeNull();
    expect(result.averageRate.bonusPercent).toBe(0);
    expect(result.origination.targetPercent).toBe(0);
    expect(result.origination.bonusPercent).toBe(0);
  });

  it('converte a taxa de fração para percentual antes de comparar com as faixas', () => {
    const result = mapCurrentPerformance({
      ...maxPerformance(200000, 9),
      monthlyFixed: 8000,
    });
    // interest_rate é gravado como 0.1043; a régua trabalha em 10.43.
    expect(result.averageRate.rate).toBe(10.43);
  });

  it('reproduz o cenário real do parceiro de teste — carteira 83,53% inadimplente, só o fixo', () => {
    const result = mapCurrentPerformance({
      origination: origination(),
      delinquency: delinquency({
        overdue_amount: '157584.44',
        open_amount: '188645.33',
      }),
      program: PROGRAM,
      monthlyTarget: 200000,
      monthlyFixed: 8000,
      monthNumber: 9,
    });

    expect(result.delinquency.rate).toBe(83.53);
    expect(result.delinquency.bonusPercent).toBe(0);
    expect(result.commission.total).toBe(8000);
  });

  it('devolve todos os componentes, inclusive os zerados, e o total é a soma deles', () => {
    const result = mapCurrentPerformance({
      ...maxPerformance(200000, 12),
      monthlyFixed: 8000,
    });

    expect(result.commission.components).toHaveLength(6);
    expect(result.commission.total).toBe(
      result.commission.components.reduce((acc, c) => acc + c.amount, 0),
    );
  });

  it('ecoa o período de referência vindo do banco', () => {
    const result = mapCurrentPerformance({
      ...maxPerformance(200000, 9),
      monthlyFixed: 8000,
    });
    expect(result.month).toBe('2026-07');
    expect(result.periodStart).toBe('2026-07-01');
    expect(result.periodEnd).toBe('2026-07-30');
  });
});
