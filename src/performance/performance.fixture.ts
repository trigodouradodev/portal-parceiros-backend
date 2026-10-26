import { PerformanceRow } from './interfaces/performance-row.interface';

export const PERFORMANCE_USER_ID = '11111111-1111-4111-8111-111111111111';

export function performanceRow(
  overrides: Partial<PerformanceRow> = {},
): PerformanceRow {
  return {
    requested_month: '2026-09',
    id_consultor: PERFORMANCE_USER_ID,
    nivel: 'Bronze',
    valor_originado_mes: '110000.00',
    meta_originacao_mensal: '100000.00',
    pct_meta_atingido: '110.00',
    taxa_media_bonus: '9.50',
    taxa_media_simples: '9.50',
    taxa_media_ponderada: '9.70',
    pct_inadimplencia_bonus: '3.33',
    pct_inadimplencia: '6.00',
    valor_inadimplencia: '6000.00',
    valor_carteira_ativa: '100000.00',
    valor_inadimplencia_desconsiderada: '3000.00',
    valor_carteira_desconsiderada: '10000.00',
    valor_reembolso_mes: null,
    valor_fixo_mensal: '4000.00',
    valor_bonus_desembolso: '400.00',
    valor_bonus_taxa: '400.00',
    valor_bonus_risco: '1320.00',
    valor_acordos: '0.00',
    valor_bonus_producao: null,
    valor_bonus_reembolso: null,
    valor_remuneracao_total: '6120.00',
    ...overrides,
  };
}
