import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PrismaService } from '../prisma/prisma.service';

const SIMULATION_BLOCKING_SEGMENTS = [
  'recent',
  'broken_promise',
  'fpd',
  'early',
] as const;

const CREATE_QUOTE_BLOCKING_SEGMENTS = [
  ...SIMULATION_BLOCKING_SEGMENTS,
  'mid',
  'post_letter',
  'pre_default',
] as const;

const PARTNER_ROLES = [
  PermissionKey.ROLE_CONSULTANT,
  PermissionKey.ROLE_COLLECTION_AGENT,
] as const;

const QUOTE_ACTIVITY_GATES_ACTIVATION_CONFIG_KEY =
  'QUOTE_ACTIVITY_GATES_ACTIVATION_AT';
// 01/10/2026 00:00 em America/Sao_Paulo, representado como instante UTC.
const DEFAULT_QUOTE_ACTIVITY_GATES_ACTIVATION_AT = '2026-10-01T03:00:00.000Z';
const DEFAULT_QUOTE_ACTIVITY_GATES_ACTIVATION_TIMESTAMP = Date.parse(
  DEFAULT_QUOTE_ACTIVITY_GATES_ACTIVATION_AT,
);
const ISO_TIMESTAMP_WITH_TIME_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i;

function parseActivationTimestamp(value?: string): number {
  if (!value || !ISO_TIMESTAMP_WITH_TIME_ZONE.test(value)) {
    return DEFAULT_QUOTE_ACTIVITY_GATES_ACTIVATION_TIMESTAMP;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? DEFAULT_QUOTE_ACTIVITY_GATES_ACTIVATION_TIMESTAMP
    : timestamp;
}

export interface QuoteActivityActor {
  userId: string;
  permissions: string[];
}

export interface QuoteActivityPermissions {
  canSimulateQuote: boolean;
  canCreateQuote: boolean;
}

/**
 * Determina se ações pendentes de cobrança bloqueiam ações comerciais.
 * O rollout é opt-in via a permissão QUOTE_ACTIVITY_GATES.
 */
@Injectable()
export class QuoteActivityPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissions(
    actor: QuoteActivityActor,
  ): Promise<QuoteActivityPermissions> {
    const permissions = new Set(actor.permissions);
    const isPartner = PARTNER_ROLES.some((role) => permissions.has(role));
    const isEnabledForRollout = permissions.has(
      PermissionKey.QUOTE_ACTIVITY_GATES,
    );

    if (!isPartner || !isEnabledForRollout) {
      return { canSimulateQuote: true, canCreateQuote: true };
    }

    const activationConfig = await this.prisma.system_configs.findUnique({
      where: { key: QUOTE_ACTIVITY_GATES_ACTIVATION_CONFIG_KEY },
      select: { value: true },
    });
    const activationTimestamp = parseActivationTimestamp(
      activationConfig?.value,
    );

    if (Date.now() < activationTimestamp) {
      return { canSimulateQuote: true, canCreateQuote: true };
    }

    const tasks = await this.prisma.$queryRaw<{ segment_code: string }[]>(
      Prisma.sql`
        SELECT segment_code
        FROM activity_tasks
        WHERE assigned_to = ${actor.userId}::uuid
          AND status = 'pending'
          AND expire_date <= CURRENT_DATE
          AND segment_code IN (${Prisma.join(CREATE_QUOTE_BLOCKING_SEGMENTS)})
      `,
    );
    const blockingSegments = new Set(tasks.map((task) => task.segment_code));

    return {
      canSimulateQuote: !SIMULATION_BLOCKING_SEGMENTS.some((segment) =>
        blockingSegments.has(segment),
      ),
      canCreateQuote: blockingSegments.size === 0,
    };
  }
}
