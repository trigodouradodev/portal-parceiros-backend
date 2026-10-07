import { normalizeBrazilianPhone } from './phone.util';

describe('normalizeBrazilianPhone', () => {
  it.each([
    '73987654321',
    '(73) 98765-4321',
    '+5573987654321',
    '5573987654321',
    '+55 (73) 98765-4321',
  ])('normaliza %s sem duplicar o DDI', (value) => {
    expect(normalizeBrazilianPhone(value)).toBe('+5573987654321');
  });

  it.each(['55987654321', '(55) 98765-4321', '+5555987654321'])(
    'preserva o DDD 55: %s',
    (value) => {
      expect(normalizeBrazilianPhone(value)).toBe('+5555987654321');
    },
  );

  it.each(['7332128997', '+557332128997'])('aceita fixo: %s', (value) => {
    expect(normalizeBrazilianPhone(value)).toBe('+557332128997');
  });

  it.each(['12345', '173987654321', '+15573987654321', '557398765432100'])(
    'rejeita tamanho ou DDI inválido: %s',
    (value) => {
      expect(() => normalizeBrazilianPhone(value)).toThrow('Celular inválido.');
    },
  );
});
