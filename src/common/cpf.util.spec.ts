import { cpfDigits, isValidCpf } from './cpf.util';

describe('cpfDigits', () => {
  it('remove máscara', () => {
    expect(cpfDigits('529.982.247-25')).toBe('52998224725');
  });
});

describe('isValidCpf', () => {
  it('aceita CPFs conhecidos, com ou sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('39053344705')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });

  it('rejeita incompleto, DV errado e sequências iguais', () => {
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf('123.456.789')).toBe(false);
    expect(isValidCpf('123.456.789-00')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('000.000.000-00')).toBe(false);
  });
});
