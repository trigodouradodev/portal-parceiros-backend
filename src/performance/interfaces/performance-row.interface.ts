import { Prisma } from '@prisma/client';

/** Tipos de numeric lidos por $queryRaw, preservando NULL. */
export type PerformanceNumeric = Prisma.Decimal | string | number | null;

export interface PerformanceMonthRow {
  current_month: string;
  month: string | null;
}

/** LEFT JOIN mantém requested_month mesmo quando o parceiro não tem dados. */
export interface PerformanceRow {
  requested_month: string;
  id_consultor: string | null;
  nivel: string | null;
  data_snapshot_parcelas?: string | null;
  valor_originado_mes: PerformanceNumeric;
  meta_originacao_mensal: PerformanceNumeric;
  pct_meta_atingido: PerformanceNumeric;
  taxa_media_bonus: PerformanceNumeric;
  taxa_media_simples: PerformanceNumeric;
  taxa_media_ponderada: PerformanceNumeric;
  pct_inadimplencia_bonus: PerformanceNumeric;
  pct_inadimplencia: PerformanceNumeric;
  valor_inadimplencia: PerformanceNumeric;
  valor_carteira_ativa: PerformanceNumeric;
  valor_inadimplencia_desconsiderada: PerformanceNumeric;
  valor_carteira_desconsiderada: PerformanceNumeric;
  valor_reembolso_mes: PerformanceNumeric;
  valor_fixo_mensal: PerformanceNumeric;
  valor_bonus_desembolso: PerformanceNumeric;
  valor_bonus_taxa: PerformanceNumeric;
  valor_bonus_risco: PerformanceNumeric;
  valor_acordos: PerformanceNumeric;
  valor_bonus_producao: PerformanceNumeric;
  valor_bonus_reembolso: PerformanceNumeric;
  valor_remuneracao_total: PerformanceNumeric;
}

export interface PerformancePersonRow {
  id: string;
  name: string;
}

export interface PerformanceTeamRow {
  requested_month: string;
  id_pessoa_equipe: string | null;
  valor_originado: PerformanceNumeric;
  qtd_contratos: number | null;
  taxa_media: PerformanceNumeric;
  valor_inadimplencia: PerformanceNumeric;
  valor_carteira_ativa: PerformanceNumeric;
  valor_inadimplencia_desconsiderada: PerformanceNumeric;
  valor_reembolso_mes: PerformanceNumeric;
  data_snapshot_parcelas: string | null;
}
