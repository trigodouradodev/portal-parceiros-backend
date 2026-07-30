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
