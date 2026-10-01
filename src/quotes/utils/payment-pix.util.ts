import { BadRequestException } from '@nestjs/common';
import { cpfDigits, isValidCpf } from '../../common/cpf.util';
import { PaymentPixType } from '../enums/quote-financial.enum';

/** Chave aleatória PIX (EVP): UUID no padrão BACEN. */
export const PIX_RANDOM_KEY_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function localPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

/** Valida e normaliza a chave PIX para o formato persistido no backoffice. */
export function normalizePaymentPixCode(
  type: PaymentPixType,
  code: string,
): string {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new BadRequestException('Chave PIX é obrigatória.');
  }

  switch (type) {
    case PaymentPixType.CPF: {
      const digits = cpfDigits(trimmed);
      if (digits.length !== 11) {
        throw new BadRequestException(
          'Chave PIX CPF deve conter apenas números e ter 11 dígitos.',
        );
      }
      if (!isValidCpf(digits)) {
        throw new BadRequestException('Chave PIX CPF inválida.');
      }
      return digits;
    }
    case PaymentPixType.TELEPHONE: {
      const local = localPhoneDigits(trimmed);
      if (local.length !== 11 || local[2] !== '9') {
        throw new BadRequestException(
          'Chave PIX celular deve estar no formato (DD) 9XXXX-XXXX.',
        );
      }
      return `+55${local}`;
    }
    case PaymentPixType.EMAIL: {
      const email = trimmed.toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        throw new BadRequestException('Chave PIX EMAIL inválida.');
      }
      return email;
    }
    case PaymentPixType.RANDOM_KEY: {
      if (!PIX_RANDOM_KEY_UUID_REGEX.test(trimmed)) {
        throw new BadRequestException(
          'Chave PIX aleatória inválida. Informe um UUID no formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.',
        );
      }
      return trimmed.toLowerCase();
    }
    default:
      throw new BadRequestException('Tipo de chave PIX inválida.');
  }
}
