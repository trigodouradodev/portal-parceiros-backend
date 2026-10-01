import { BadRequestException } from '@nestjs/common';

export function cnpjDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCnpj(value: string): boolean {
  const digits = cnpjDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculateDigit = (base: string, factors: number[]): number => {
    const sum = factors.reduce(
      (total, factor, index) => total + Number(base[index]) * factor,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(
    digits.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const second = calculateDigit(
    digits.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return first === Number(digits[12]) && second === Number(digits[13]);
}

export function normalizeCnpj(value: string): string {
  if (!isValidCnpj(value)) {
    throw new BadRequestException('CNPJ inválido.');
  }
  return cnpjDigits(value);
}
