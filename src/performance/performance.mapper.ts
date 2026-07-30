import { toNum } from '../common/query.util';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  EnrollmentRow,
  PermanenceMilestone,
} from './interfaces/performance-row.interface';
import { PartnerProfile } from './interfaces/partner-profile.interface';
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
