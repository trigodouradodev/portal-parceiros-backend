import { toNum } from '../common/query.util';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  BonusBandRow,
  EnrollmentRow,
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
  findNextMilestone,
  partnershipMonthNumber,
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
