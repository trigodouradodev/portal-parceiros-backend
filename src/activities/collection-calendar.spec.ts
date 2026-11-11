import {
  addCollectionDays,
  effectiveCollectionDueDate,
} from './collection-calendar';

describe('calendário de carência da cobrança', () => {
  it('mantém o vencimento em dia útil', () => {
    expect(effectiveCollectionDueDate('2026-07-27')).toBe('2026-07-27');
  });

  it('estende o sábado até terça quando a segunda é feriado nacional', () => {
    expect(effectiveCollectionDueDate('2026-09-05')).toBe('2026-09-08');
  });

  it('estende o Natal de sexta até a segunda seguinte', () => {
    expect(effectiveCollectionDueDate('2026-12-25')).toBe('2026-12-28');
  });

  it('o retorno de visita usa quinze dias corridos, inclusive atravessando o ano', () => {
    expect(addCollectionDays('2026-10-19', 15)).toBe('2026-11-03');
    expect(addCollectionDays('2026-12-20', 15)).toBe('2027-01-04');
  });
});
