import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PerformanceMonthRow,
  PerformanceRow,
  PerformancePersonRow,
  PerformanceTeamRow,
} from './interfaces/performance-row.interface';

/** Lê os snapshots calculados pelo BI pela conexão Prisma existente. */
@Injectable()
export class PerformanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMonths(userId: string | string[]): Promise<PerformanceMonthRow[]> {
    return this.prisma.$queryRaw<PerformanceMonthRow[]>`
      SELECT DISTINCT
        to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS current_month,
        to_char(s.data_competencia, 'YYYY-MM') AS month
      FROM (SELECT 1) reference
      LEFT JOIN analytics.tbl_snapshot_remuneracao_parceiro_mes s
        ON s.id_consultor = ANY(${Array.isArray(userId) ? userId : [userId]}::uuid[])
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
        to_char(s.data_snapshot_parcelas, 'YYYY-MM-DD') AS data_snapshot_parcelas,
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
      LEFT JOIN analytics.tbl_snapshot_remuneracao_parceiro_mes s
        ON s.id_consultor = ${userId}::uuid
       AND s.data_competencia = (reference.requested_month || '-01')::date
    `;
    if (rows.length > 1) throw new Error('duplicate_performance_rows');
    return rows[0];
  }

  async findPartners(
    userIds: string[],
    month?: string,
  ): Promise<PerformancePersonRow[]> {
    return this.prisma.$queryRaw<PerformancePersonRow[]>`
      SELECT DISTINCT u.id, u.full_name AS name
      FROM analytics.tbl_snapshot_remuneracao_parceiro_mes s
      JOIN public.trigo_users u ON u.id = s.id_consultor AND u.is_deleted = false
      WHERE s.id_consultor = ANY(${userIds}::uuid[])
        AND s.data_competencia = (COALESCE(${month ?? null}::text,
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')) || '-01')::date
      ORDER BY name, u.id
    `;
  }

  async findTeam(
    partnerId: string,
    hierarchyIds: string[],
    month?: string,
  ): Promise<PerformancePersonRow[]> {
    return this.prisma.$queryRaw<PerformancePersonRow[]>`
      WITH reference AS (
        SELECT (COALESCE(${month ?? null}::text,
          to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')) || '-01')::date AS month
      ), members AS (
        SELECT unnest(${hierarchyIds}::uuid[]) AS id
        UNION
        SELECT e.id_pessoa_equipe FROM analytics.tbl_snapshot_remuneracao_equipe_mes e
        CROSS JOIN reference
        WHERE e.id_parceiro = ${partnerId}::uuid AND e.data_competencia = reference.month
      )
      SELECT u.id, u.full_name AS name
      FROM members m JOIN public.trigo_users u ON u.id = m.id AND u.is_deleted = false
      ORDER BY name, u.id
    `;
  }

  async findIndividual(
    partnerId: string,
    memberId: string,
    month: string,
  ): Promise<PerformanceTeamRow | undefined> {
    const rows = await this.prisma.$queryRaw<PerformanceTeamRow[]>`
      SELECT to_char(e.data_competencia, 'YYYY-MM') AS requested_month,
        e.id_pessoa_equipe, e.valor_originado, e.qtd_contratos, e.taxa_media,
        e.valor_inadimplencia, e.valor_carteira_ativa,
        e.valor_inadimplencia_desconsiderada, e.valor_reembolso_mes,
        to_char(e.data_snapshot_parcelas, 'YYYY-MM-DD') AS data_snapshot_parcelas
      FROM analytics.tbl_snapshot_remuneracao_equipe_mes e
      WHERE e.id_parceiro = ${partnerId}::uuid
        AND e.id_pessoa_equipe = ${memberId}::uuid
        AND e.data_competencia = (${month}::text || '-01')::date
    `;
    if (rows.length > 1) throw new Error('duplicate_performance_team_rows');
    return rows[0];
  }
}
