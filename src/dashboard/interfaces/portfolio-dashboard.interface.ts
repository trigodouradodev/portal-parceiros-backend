import { ApiProperty } from '@nestjs/swagger';

export class RenewalMonthBucket {
  @ApiProperty({
    example: '2026-06',
    description: "Mês de vencimento da última parcela, no formato 'YYYY-MM'.",
  })
  month: string;

  @ApiProperty({ example: 3 })
  count: number;
}

export class UpcomingRenewals {
  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ type: [RenewalMonthBucket] })
  byMonth: RenewalMonthBucket[];
}

export class PortfolioDashboard {
  @ApiProperty({
    example: 120,
    description:
      'Contratos disbursed/active com pelo menos uma parcela em aberto.',
  })
  activeContracts: number;

  @ApiProperty({
    example: 4,
    description:
      'Contratos disbursed/active com parcela em aberto vencendo hoje.',
  })
  dueTodayContracts: number;

  @ApiProperty({
    example: 18,
    description:
      'Contratos disbursed/active com pelo menos uma parcela em aberto vencida.',
  })
  overdueContracts: number;

  @ApiProperty({
    type: UpcomingRenewals,
    description:
      'Contratos cuja última parcela vence nos próximos 4 meses (mês atual + 3), agrupados por mês.',
  })
  upcomingRenewals: UpcomingRenewals;
}
