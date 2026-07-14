/** Utils puros do módulo de activities (sem dependência de Nest/Prisma). */

/** Coerção robusta de valores numéricos do $queryRaw (Decimal/string/bigint). */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  return Number(value);
}

/** Mantém só os dígitos (CPF/telefone digitados à mão, com ou sem máscara). */
export function onlyDigits(value: string | undefined): string {
  return value ? value.replace(/\D/g, '') : '';
}

/** Dias inteiros de atraso (UTC, consistente com CURRENT_DATE - due_date do banco). */
export function daysOverdue(dueDate: Date): number {
  const MS = 86400000;
  const due = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate(),
  );
  const now = new Date();
  const ref = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((ref - due) / MS);
}
