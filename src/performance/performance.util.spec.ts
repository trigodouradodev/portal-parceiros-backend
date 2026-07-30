import {
  findBandCoverageDefect,
  findNextMilestone,
  partnershipMonthNumber,
  resolveBonusPercent,
  round2,
  toDateString,
} from './performance.util';
import {
  DISBURSEMENT_BANDS,
  MILESTONES,
  RATE_BANDS,
  RISK_BANDS,
  pgDate,
} from './performance.fixture';
import { BonusBand } from './interfaces/partner-program.interface';

describe('partnershipMonthNumber', () => {
  it('conta o mês de entrada como mês 1', () => {
    expect(
      partnershipMonthNumber(pgDate('2026-07-01'), pgDate('2026-07-30')),
    ).toBe(1);
  });

  it('ignora o dia do mês — entrada no dia 28 e referência no dia 1 seguinte já é mês 2', () => {
    expect(
      partnershipMonthNumber(pgDate('2026-06-28'), pgDate('2026-07-01')),
    ).toBe(2);
  });

  it('atravessa a virada de ano', () => {
    expect(
      partnershipMonthNumber(pgDate('2025-11-15'), pgDate('2026-01-05')),
    ).toBe(3);
  });

  it('reproduz o caso real do parceiro de teste (15/11/2025 → 30/07/2026 = mês 9)', () => {
    expect(
      partnershipMonthNumber(pgDate('2025-11-15'), pgDate('2026-07-30')),
    ).toBe(9);
  });

  it('passa de 12 sem reiniciar', () => {
    expect(
      partnershipMonthNumber(pgDate('2025-01-10'), pgDate('2026-07-30')),
    ).toBe(19);
  });
});

describe('findNextMilestone', () => {
  it('aponta o primeiro marco quando a parceria ainda é nova', () => {
    expect(findNextMilestone(1, MILESTONES)).toEqual({
      month: 6,
      multiplier: 1,
    });
  });

  it('no mês exato do marco ele já conta como atingido e o próximo passa a ser o seguinte', () => {
    expect(findNextMilestone(6, MILESTONES)).toEqual({
      month: 12,
      multiplier: 2,
    });
  });

  it('aponta o marco seguinte quando está entre dois', () => {
    expect(findNextMilestone(9, MILESTONES)).toEqual({
      month: 12,
      multiplier: 2,
    });
  });

  it('devolve null no último marco — depois dele não há próximo', () => {
    expect(findNextMilestone(18, MILESTONES)).toBeNull();
  });

  it('devolve null depois do último marco', () => {
    expect(findNextMilestone(25, MILESTONES)).toBeNull();
  });
});

describe('resolveBonusPercent', () => {
  // Valores esperados vêm das tabelas da seção 2.3 do documento comercial.
  // As fronteiras são o ponto sensível: RN05 fecha desembolso e taxa à
  // esquerda, e risco à direita.
  describe.each([
    [
      'desembolso',
      DISBURSEMENT_BANDS,
      [
        [0, 0],
        [99.99, 0],
        [100, 10],
        [109.99, 10],
        [110, 15],
        [119.99, 15],
        [120, 20],
        [250, 20],
      ],
    ],
    [
      'risco',
      RISK_BANDS,
      [
        [0, 50],
        [2, 50],
        [2.01, 33],
        [3.5, 33],
        [3.51, 15],
        [5, 15],
        [5.01, 0],
        [40, 0],
      ],
    ],
    [
      'taxa média',
      RATE_BANDS,
      [
        [0, 0],
        [9.49, 0],
        [9.5, 10],
        [9.51, 20],
        [10, 20],
        [10.01, 30],
        [25, 30],
      ],
    ],
  ])('pilar de %s', (_pillar, bands: BonusBand[], cases: number[][]) => {
    it.each(cases)('%p%% → +%p%% de bônus', (value, expected) => {
      expect(resolveBonusPercent(value, bands)).toBe(expected);
    });
  });

  it('trata a faixa de ponto único da taxa como degrau próprio, distinto dos vizinhos', () => {
    // O caso que mais facilmente quebraria numa troca de < por <=.
    expect(resolveBonusPercent(9.5, RATE_BANDS)).toBe(10);
    expect(resolveBonusPercent(9.4999, RATE_BANDS)).toBe(0);
    expect(resolveBonusPercent(9.5001, RATE_BANDS)).toBe(20);
  });
});

describe('findBandCoverageDefect', () => {
  it('aprova as três réguas oficiais', () => {
    expect(findBandCoverageDefect(DISBURSEMENT_BANDS)).toBeNull();
    expect(findBandCoverageDefect(RISK_BANDS)).toBeNull();
    expect(findBandCoverageDefect(RATE_BANDS)).toBeNull();
  });

  it('reprova régua sem nenhuma faixa', () => {
    expect(findBandCoverageDefect([])).toMatch(/nenhuma faixa/);
  });

  it('reprova régua que não começa em zero', () => {
    expect(findBandCoverageDefect(RATE_BANDS.slice(1))).toMatch(
      /começar em \[0/,
    );
  });

  it('reprova régua que termina com teto em vez de infinito', () => {
    const bands = [
      ...RATE_BANDS.slice(0, 3),
      { ...RATE_BANDS[3], maxValue: 99 },
    ];
    expect(findBandCoverageDefect(bands)).toMatch(/terminar sem teto/);
  });

  it('reprova buraco entre faixas', () => {
    // Remove a faixa [9.5 , 9.5]: sobra [0 , 9.5) seguida de (9.5 , 10], e o
    // valor exatamente 9.5 deixa de ser coberto.
    const bands = [RATE_BANDS[0], RATE_BANDS[2], RATE_BANDS[3]];
    expect(findBandCoverageDefect(bands)).toMatch(/buraco/);
  });

  it('reprova sobreposição entre faixas', () => {
    const bands = [
      { ...DISBURSEMENT_BANDS[0], maxInclusive: true },
      ...DISBURSEMENT_BANDS.slice(1),
    ];
    expect(findBandCoverageDefect(bands)).toMatch(/sobreposição/);
  });

  it('reprova faixa vazia, que tem cobertura íntegra mas nunca dispara', () => {
    const bands = [
      { ...RATE_BANDS[0], maxInclusive: true },
      { ...RATE_BANDS[1], minInclusive: false },
      ...RATE_BANDS.slice(2),
    ];
    expect(findBandCoverageDefect(bands)).toMatch(/faixa vazia/);
  });
});

describe('round2 e toDateString', () => {
  it('arredonda para duas casas', () => {
    expect(round2(83.535)).toBe(83.54);
    expect(round2(2640)).toBe(2640);
  });

  it('formata data do Postgres sem inventar hora', () => {
    expect(toDateString(pgDate('2025-11-15'))).toBe('2025-11-15');
  });
});
