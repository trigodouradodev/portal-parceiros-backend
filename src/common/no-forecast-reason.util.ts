import { BadRequestException } from '@nestjs/common';
import { NoForecastReason } from './no-forecast-reason.enum';

const REASONS = new Set<string>(Object.values(NoForecastReason));

/** Compartilhado pelo registro de tarefa e pelos dois modelos de Follow-up. */
export function validateNoForecastReason(
  result: unknown,
  reason: unknown,
): NoForecastReason | null {
  if (result !== 'no_forecast') {
    if (reason !== undefined && reason !== null) {
      throw new BadRequestException('no_forecast_reason_not_allowed');
    }
    return null;
  }
  if (reason === undefined || reason === null || reason === '') {
    throw new BadRequestException('no_forecast_reason_required');
  }
  if (typeof reason !== 'string' || !REASONS.has(reason)) {
    throw new BadRequestException('no_forecast_reason_invalid');
  }
  return reason as NoForecastReason;
}
