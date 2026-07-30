import { BonusBand } from './interfaces/partner-program.interface';
import { PermanenceMilestone } from './interfaces/performance-row.interface';

/** Utils puros do módulo de performance (sem dependência de Nest/Prisma). */

/** Arredonda para 2 casas — valores em R$. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Coluna `date` do Postgres para 'YYYY-MM-DD', sem inventar hora/timezone. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Mês de parceria. Conta por mês CALENDÁRIO: o mês de entrada é o mês 1,
 * independente do dia — início 15/11/2025 com referência em 29/07/2026 dá mês 9.
 * Coerente com o fixo mensal ser cheio e não pró-rata.
 *
 * As duas datas vêm de colunas/expressões `date` do Postgres (meia-noite UTC),
 * então a aritmética em UTC é exata. A referência é `CURRENT_DATE` do banco e
 * não `new Date()`, pra "hoje" ser o mesmo em todo o app (o dashboard já ancora
 * em CURRENT_DATE) e não depender do timezone do processo Node.
 */
export function partnershipMonthNumber(
  startedAt: Date,
  reference: Date,
): number {
  const years = reference.getUTCFullYear() - startedAt.getUTCFullYear();
  const months = reference.getUTCMonth() - startedAt.getUTCMonth();
  return years * 12 + months + 1;
}

/**
 * Próximo marco de permanência a alcançar. Comparação estrita: no mês exato do
 * marco ele já conta como atingido e o "próximo" passa a ser o seguinte —
 * espelha o estado "Atingido: mês >= marco" da trilha. Retorna null a partir do
 * último marco (depois do mês 18 não há mais próximo).
 *
 * `milestones` precisa vir ordenado por mês crescente.
 */
export function findNextMilestone(
  monthNumber: number,
  milestones: PermanenceMilestone[],
): PermanenceMilestone | null {
  return milestones.find((m) => m.month > monthNumber) ?? null;
}

/** Notação de intervalo da faixa, para mensagem de erro legível. */
function describeBand(band: BonusBand): string {
  const left = band.minInclusive ? '[' : '(';
  const right =
    band.maxValue === null
      ? '∞)'
      : `${band.maxValue}${band.maxInclusive ? ']' : ')'}`;
  return `${left}${band.minValue} , ${right}`;
}

/**
 * Valida a régua de um pilar e descreve o primeiro defeito encontrado, ou
 * devolve null se ela está sã.
 *
 * Existe porque as faixas são editáveis em runtime pelo backoffice, e faixa mal
 * cadastrada não dá erro — dá bônus errado em silêncio. Um buraco entre
 * `[100,110)` e `[120,∞)` faria um parceiro em 115% da meta ganhar 0% em vez de
 * 15%, e ninguém perceberia até a reclamação chegar.
 *
 * O `EXCLUDE` do Postgres (quando habilitado) barra sobreposição já no INSERT,
 * mas não pega buraco — por isso a checagem aqui cobre os dois.
 *
 * Regras: a régua começa em 0 inclusive, termina sem teto, nenhuma faixa é
 * vazia, e entre faixas vizinhas o teto de uma tem que ser exatamente o piso da
 * outra com apenas UM dos lados incluindo o ponto. Ambos incluindo =
 * sobreposição; nenhum = buraco no ponto. Essa regra aceita a faixa de ponto
 * único `[9.5 , 9.5]` da taxa.
 *
 * `bands` precisa vir ordenado por `sort_order` — a faixa de ponto único
 * compartilha o `min_value` com a seguinte, então valor não é ordem total.
 */
export function findBandCoverageDefect(bands: BonusBand[]): string | null {
  if (bands.length === 0) return 'nenhuma faixa cadastrada';

  // Faixa vazia não quebra a cobertura, mas nunca casa com valor nenhum: quem
  // cadastrou acha que criou um degrau de bônus que na prática nunca dispara.
  const empty = bands.find(
    (band) =>
      band.maxValue !== null &&
      band.minValue === band.maxValue &&
      !(band.minInclusive && band.maxInclusive),
  );
  if (empty) {
    return `faixa vazia ${describeBand(empty)} nunca casaria com nenhum valor`;
  }

  const first = bands[0];
  if (first.minValue !== 0 || !first.minInclusive) {
    return `régua deveria começar em [0, veio ${describeBand(first)}`;
  }

  for (let i = 0; i < bands.length - 1; i += 1) {
    const current = bands[i];
    const next = bands[i + 1];

    if (current.maxValue === null) {
      return `faixa sem teto ${describeBand(current)} não pode ser seguida por outra`;
    }
    if (current.maxValue !== next.minValue) {
      const defect =
        current.maxValue < next.minValue ? 'buraco' : 'sobreposição';
      return `${defect} entre ${describeBand(current)} e ${describeBand(next)}`;
    }
    if (current.maxInclusive === next.minInclusive) {
      const defect = current.maxInclusive ? 'sobreposição' : 'buraco';
      return `${defect} no ponto ${current.maxValue} entre ${describeBand(current)} e ${describeBand(next)}`;
    }
  }

  const last = bands[bands.length - 1];
  if (last.maxValue !== null) {
    return `régua deveria terminar sem teto, veio ${describeBand(last)}`;
  }
  return null;
}
