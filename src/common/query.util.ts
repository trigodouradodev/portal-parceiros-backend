/**
 * Utils puros compartilhados pelos módulos que leem via `$queryRaw`
 * (sem dependência de Nest/Prisma em runtime).
 */

/**
 * Coerção robusta de valores numéricos vindos do `$queryRaw`.
 *
 * O driver devolve tipos diferentes conforme a coluna: `Prisma.Decimal` para
 * `numeric`, `bigint` para `COUNT(*)`, `string` em alguns agregados. Null/
 * undefined viram 0 para os casos de agregado sobre conjunto vazio.
 */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  return Number(value);
}
