export function resolveQuoteInstallmentAmount(input: {
  simulationResult: unknown;
  linkedInstallmentAmount?: unknown;
}): number | null {
  const simulationResult = asRecord(input.simulationResult);

  return firstNumber(
    simulationResult?.installment_amount,
    simulationResult?.payment_amount,
    input.linkedInstallmentAmount,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}
