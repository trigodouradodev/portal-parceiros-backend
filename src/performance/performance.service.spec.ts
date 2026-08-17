import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISBURSEMENT_BANDS,
  RATE_BANDS,
  RISK_BANDS,
  pgDate,
} from './performance.fixture';
import { BonusBand } from './interfaces/partner-program.interface';
import { BonusBandRow } from './interfaces/performance-row.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';

function bandRows(pillar: string, bands: BonusBand[]): BonusBandRow[] {
  return bands.map((band) => ({
    pillar,
    min_value: band.minValue,
    min_inclusive: band.minInclusive,
    max_value: band.maxValue,
    max_inclusive: band.maxInclusive,
    bonus_percent: band.bonusPercent,
  }));
}

const ALL_BANDS: BonusBandRow[] = [
  ...bandRows('DISBURSEMENT', DISBURSEMENT_BANDS),
  ...bandRows('RISK', RISK_BANDS),
  ...bandRows('RATE', RATE_BANDS),
];

const ENROLLMENT_ROW = {
  full_name: 'Treinamento',
  level_key: 'GOLD',
  level_name: 'Ouro',
  monthly_target: '200000.00',
  monthly_fixed: '8000.00',
  started_at: pgDate('2025-11-15'),
  reference_date: pgDate('2026-07-30'),
};

const ORIGINATION_ROW = {
  month: '2026-07',
  period_start: pgDate('2026-07-01'),
  period_end: pgDate('2026-07-30'),
  origination_count: 0n,
  origination_amount: '0',
  avg_rate: null,
};

const DELINQUENCY_ROW = { overdue_amount: '0', open_amount: '188645.33' };

interface RawOverrides {
  enrollment?: unknown[];
  origination?: unknown[];
  delinquency?: unknown[];
}

interface PrismaOverrides {
  raw?: RawOverrides;
  bands?: BonusBandRow[];
  levels?: unknown[];
  milestones?: unknown[];
  config?: { value: string } | null;
}

/**
 * PrismaService mockado. `$queryRaw` roteia pelo conteúdo do SQL, e não pela
 * ordem das chamadas, porque `getCurrentPerformance` dispara as queries em
 * `Promise.all` — a ordem de resolução não é garantida.
 */
function createPrismaMock(overrides: PrismaOverrides = {}) {
  const raw = overrides.raw ?? {};
  return {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('partner_enrollments')) {
        return Promise.resolve(raw.enrollment ?? [ENROLLMENT_ROW]);
      }
      if (sql.includes('loan_terms')) {
        return Promise.resolve(raw.origination ?? [ORIGINATION_ROW]);
      }
      if (sql.includes('overdue_amount')) {
        return Promise.resolve(raw.delinquency ?? [DELINQUENCY_ROW]);
      }
      throw new Error(`query não mapeada no mock: ${sql}`);
    }),
    partner_bonus_bands: {
      findMany: jest.fn().mockResolvedValue(overrides.bands ?? ALL_BANDS),
    },
    partner_levels: {
      findMany: jest.fn().mockResolvedValue(
        overrides.levels ?? [
          {
            key: 'GOLD',
            name: 'Ouro',
            monthly_target_amount: '200000.00',
            monthly_fixed_amount: '8000.00',
          },
        ],
      ),
    },
    partner_permanence_milestones: {
      findMany: jest.fn().mockResolvedValue(
        overrides.milestones ?? [
          { month_number: 6, fixed_multiplier: '1.00' },
          { month_number: 12, fixed_multiplier: '2.00' },
          { month_number: 18, fixed_multiplier: '3.00' },
        ],
      ),
    },
    system_configs: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.config === undefined
            ? { value: '4000.00' }
            : overrides.config,
        ),
    },
  };
}

async function buildService(
  overrides: PrismaOverrides = {},
): Promise<PerformanceService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PerformanceService,
      { provide: PrismaService, useValue: createPrismaMock(overrides) },
    ],
  }).compile();
  return module.get(PerformanceService);
}

