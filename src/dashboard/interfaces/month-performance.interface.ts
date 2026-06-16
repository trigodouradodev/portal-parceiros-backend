import { ApiProperty } from '@nestjs/swagger';

export class OriginationSummary {
  @ApiProperty({ example: 12 })
  count: number;

  @ApiProperty({ example: 350000.0, description: 'Soma de total_amount.' })
  amount: number;
}

export class DelinquencySummary {
  @ApiProperty({
    example: 7.35,
    description: 'Percentual 0–100 (regra de arrasto).',
  })
  rate: number;

  @ApiProperty({
    example: 42000.0,
    description: 'Valor inadimplente ponderado.',
  })
  overdueAmount: number;

  @ApiProperty({
    example: 571000.0,
    description: 'Saldo total em aberto da carteira.',
  })
  portfolioOpenAmount: number;
}

export class MonthPerformance {
  @ApiProperty({
    example: '2026-06',
    description: "Mês de referência (mês corrente) no formato 'YYYY-MM'.",
  })
  month: string;

  @ApiProperty({
    type: OriginationSummary,
    description: 'Contratos desembolsados no mês.',
  })
  origination: OriginationSummary;

  @ApiProperty({
    example: 10.43,
    nullable: true,
    description:
      'Taxa média em percentual (interest_rate × 100, 2 casas). null se não houve originação.',
  })
  averageRate: number | null;

  @ApiProperty({ type: DelinquencySummary })
  delinquency: DelinquencySummary;

  @ApiProperty({
    example: 3,
    description: "Contratos do mês de clientes com contrato anterior 'closed'.",
  })
  renewals: number;
}
