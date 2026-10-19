import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PrismaService } from '../prisma/prisma.service';

/** Status do parceiro que impedem login novo (mesma lista do Backoffice). */
const LOGIN_BLOCKING_STATUSES = ['suspenso', 'desligado'] as const;

export interface PartnerRestrictionActor {
  userId: string;
  permissions?: string[];
}

/**
 * Restrições de parceiro do módulo de Gestão de Parceiros (AUREA-590).
 *
 * O Backoffice é o dono do schema e quem restringe ou levanta: o Portal só LÊ
 * `partners` e `partner_restrictions` e aplica a mesma regra dele
 * (`PartnerService.isLoginBlocked` e `assertOriginationNotRestricted`).
 * `partners.user_id` é o mesmo valor de `trigo_users.id`; quem não é parceiro
 * não tem linha e nunca é afetado.
 *
 * Se a consulta falhar, recusa (503) em vez de liberar: deixar passar reabre
 * o bug que este serviço corrige.
 */
@Injectable()
export class PartnerRestrictionsService {
  private readonly logger = new Logger(PartnerRestrictionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parceiro suspenso, desligado ou com restrição de `acesso` ativa não faz
   * login nem renova a sessão. `route` identifica o ponto no log.
   */
  async isLoginBlocked(userId: string, route: string): Promise<boolean> {
    const blocked = await this.exists(
      Prisma.sql`
        SELECT p.id
        FROM partners p
        LEFT JOIN partner_restrictions pr
          ON pr.partner_id = p.id
         AND pr.scope = 'acesso'
         AND pr.lifted_at IS NULL
        WHERE p.user_id = ${userId}::uuid
          AND (
            p.current_status IN (${Prisma.join(LOGIN_BLOCKING_STATUSES)})
            OR pr.id IS NOT NULL
          )
        LIMIT 1
      `,
      route,
    );

    if (blocked) this.logBlocked('acesso', userId, route);
    return blocked;
  }

  /**
   * Restrição de `originacao` ativa impede iniciar e enviar proposta.
   * `ROLE_ADMIN` não é barrado, igual ao Backoffice.
   */
  async isOriginationRestricted(
    actor: PartnerRestrictionActor,
    route: string,
  ): Promise<boolean> {
    if (actor.permissions?.includes(PermissionKey.ROLE_ADMIN)) return false;

    const restricted = await this.exists(
      Prisma.sql`
        SELECT pr.id
        FROM partner_restrictions pr
        JOIN partners p ON p.id = pr.partner_id
        WHERE p.user_id = ${actor.userId}::uuid
          AND pr.scope = 'originacao'
          AND pr.lifted_at IS NULL
        LIMIT 1
      `,
      route,
    );

    if (restricted) this.logBlocked('originacao', actor.userId, route);
    return restricted;
  }

  private async exists(query: Prisma.Sql, route: string): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(query);
      return rows.length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missingTable = /relation .* does not exist/i.test(message);
      this.logger.error(
        JSON.stringify({
          event: 'partner_restriction_check_failed',
          route,
          // Tabela inexistente é erro de ordem de deploy: o Portal subiu antes
          // das migrations do módulo de parceiros do Backoffice.
          missingTable,
          message,
        }),
      );
      throw new ServiceUnavailableException(
        'Não foi possível verificar as restrições do parceiro. Tente novamente em instantes.',
      );
    }
  }

  private logBlocked(
    scope: 'acesso' | 'originacao',
    userId: string,
    route: string,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'partner_restriction_blocked',
        scope,
        userId,
        route,
      }),
    );
  }
}
