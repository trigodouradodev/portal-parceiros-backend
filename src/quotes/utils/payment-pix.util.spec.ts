import { BadRequestException } from '@nestjs/common';
import { PaymentPixType } from '../enums/quote-financial.enum';
import { normalizePaymentPixCode } from './payment-pix.util';

describe('normalizePaymentPixCode', () => {
  it('persiste CPF só com dígitos', () => {
    expect(
      normalizePaymentPixCode(PaymentPixType.CPF, '529.982.247-25'),
    ).toBe('52998224725');
  });

  it('recusa CPF inválido', () => {
    expect(() =>
      normalizePaymentPixCode(PaymentPixType.CPF, '111.111.111-11'),
    ).toThrow(BadRequestException);
  });

  it('grava celular com DDI 55', () => {
    expect(
      normalizePaymentPixCode(PaymentPixType.TELEPHONE, '(11) 99123-4567'),
    ).toBe('+5511991234567');
    expect(
      normalizePaymentPixCode(PaymentPixType.TELEPHONE, '+5511991234567'),
    ).toBe('+5511991234567');
  });

  it('recusa telefone que não é celular', () => {
    expect(() =>
      normalizePaymentPixCode(PaymentPixType.TELEPHONE, '1133334444'),
    ).toThrow(BadRequestException);
  });

  it('normaliza e-mail em minúsculas', () => {
    expect(
      normalizePaymentPixCode(PaymentPixType.EMAIL, ' Cliente@Exemplo.COM '),
    ).toBe('cliente@exemplo.com');
  });

  it('aceita chave aleatória UUID e grava em minúsculas', () => {
    expect(
      normalizePaymentPixCode(
        PaymentPixType.RANDOM_KEY,
        '4CA519EF-0CCC-4C41-B58B-C88F1F47D8AB',
      ),
    ).toBe('4ca519ef-0ccc-4c41-b58b-c88f1f47d8ab');
  });

  it('recusa chave aleatória fora do formato UUID', () => {
    expect(() =>
      normalizePaymentPixCode(PaymentPixType.RANDOM_KEY, 'abc123'),
    ).toThrow(BadRequestException);
  });
});
