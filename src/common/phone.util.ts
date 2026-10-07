import { BadRequestException } from '@nestjs/common';

/** Telefone BR persistido com +55, preservando DDD 55 em números nacionais. */
export function normalizeBrazilianPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const national =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;
  if (!/^\d{10,11}$/.test(national)) {
    throw new BadRequestException('Celular inválido.');
  }
  return `+55${national}`;
}
