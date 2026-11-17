import {
  addUtcDays,
  businessToday,
  firstInstallmentRuleViolation,
  firstInstallmentWindow,
} from './first-installment-rule';

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('businessToday', () => {
  it('às 22h em Brasília ainda é o mesmo dia, embora em UTC já seja o seguinte', () => {
    // 10/03/2026 22:00 em Brasília (UTC-3) = 11/03/2026 01:00 UTC
    expect(businessToday(new Date('2026-03-11T01:00:00.000Z'))).toEqual(
      utc('2026-03-10'),
    );
  });

  it('vira o dia à meia-noite de Brasília', () => {
    expect(businessToday(new Date('2026-03-10T03:01:00.000Z'))).toEqual(
      utc('2026-03-10'),
    );
    expect(businessToday(new Date('2026-03-10T02:59:00.000Z'))).toEqual(
      utc('2026-03-09'),
    );
  });
});

describe('firstInstallmentRuleViolation', () => {
  function violation(today: string, offsetDays: number): string | null {
    const reference = utc(today);
    return firstInstallmentRuleViolation(
      addUtcDays(reference, offsetDays),
      reference,
    );
  }

  it('a janela vai de hoje + 20 a hoje + 45', () => {
    expect(firstInstallmentWindow(utc('2026-03-25'))).toEqual({
      earliest: utc('2026-04-14'),
      latest: utc('2026-05-09'),
    });
  });

  // Hoje = 25/03/2026: janela de 14/04 a 09/05.
  it.each([
    ['hoje + 19 (13/04) está antes do mínimo', 19, false],
    ['hoje + 20 (14/04) é o primeiro dia aceito', 20, true],
    ['hoje + 45 (09/05) é o último dia aceito', 45, true],
    ['hoje + 46 (10/05) passa do máximo', 46, false],
  ])('limites da janela: %s', (_name, offset, ok) => {
    expect(violation('2026-03-25', offset) === null).toBe(ok);
  });

  it('dia 20 passa e dia 21 não, dentro da janela', () => {
    // 20/04/2026 = hoje + 26; 21/04/2026 = hoje + 27
    expect(violation('2026-03-25', 26)).toBeNull();
    expect(violation('2026-03-25', 27)).not.toBeNull();
  });

  it('dentro da janela, dia 22 a 31 é recusado e dia 1 aceito', () => {
    // Hoje = 05/03/2026: janela de 25/03 a 19/04. 25/03 e 31/03 são dias altos.
    expect(violation('2026-03-05', 20)).not.toBeNull(); // 25/03
    expect(violation('2026-03-05', 26)).not.toBeNull(); // 31/03
    expect(violation('2026-03-05', 27)).toBeNull(); // 01/04
  });

  it('virada de mês e de ano', () => {
    // Hoje = 28/12/2026: janela de 17/01/2027 a 11/02/2027.
    expect(violation('2026-12-28', 20)).toBeNull(); // 17/01/2027
    expect(violation('2026-12-28', 45)).toBeNull(); // 11/02/2027
  });

  it('fevereiro de ano não bissexto', () => {
    // Hoje = 31/01/2026: janela de 20/02 a 17/03; 28/02 é dia alto e 01/03 ok.
    expect(violation('2026-01-31', 20)).toBeNull(); // 20/02
    expect(violation('2026-01-31', 21)).not.toBeNull(); // 21/02
    expect(violation('2026-01-31', 29)).toBeNull(); // 01/03
  });

  it('a mensagem informa a janela e o limite do dia', () => {
    expect(violation('2026-03-25', 19)).toBe(
      'A primeira parcela deve cair entre 14/04/2026 e 09/05/2026, em um dia de 1 a 20 do mês.',
    );
  });
});
