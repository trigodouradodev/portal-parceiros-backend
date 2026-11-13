import { BadRequestException } from '@nestjs/common';
import { OverdueReason } from './overdue-reason.enum';

const REASONS = new Set<string>(Object.values(OverdueReason));

const RESULTS_REQUIRING_REASON = new Set([
  'no_response',
  'payment_promise',
  'dispute',
  'renegotiation',
  'no_forecast',
  'not_located',
  'will_pay_on_date',
  'no_return',
  'requested_extension',
  'wants_renegotiation',
  // Resultados equivalentes do Follow-up legado; tipos de contato não entram.
  'promise_to_pay',
  'no_answer',
]);

export function requiresOverdueReason(result: unknown): boolean {
  return typeof result === 'string' && RESULTS_REQUIRING_REASON.has(result);
}

/** Compartilhado pelo registro de tarefa e pelos dois modelos de Follow-up. */
export function validateOverdueReason(
  result: unknown,
  reason: unknown,
): OverdueReason | null {
  if (!requiresOverdueReason(result)) {
    if (reason !== undefined && reason !== null) {
      throw new BadRequestException('overdue_reason_not_allowed');
    }
    return null;
  }
  if (reason === undefined || reason === null || reason === '') {
    throw new BadRequestException('overdue_reason_required');
  }
  if (typeof reason !== 'string' || !REASONS.has(reason)) {
    throw new BadRequestException('overdue_reason_invalid');
  }
  return reason as OverdueReason;
}