describe('PerformanceService.getPartnerProfile', () => {
  it('monta o perfil do parceiro inscrito', async () => {
    const service = await buildService();
    const profile = await service.getPartnerProfile(USER_ID, [
      PermissionKey.ROLE_CONSULTANT,
    ]);

    expect(profile.level.key).toBe('GOLD');
    expect(profile.partnership.monthNumber).toBe(9);
    expect(profile.partner.roleLabel).toBe('Consultor parceiro');
  });

  it('responde 404 para quem não está inscrito no programa', async () => {
    const service = await buildService({ raw: { enrollment: [] } });
    await expect(service.getPartnerProfile(USER_ID, [])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('responde 404 para parceria com início no futuro', async () => {
    // Cadastro antecipado pelo backoffice: a parceria ainda não começou, então
    // não pode exibir "mês 0" nem liberar boas-vindas antes da hora.
    const service = await buildService({
      raw: {
        enrollment: [{ ...ENROLLMENT_ROW, started_at: pgDate('2026-09-01') }],
      },
    });
    await expect(service.getPartnerProfile(USER_ID, [])).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PerformanceService.getProgram', () => {
  it('devolve os parâmetros do programa com os 3 pilares', async () => {
    const service = await buildService();
    const program = await service.getProgram();

    expect(program.welcomeBonusAmount).toBe(4000);
    expect(program.bonusPillars.map((p) => p.pillar)).toEqual([
      'DISBURSEMENT',
      'RISK',
      'RATE',
    ]);
    expect(program.permanenceMilestones).toHaveLength(3);
  });

  it('falha alto quando uma régua tem buraco, em vez de pagar bônus errado calado', async () => {
    // Remove a faixa [9.5 , 9.5] da taxa: o valor exatamente 9,5% fica sem
    // cobertura e o parceiro receberia 0% sem que ninguém percebesse.
    const bands = ALL_BANDS.filter(
      (band) =>
        !(
          band.pillar === 'RATE' &&
          band.min_value === 9.5 &&
          band.max_value === 9.5
        ),
    );
    const service = await buildService({ bands });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha quando um pilar não tem nenhuma faixa cadastrada', async () => {
    const service = await buildService({
      bands: ALL_BANDS.filter((band) => band.pillar !== 'RISK'),
    });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha quando a config do bônus de boas-vindas não existe', async () => {
    const service = await buildService({ config: null });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha quando a config do bônus de boas-vindas não é numérica', async () => {
    // `system_configs.value` é texto livre — cair para 0 seria pior que erro:
    // 0 é indistinguível de "não é o 1º mês" e sumiria da tela.
    const service = await buildService({ config: { value: 'quatro mil' } });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha quando a config do bônus de boas-vindas é negativa', async () => {
    const service = await buildService({ config: { value: '-100' } });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha quando não há nível ativo', async () => {
    const service = await buildService({ levels: [] });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('falha quando não há marco de permanência', async () => {
    const service = await buildService({ milestones: [] });
    await expect(service.getProgram()).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

describe('PerformanceService.getCurrentPerformance', () => {
  it('monta o desempenho do mês com os bônus resolvidos', async () => {
    const service = await buildService({
      raw: {
        origination: [
          {
            ...ORIGINATION_ROW,
            origination_count: 14n,
            origination_amount: '250000',
            avg_rate: '0.1043',
          },
        ],
        delinquency: [{ overdue_amount: '15000', open_amount: '1000000' }],
      },
    });

    const result = await service.getCurrentPerformance(USER_ID);

    expect(result.origination.targetPercent).toBe(125);
    expect(result.origination.bonusPercent).toBe(20);
    expect(result.delinquency.rate).toBe(1.5);
    expect(result.delinquency.bonusPercent).toBe(50);
    expect(result.averageRate.rate).toBe(10.43);
    expect(result.averageRate.bonusPercent).toBe(30);
    // Mês 9: sem boas-vindas e sem marco, então fixo + os três bônus.
    expect(result.commission.total).toBe(16000);
  });

  it('responde 404 para quem não está inscrito', async () => {
    const service = await buildService({ raw: { enrollment: [] } });
    await expect(service.getCurrentPerformance(USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('valida as réguas também neste endpoint, não só no /program', async () => {
    const service = await buildService({
      bands: ALL_BANDS.filter((band) => band.pillar !== 'RATE'),
    });
    await expect(service.getCurrentPerformance(USER_ID)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
