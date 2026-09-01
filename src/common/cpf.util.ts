import { BadRequestException } from '@nestjs/common';

/**
 * Validação de CPF pelos dígitos verificadores (rejeita sequências iguais).
 * Espelha a regra do front (`isValidCpf`). O fluxo novo do portal é mais
 * restritivo que o legado do trigo-connector, que valida apenas a estrutura.
 */
export function cpfDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const digits = cpfDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (base: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcDigit(digits.slice(0, 9), 10);
  const d2 = calcDigit(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

/** Normaliza e valida CPF para a representação canônica usada em `parties`. */
export function normalizeCpf(value: string): string {
  if (!isValidCpf(value)) {
    throw new BadRequestException('CPF inválido.');
  }

  return cpfDigits(value);
}
