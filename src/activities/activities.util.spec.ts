import { daysOverdue, onlyDigits } from './activities.util';

describe('onlyDigits', () => {
  it('remove a máscara de CPF', () => {
    expect(onlyDigits('123.456.789-09')).toBe('12345678909');
  });

  it('remove a máscara de telefone, inclusive parênteses e espaços', () => {
    expect(onlyDigits('(11) 98765-4321')).toBe('11987654321');
  });

  it('devolve string vazia para undefined', () => {
    expect(onlyDigits(undefined)).toBe('');
  });

  it('devolve string vazia para string vazia', () => {
    expect(onlyDigits('')).toBe('');
  });

  it('devolve string vazia quando não há nenhum dígito', () => {
    expect(onlyDigits('sem numero')).toBe('');
  });

  it('não altera valor que já vem só com dígitos', () => {
    expect(onlyDigits('12345678909')).toBe('12345678909');
  });
});

describe('daysOverdue', () => {
  // A função lê `new Date()` internamente, então o relógio precisa ser fixo
  // para o resultado ser determinístico.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-30T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('devolve 0 no próprio dia do vencimento', () => {
    expect(daysOverdue(new Date('2026-07-30T00:00:00Z'))).toBe(0);
  });

  it('conta um dia de atraso para o vencimento de ontem', () => {
    expect(daysOverdue(new Date('2026-07-29T00:00:00Z'))).toBe(1);
  });

  it('conta o atraso ao longo do mês', () => {
    expect(daysOverdue(new Date('2026-07-01T00:00:00Z'))).toBe(29);
  });

  it('atravessa a virada de mês', () => {
    expect(daysOverdue(new Date('2026-06-30T00:00:00Z'))).toBe(30);
  });

  it('devolve negativo para parcela a vencer', () => {
    expect(daysOverdue(new Date('2026-08-05T00:00:00Z'))).toBe(-6);
  });

  describe('normalização para dias inteiros em UTC', () => {
    // O ponto da normalização é bater com `CURRENT_DATE - due_date` do banco,
    // que compara datas e não instantes. Hora do dia não pode vazar no
    // resultado, senão o mesmo vencimento daria valores diferentes conforme a
    // hora da requisição.
    it.each([
      ['logo após a meia-noite', '2026-07-30T00:00:01Z'],
      ['meio-dia', '2026-07-30T12:00:00Z'],
      ['um segundo antes da meia-noite', '2026-07-30T23:59:59Z'],
    ])('devolve o mesmo valor %s', (_label, now) => {
      jest.setSystemTime(new Date(now));
      expect(daysOverdue(new Date('2026-07-25T00:00:00Z'))).toBe(5);
    });

    it('ignora a hora presente na própria data de vencimento', () => {
      expect(daysOverdue(new Date('2026-07-25T18:30:00Z'))).toBe(5);
    });
  });
});
