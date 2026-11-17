/**
 * Regra da data da 1ª parcela das propostas do Portal (AUREA-721): dia de 1 a
 * 20 do mês, entre `MIN` e `MAX` dias depois de hoje (limites inclusivos).
 * Renegociação e `form-responses` não passam por aqui.
 */
export const FIRST_INSTALLMENT_MIN_DAYS = 20;
export const FIRST_INSTALLMENT_MAX_DAYS = 45;
export const FIRST_INSTALLMENT_MAX_DAY_OF_MONTH = 20;

/** "Hoje" do negócio: o parceiro e a Celcoin contam o dia em Brasília. */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const BUSINESS_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * A data de hoje em Brasília, como dia de calendário à meia-noite UTC (o mesmo
 * formato de `parseDateOnly`). `new Date()` em UTC viraria o dia às 21h e faria
 * o backend contar um dia a mais que o calendário do parceiro.
 */
export function businessToday(now: Date = new Date()): Date {
  const [year, month, day] = BUSINESS_DATE_FORMAT.format(now)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function formatBrDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Janela de datas permitidas a partir de `today`. */
export function firstInstallmentWindow(today: Date): {
  earliest: Date;
  latest: Date;
} {
  return {
    earliest: addUtcDays(today, FIRST_INSTALLMENT_MIN_DAYS),
    latest: addUtcDays(today, FIRST_INSTALLMENT_MAX_DAYS),
  };
}

/** Mensagem de erro se a data não cumpre a regra nova; `null` se cumpre. */
export function firstInstallmentRuleViolation(
  dueDate: Date,
  today: Date,
): string | null {
  const { earliest, latest } = firstInstallmentWindow(today);
  const inWindow =
    dueDate.getTime() >= earliest.getTime() &&
    dueDate.getTime() <= latest.getTime();
  const dayAllowed =
    dueDate.getUTCDate() >= 1 &&
    dueDate.getUTCDate() <= FIRST_INSTALLMENT_MAX_DAY_OF_MONTH;

  if (inWindow && dayAllowed) return null;
  return `A primeira parcela deve cair entre ${formatBrDate(earliest)} e ${formatBrDate(latest)}, em um dia de 1 a ${FIRST_INSTALLMENT_MAX_DAY_OF_MONTH} do mês.`;
}
