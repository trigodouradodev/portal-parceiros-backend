import { toNum } from '../common/query.util';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  BonusBandRow,
  DelinquencyRow,
  EnrollmentRow,
  OriginationRow,
  PermanenceMilestone,
  ProgramLevelRow,
} from './interfaces/performance-row.interface';
import {
  PartnerLevel,
  PartnerProfile,
} from './interfaces/partner-profile.interface';
import {
  BonusBand,
  BonusPillar,
  BonusPillarBands,
  PartnerProgram,
} from './interfaces/partner-program.interface';
import {
  CommissionComponent,
  CommissionComponentKind,
  CurrentPerformance,
} from './interfaces/current-performance.interface';
import {
  findNextMilestone,
  partnershipMonthNumber,
  resolveBonusPercent,
  round2,
  toDateString,
} from './performance.util';

/**
 * Rótulo de cargo da barra de identidade (ex.: "Roger Santos · Agente de
 * cobrança"), derivado das permissões `ROLE_*` — não de `trigo_users.role`, que
 * é varchar livre sem constraint. As permissões são o que o RBAC de fato aplica
 * e já chegam no `JwtPayload`, sem custo de query.
 *
 * A ordem do array é a precedência: quem tem mais de uma `ROLE_*` recebe o
 * rótulo da primeira que casar. Papéis de negócio vêm antes dos sistêmicos, pra
 * quem é gerente E admin aparecer como "Gerente".
 */
const ROLE_LABELS: ReadonlyArray<readonly [PermissionKey, string]> = [
  [PermissionKey.ROLE_DIRECTOR, 'Diretor'],
  [PermissionKey.ROLE_MANAGER, 'Gerente'],
  [PermissionKey.ROLE_CONSULTANT, 'Consultor parceiro'],
  [PermissionKey.ROLE_COLLECTION_AGENT, 'Agente de cobrança'],
  [PermissionKey.ROLE_SUPPORT, 'Suporte'],
  [PermissionKey.ROLE_ADMIN, 'Administrador'],
];

/** Cargo a partir das permissões do viewer. Sem nenhuma `ROLE_*` → null. */
export function roleLabel(permissions: string[]): string | null {
  const match = ROLE_LABELS.find(([key]) => permissions.includes(key));
  return match ? match[1] : null;
}

/** Monta a resposta de `GET /performance/me` a partir da linha da inscrição. */
export function mapPartnerProfile(
  userId: string,
  permissions: string[],
  row: EnrollmentRow,
  milestones: PermanenceMilestone[],
): PartnerProfile {
  const monthlyFixed = toNum(row.monthly_fixed);
  const monthNumber = partnershipMonthNumber(
    row.started_at,
    row.reference_date,
  );
  const next = findNextMilestone(monthNumber, milestones);

  return {
    partner: {
      id: userId,
      fullName: row.full_name,
      roleLabel: roleLabel(permissions),
    },
    level: {
      key: row.level_key,
      label: row.level_name,
      monthlyTarget: toNum(row.monthly_target),
      monthlyFixed,
    },
    partnership: {
      startedAt: toDateString(row.started_at),
      monthNumber,
      isFirstMonth: monthNumber === 1,
      nextMilestone: next && {
        month: next.month,
        multiplier: next.multiplier,
        amount: round2(next.multiplier * monthlyFixed),
        monthsRemaining: next.month - monthNumber,
      },
    },
  };
}

/**
 * Ordem em que os pilares são expostos — a mesma do material comercial, pra
 * tela não precisar reordenar.
 */
const PILLAR_ORDER: readonly BonusPillar[] = [
  BonusPillar.DISBURSEMENT,
  BonusPillar.RISK,
  BonusPillar.RATE,
];

function mapLevel(row: ProgramLevelRow): PartnerLevel {
  return {
    key: row.key,
    label: row.name,
    monthlyTarget: toNum(row.monthly_target_amount),
    monthlyFixed: toNum(row.monthly_fixed_amount),
  };
}

function mapBand(row: BonusBandRow): BonusBand {
  return {
    minValue: toNum(row.min_value),
    minInclusive: row.min_inclusive,
    // toNum(null) daria 0, que aqui significaria "teto zero" em vez de "sem
    // teto" — por isso o null passa direto.
    maxValue: row.max_value === null ? null : toNum(row.max_value),
    maxInclusive: row.max_inclusive,
    bonusPercent: toNum(row.bonus_percent),
  };
}

/**
 * Agrupa as faixas por pilar, na ordem de `PILLAR_ORDER`. Pilar sem nenhuma
 * faixa cadastrada entra com lista vazia de propósito — quem valida (o service)
 * precisa ver a ausência para poder reclamar dela.
 */
