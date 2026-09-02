import { cnpjDigits, isValidCnpj, normalizeCnpj } from './cnpj.util';

describe('CNPJ utilities', () => {
  it('valida e normaliza CNPJ com ou sem máscara', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(cnpjDigits('11.222.333/0001-81')).toBe('11222333000181');
  });

  it.each(['', '11.222.333/0001-00', '11.111.111/1111-11'])(
    'rejeita CNPJ inválido: %s',
    (value) => {
      expect(isValidCnpj(value)).toBe(false);
      expect(() => normalizeCnpj(value)).toThrow('CNPJ inválido.');
    },
  );
});
