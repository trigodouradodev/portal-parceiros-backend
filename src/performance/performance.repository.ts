import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PerformanceMonthRow,
  PerformanceRow,
} from './interfaces/performance-row.interface';

/** Consulta o schema analytics pela mesma conexão Prisma usada pelo portal. */
@Injectable()
export class PerformanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMonths(userId: string): Promise<PerformanceMonthRow[]> {
    return this.prisma.$queryRaw<PerformanceMonthRow[]>`
      SELECT DISTINCT
        to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS current_month,
        to_char(s.data_competencia, 'YYYY-MM') AS month
      FROM (SELECT 1) reference
      LEFT JOIN analytics.vw_metric_remuneracao_parceiro_mes s
        ON s.id_consultor = ${userId}::uuid
      ORDER BY month DESC NULLS LAST
    `;
  }

  async findPerformance(
    userId: string,
    month?: string,
  ): Promise<PerformanceRow | undefined> {
    const rows = await this.prisma.$queryRaw<PerformanceRow[]>`
      WITH reference AS (
        SELECT COALESCE(
          ${month ?? null}::text,
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
        ) AS requested_month
      )
      SELECT
        reference.requested_month,
        s.id_consultor,
        s.nivel,
        s.valor_originado_mes,
        s.meta_originacao_mensal,
        s.pct_meta_atingido,
        s.taxa_media_bonus,
        s.taxa_media_simples,
        s.taxa_media_ponderada,
        s.pct_inadimplencia_bonus,
        s.pct_inadimplencia,
        s.valor_inadimplencia,
        s.valor_carteira_ativa,
        s.valor_inadimplencia_desconsiderada,
        s.valor_carteira_desconsiderada,
        s.valor_reembolso_mes,
        s.valor_fixo_mensal,
        s.valor_bonus_desembolso,
        s.valor_bonus_taxa,
        s.valor_bonus_risco,
        s.valor_acordos,
        s.valor_bonus_producao,
        s.valor_bonus_reembolso,
        s.valor_remuneracao_total
      FROM reference
      LEFT JOIN analytics.vw_metric_remuneracao_parceiro_mes s
        ON s.id_consultor = ${userId}::uuid
       AND s.data_competencia = (reference.requested_month || '-01')::date
    `;
    if (rows.length > 1) throw new Error('duplicate_performance_rows');
    return rows[0];
  }
}
