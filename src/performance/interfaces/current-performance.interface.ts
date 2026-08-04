import { ApiProperty } from '@nestjs/swagger';

/**
 * Componentes da comissão do mês. A tela exibe cada um como uma pill/linha do
 * detalhamento — no bloco real, só os maiores que zero; no simulador, todos,
 * com os zerados acinzentados.
 */
export enum CommissionComponentKind {
  /** Fixo mensal do nível. */
  FIXED = 'FIXED',
  /** Boas-vindas: valor único, só no 1º mês de parceria. */
  WELCOME = 'WELCOME',
  /** Bônus do pilar de desembolso (% sobre o fixo). */
  DISBURSEMENT_BONUS = 'DISBURSEMENT_BONUS',
  /** Bônus do pilar de risco (% sobre o fixo). */
  RISK_BONUS = 'RISK_BONUS',
  /** Bônus do pilar de taxa média (% sobre o fixo). */
  RATE_BONUS = 'RATE_BONUS',
  /** Marco de permanência: valor único, só nos meses 6, 12 e 18. */
  PERMANENCE_BONUS = 'PERMANENCE_BONUS',
}

/** Originação do mês contra a meta do nível (pilar de desembolso). */
export class OriginationPerformance {
  @ApiProperty({ example: 12, description: 'Contratos desembolsados no mês.' })
  count: number;

  @ApiProperty({
    example: 134000.0,
    description: 'Soma de `contracts.total_amount` dos contratos do mês (R$).',
  })
  amount: number;

  @ApiProperty({
    example: 67.0,
    description:
      'Quanto da meta mensal foi atingido, em % (valor ÷ meta × 100).',
  })
  targetPercent: number;

  @ApiProperty({
    example: 0.0,
    description:
      'Bônus destravado pela faixa em que `targetPercent` cai, em %.',
  })
  bonusPercent: number;
}

/** Inadimplência da carteira (pilar de risco). */
export class DelinquencyPerformance {
  @ApiProperty({
    example: 3.2,
    nullable: true,
    description:
      'Inadimplência em %: saldo vencido ÷ saldo em aberto × 100. null ' +
      'quando a carteira está vazia — aí não há o que medir.',
  })
  rate: number | null;

  @ApiProperty({
    example: 42000.0,
    description:
      'Saldo das parcelas em aberto já vencidas (due_date < hoje), em R$.',
  })
  overdueAmount: number;

  @ApiProperty({
    example: 1312500.0,
    description: 'Saldo de todas as parcelas em aberto da carteira, em R$.',
  })
  portfolioOpenAmount: number;

  @ApiProperty({
    example: 33.0,
    description:
      'Bônus destravado pela faixa em que `rate` cai, em %. Zero quando a ' +
      'carteira está vazia.',
  })
  bonusPercent: number;
}

/** Taxa média praticada nas operações do mês (pilar de taxa). */
export class AverageRatePerformance {
  @ApiProperty({
    example: 9.8,
    nullable: true,
    description:
      'Média de `loan_terms.interest_rate` dos contratos do mês, em % ' +
      '(fração × 100). null quando não houve originação no mês.',
  })
  rate: number | null;

  @ApiProperty({
    example: 20.0,
    description:
      'Bônus destravado pela faixa em que `rate` cai, em %. Zero quando não ' +
      'houve originação.',
  })
  bonusPercent: number;
}

/** Uma linha do detalhamento da comissão. */
export class CommissionComponent {
  @ApiProperty({
    enum: CommissionComponentKind,
    example: CommissionComponentKind.FIXED,
  })
  kind: CommissionComponentKind;

  @ApiProperty({ example: 8000.0, description: 'Valor do componente (R$).' })
  amount: number;
}

/** Comissão do mês, com o detalhamento por componente. */
export class CommissionSummary {
  @ApiProperty({ example: 12240.0, description: 'Soma dos componentes (R$).' })
  total: number;

  @ApiProperty({
    type: [CommissionComponent],
    description:
      'Todos os componentes, inclusive os zerados — a tela decide o que ' +
      'esconder (bloco real esconde zerados, simulador acinzenta).',
  })
  components: CommissionComponent[];
}

/** Resposta de `GET /performance/current` — o bloco "Desempenho real do mês". */
export class CurrentPerformance {
  @ApiProperty({
    example: '2026-07',
    description: "Mês de referência no formato 'YYYY-MM'.",
  })
  month: string;

  @ApiProperty({
    example: '2026-07-01',
    description: 'Primeiro dia do mês de referência.',
  })
  periodStart: string;

  @ApiProperty({
    example: '2026-07-30',
    description:
      'Último dia considerado — hoje, já que o mês está em andamento. ' +
      'Alimenta a legenda "1 a 30 de julho".',
  })
  periodEnd: string;

  @ApiProperty({ type: OriginationPerformance })
  origination: OriginationPerformance;

  @ApiProperty({ type: DelinquencyPerformance })
  delinquency: DelinquencyPerformance;

  @ApiProperty({ type: AverageRatePerformance })
  averageRate: AverageRatePerformance;

  @ApiProperty({ type: CommissionSummary })
  commission: CommissionSummary;
}
