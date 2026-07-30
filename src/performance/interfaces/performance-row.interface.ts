import { Prisma } from '@prisma/client';

/**
 * Shapes brutos (snake_case) retornados pelas queries do PerformanceService.
 * Não são contratos de API — são o resultado direto do Postgres.
 */

/** Linha de `findCurrentEnrollment`: inscrição vigente + termos do nível. */
export interface EnrollmentRow {
  full_name: string;
  level_key: string;
  level_name: string;
  monthly_target: Prisma.Decimal | string | number;
  monthly_fixed: Prisma.Decimal | string | number;
  /** MIN(effective_from) do parceiro — não se move quando ele muda de nível. */
  started_at: Date;
  /** CURRENT_DATE do banco: "hoje" na mesma âncora usada pelo resto do app. */
  reference_date: Date;
}

/** Marco da trilha de permanência, já coagido para número. */
export interface PermanenceMilestone {
  month: number;
  multiplier: number;
}

/** Colunas lidas de `partner_levels` para a tabela comparativa de níveis. */
export interface ProgramLevelRow {
  key: string;
  name: string;
  monthly_target_amount: Prisma.Decimal | string | number;
  monthly_fixed_amount: Prisma.Decimal | string | number;
}

/**
 * Linha de `findMonthOrigination`: contratos desembolsados no mês pelo próprio
 * parceiro, mais o período de referência do banco.
 */
export interface OriginationRow {
  month: string;
  period_start: Date;
  period_end: Date;
  origination_count: bigint | number;
  origination_amount: Prisma.Decimal | string | number;
  /** Fração (ex.: 0.0980 = 9,8%). null quando não houve originação no mês. */
  avg_rate: Prisma.Decimal | string | number | null;
}

/** Linha de `findPortfolioDelinquency`: saldos vencido e em aberto (R$). */
export interface DelinquencyRow {
  overdue_amount: Prisma.Decimal | string | number;
  open_amount: Prisma.Decimal | string | number;
}

/** Colunas lidas de `partner_bonus_bands`. */
export interface BonusBandRow {
  pillar: string;
  min_value: Prisma.Decimal | string | number;
  min_inclusive: boolean;
  max_value: Prisma.Decimal | string | number | null;
  max_inclusive: boolean;
  bonus_percent: Prisma.Decimal | string | number;
}
