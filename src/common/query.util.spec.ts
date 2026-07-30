import { Prisma } from '@prisma/client';
import { toNum } from './query.util';

describe('toNum', () => {
  it('converte Decimal do Prisma, que é o tipo das colunas numeric', () => {
    expect(toNum(new Prisma.Decimal('1250.50'))).toBe(1250.5);
  });

  // Nenhum teste consegue distinguir o ramo explícito de bigint do fallback:
  // `Number(42n)` já devolve 42. O `typeof value === 'bigint'` do util é
  // redundante — inofensivo e documenta a origem do valor (COUNT(*)), mas
  // removê-lo não muda resultado nenhum.
  it('converte bigint, que é o tipo devolvido por COUNT(*)', () => {
    expect(toNum(42n)).toBe(42);
  });

  it('converte string, que alguns agregados devolvem', () => {
    expect(toNum('1500.00')).toBe(1500);
  });

  it('mantém number intacto', () => {
    expect(toNum(3.14)).toBe(3.14);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('devolve 0 para %s — agregado sobre conjunto vazio', (_label, value) => {
    expect(toNum(value)).toBe(0);
  });

  it('preserva o zero em vez de confundi-lo com ausência', () => {
    expect(toNum(0)).toBe(0);
    expect(toNum('0')).toBe(0);
    expect(toNum(new Prisma.Decimal(0))).toBe(0);
  });

  it('preserva negativos', () => {
    expect(toNum('-250.75')).toBe(-250.75);
  });

  it('converte bigint grande sem estourar a precisão de Number', () => {
    expect(toNum(9007199254740991n)).toBe(9007199254740991);
  });

  it('devolve NaN para valor não numérico, em vez de mascarar com 0', () => {
    // Mascarar com 0 esconderia um erro de mapeamento de coluna; NaN propaga e
    // aparece no resultado.
    expect(toNum('não é número')).toBeNaN();
  });
});
