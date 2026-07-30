import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toNum } from '../common/query.util';
import { PartnerProfile } from './interfaces/partner-profile.interface';
import {
  EnrollmentRow,
  PermanenceMilestone,
} from './interfaces/performance-row.interface';
import { mapPartnerProfile } from './performance.mapper';

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Identidade, nível contratado e posição na trilha de permanência do parceiro
   * logado — insumo da barra de identidade e do ponto de partida do simulador.
   *
   * Não tem scope hierárquico: é dado próprio do viewer. O gate é estar inscrito
   * no programa; quem não está recebe 404 e a tela esconde a aba Desempenho.
   */
  async getPartnerProfile(
    userId: string,
    permissions: string[],
  ): Promise<PartnerProfile> {
    const enrollment = await this.findCurrentEnrollment(userId);
    if (!enrollment) throw new NotFoundException('partner_not_enrolled');

    // Parceria com início no futuro (cadastro antecipado pelo backoffice) ainda
    // não começou: mesma resposta de quem não está no programa, pra tela não
    // exibir "mês 0" nem liberar bônus de boas-vindas antes da hora.
    if (enrollment.started_at > enrollment.reference_date) {
      throw new NotFoundException('partner_not_enrolled');
    }

    const milestones = await this.findPermanenceMilestones();
    return mapPartnerProfile(userId, permissions, enrollment, milestones);
  }

  /**
   * Inscrição vigente do parceiro (linha com `effective_to IS NULL`), com os
   * termos do nível, o início da parceria e a data de referência do banco.
   *
   * Em SQL cru de propósito. O banco tem índice único PARCIAL
   * (`UNIQUE (user_id) WHERE effective_to IS NULL`) e a introspecção do Prisma
   * traduz isso como `@unique` global em `user_id`, modelando
   * `trigo_users.partner_enrollments` como relação 1:1. Não bate com o desenho:
   * o parceiro pode ter N linhas fechadas (histórico de promoção de nível) mais
   * uma aberta. `findUnique` por `user_id` ou navegar pela relação correria o
   * risco de devolver a linha FECHADA em vez da vigente — nível e meta errados,
   * sem erro nenhum. Todo `npm run db:pull` regenera esse `@unique`, então não é
   * um conserto pontual no schema.
   */
  private async findCurrentEnrollment(
    userId: string,
  ): Promise<EnrollmentRow | null> {
    const [row] = await this.prisma.$queryRaw<EnrollmentRow[]>`
      SELECT
        u.full_name,
        l.key                   AS level_key,
        l.name                  AS level_name,
        l.monthly_target_amount AS monthly_target,
        l.monthly_fixed_amount  AS monthly_fixed,
        (
          SELECT MIN(effective_from)
          FROM partner_enrollments
          WHERE user_id = e.user_id
        )                       AS started_at,
        CURRENT_DATE            AS reference_date
      FROM partner_enrollments e
      JOIN partner_levels l ON l.id = e.partner_level_id
      JOIN trigo_users u    ON u.id = e.user_id
      WHERE e.user_id = ${userId}::uuid
        AND e.effective_to IS NULL
        AND u.is_deleted = false
        AND u.is_active = true
    `;
    return row ?? null;
  }

  /**
   * Marcos da trilha de permanência (6/12/18), em ordem crescente.
   *
   * Sem cache de propósito: são 3 linhas, e o motivo de estarem no banco em vez
   * de constante é o backoffice poder mudar sem deploy — cachear em memória
   * traria de volta a necessidade de restart.
   */
  private async findPermanenceMilestones(): Promise<PermanenceMilestone[]> {
    const rows = await this.prisma.partner_permanence_milestones.findMany({
      orderBy: { month_number: 'asc' },
      select: { month_number: true, fixed_multiplier: true },
    });
    return rows.map((row) => ({
      month: row.month_number,
      multiplier: toNum(row.fixed_multiplier),
    }));
  }
}
