import { PermanenceMilestone } from './interfaces/performance-row.interface';

/** Utils puros do módulo de performance (sem dependência de Nest/Prisma). */

/** Arredonda para 2 casas — valores em R$. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Coluna `date` do Postgres para 'YYYY-MM-DD', sem inventar hora/timezone. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Mês de parceria. Conta por mês CALENDÁRIO: o mês de entrada é o mês 1,
 * independente do dia — início 15/11/2025 com referência em 29/07/2026 dá mês 9.
 * Coerente com o fixo mensal ser cheio e não pró-rata.
 *
 * As duas datas vêm de colunas/expressões `date` do Postgres (meia-noite UTC),
 * então a aritmética em UTC é exata. A referência é `CURRENT_DATE` do banco e
 * não `new Date()`, pra "hoje" ser o mesmo em todo o app (o dashboard já ancora
 * em CURRENT_DATE) e não depender do timezone do processo Node.
 */
export function partnershipMonthNumber(
  startedAt: Date,
  reference: Date,
): number {
  const years = reference.getUTCFullYear() - startedAt.getUTCFullYear();
  const months = reference.getUTCMonth() - startedAt.getUTCMonth();
  return years * 12 + months + 1;
}

/**
 * Próximo marco de permanência a alcançar. Comparação estrita: no mês exato do
 * marco ele já conta como atingido e o "próximo" passa a ser o seguinte —
 * espelha o estado "Atingido: mês >= marco" da trilha. Retorna null a partir do
 * último marco (depois do mês 18 não há mais próximo).
 *
 * `milestones` precisa vir ordenado por mês crescente.
 */
export function findNextMilestone(
  monthNumber: number,
  milestones: PermanenceMilestone[],
): PermanenceMilestone | null {
  return milestones.find((m) => m.month > monthNumber) ?? null;
}
