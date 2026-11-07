// Mesmo calendário de carência usado pelo activity-engine: finais de semana e
// feriados nacionais fixos. Recebe datas civis, não instantes do relógio local.
export const COLLECTION_FIXED_HOLIDAYS = [
  '01-01',
  '04-21',
  '05-01',
  '09-07',
  '10-12',
  '11-02',
  '11-15',
  '11-20',
  '12-25',
] as const;
const FIXED_NATIONAL_HOLIDAYS = new Set<string>(COLLECTION_FIXED_HOLIDAYS);

export function addCollectionDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function effectiveCollectionDueDate(dueDate: string): string {
  let date = dueDate;
  for (;;) {
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (
      dayOfWeek !== 0 &&
      dayOfWeek !== 6 &&
      !FIXED_NATIONAL_HOLIDAYS.has(date.slice(5))
    )
      return date;
    date = addCollectionDays(date, 1);
  }
}
