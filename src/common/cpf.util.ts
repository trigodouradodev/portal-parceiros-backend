import { BadRequestException } from '@nestjs/common';

/** Normaliza CPF para a representação canônica usada em `parties`: 11 dígitos. */
export function normalizeCpf(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    throw new BadRequestException('CPF inválido.');
  }

  return digits;
}
