export const QUOTE_ACTIVITY_GATES_BLOCKING_WINDOW_KEY =
  'QUOTE_ACTIVITY_GATES_BLOCKING_WINDOW';

const DEFAULT_WINDOW = { start: 13 * 60, end: 0 };
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const saoPauloClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function timeInMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = TIME_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function blockingWindow(value?: string): { start: number; end: number } {
  if (!value) return DEFAULT_WINDOW;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return DEFAULT_WINDOW;
    }
    const window = parsed as Record<string, unknown>;
    const start = timeInMinutes(window.start);
    const end = timeInMinutes(window.end);
    return start === null || end === null ? DEFAULT_WINDOW : { start, end };
  } catch {
    return DEFAULT_WINDOW;
  }
}

/** Início inclusivo e fim exclusivo em São Paulo. Horários iguais cobrem o dia inteiro. */
export function isQuoteActivityBlockingTime(
  now: number,
  value?: string,
): boolean {
  const { start, end } = blockingWindow(value);
  const [hour, minute] = saoPauloClock.format(now).split(':').map(Number);
  const current = hour * 60 + minute;
  if (start === end) return true;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}