function mapBonusPillars(rows: BonusBandRow[]): BonusPillarBands[] {
  return PILLAR_ORDER.map((pillar) => ({
    pillar,
    // `partner_bonus_bands.pillar` é varchar (não enum do Postgres), então a
    // comparação é string-para-string.
    bands: rows.filter((row) => row.pillar === String(pillar)).map(mapBand),
  }));
}

/** Monta a resposta de `GET /performance/program`. */
export function mapPartnerProgram(
  welcomeBonusAmount: number,
  levels: ProgramLevelRow[],
  bands: BonusBandRow[],
  milestones: PermanenceMilestone[],
): PartnerProgram {
  return {
    welcomeBonusAmount,
    levels: levels.map(mapLevel),
    bonusPillars: mapBonusPillars(bands),
    permanenceMilestones: milestones,
  };
}

/** Insumos do bloco "Desempenho real do mês". */
export interface CurrentPerformanceInput {
  origination: OriginationRow;
  delinquency: DelinquencyRow;
  program: PartnerProgram;
  monthlyTarget: number;
  monthlyFixed: number;
  monthNumber: number;
}

/** Régua de um pilar. Lista vazia é impossível após a validação do programa. */
function bandsOf(program: PartnerProgram, pillar: BonusPillar): BonusBand[] {
  return program.bonusPillars.find((p) => p.pillar === pillar)?.bands ?? [];
}

/**
 * Monta a resposta de `GET /performance/current`: os 3 KPIs reais do mês, o
 * bônus que cada um já garantiu, e a comissão resultante.
 *
 * Os três pilares são independentes e somados, cada um como % sobre o fixo
 * mensal do nível.
 */
export function mapCurrentPerformance(
  input: CurrentPerformanceInput,
): CurrentPerformance {
  const { origination, delinquency, program, monthlyFixed, monthNumber } =
    input;

  const originationAmount = toNum(origination.origination_amount);
  const targetPercent =
    input.monthlyTarget > 0
      ? round2((originationAmount / input.monthlyTarget) * 100)
      : 0;
  const disbursementBonus = resolveBonusPercent(
    targetPercent,
    bandsOf(program, BonusPillar.DISBURSEMENT),
  );

  const overdueAmount = toNum(delinquency.overdue_amount);
  const portfolioOpenAmount = toNum(delinquency.open_amount);
  // Carteira vazia devolve null, não 0: 0 cairia na melhor faixa e daria o teto
  // de +50% a quem não tem carteira nenhuma. E na tela, "0,0%" pareceria
  // desempenho excelente, quando o certo é não haver o que medir.
  const delinquencyRate =
    portfolioOpenAmount > 0
      ? round2((overdueAmount / portfolioOpenAmount) * 100)
      : null;
  const riskBonus =
    delinquencyRate === null
      ? 0
      : resolveBonusPercent(
          delinquencyRate,
          bandsOf(program, BonusPillar.RISK),
        );

  // interest_rate é gravado em fração (0.098 = 9,8%); ×100 para casar com as
  // faixas, que são percentuais.
  const averageRate =
    origination.avg_rate === null
      ? null
      : round2(toNum(origination.avg_rate) * 100);
  const rateBonus =
    averageRate === null
      ? 0
      : resolveBonusPercent(averageRate, bandsOf(program, BonusPillar.RATE));

  const milestone = program.permanenceMilestones.find(
    (m) => m.month === monthNumber,
  );

  const components: CommissionComponent[] = [
    { kind: CommissionComponentKind.FIXED, amount: monthlyFixed },
    {
      kind: CommissionComponentKind.WELCOME,
      // Boas-vindas não depende de performance e sai uma única vez.
      amount: monthNumber === 1 ? program.welcomeBonusAmount : 0,
    },
    {
      kind: CommissionComponentKind.DISBURSEMENT_BONUS,
      amount: round2((monthlyFixed * disbursementBonus) / 100),
    },
    {
      kind: CommissionComponentKind.RISK_BONUS,
      amount: round2((monthlyFixed * riskBonus) / 100),
    },
    {
      kind: CommissionComponentKind.RATE_BONUS,
      amount: round2((monthlyFixed * rateBonus) / 100),
    },
    {
      kind: CommissionComponentKind.PERMANENCE_BONUS,
      // Marco é valor único no mês exato em que cai, não recorrente.
      amount: milestone ? round2(monthlyFixed * milestone.multiplier) : 0,
    },
  ];

  return {
    month: origination.month,
    periodStart: toDateString(origination.period_start),
    periodEnd: toDateString(origination.period_end),
    origination: {
      count: toNum(origination.origination_count),
      amount: originationAmount,
      targetPercent,
      bonusPercent: disbursementBonus,
    },
    delinquency: {
      rate: delinquencyRate,
      overdueAmount,
      portfolioOpenAmount,
      bonusPercent: riskBonus,
    },
    averageRate: { rate: averageRate, bonusPercent: rateBonus },
    commission: {
      total: round2(components.reduce((acc, c) => acc + c.amount, 0)),
      components,
    },
  };
}
