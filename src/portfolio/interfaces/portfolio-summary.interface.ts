import { ApiProperty } from '@nestjs/swagger';

/** Valores da carteira vigente no instante da consulta. */
export class ActivePortfolioSummary {
  @ApiProperty({
    example: 184250.75,
    description: 'Saldo nominal ainda pendente.',
  })
  outstandingAmount: number;

  @ApiProperty({ example: 42, description: 'Contratos com saldo pendente.' })
  contracts: number;
}

/** Inadimplência calculada pela regra de arrasto da view analítica. */
export class DelinquencySummary {
  @ApiProperty({
    example: 12.34,
    description: 'Inadimplência sobre o saldo pendente, em %.',
  })
  rate: number;

  @ApiProperty({
    example: 22731.15,
    description: 'Valor que contribui para a inadimplência.',
  })
  amount: number;

  @ApiProperty({
    example: 8,
    description: 'Contratos com contribuição de inadimplência.',
  })
  contracts: number;
}

export class OriginationSummary {
  @ApiProperty({
    example: 250000,
    description: 'Valor desembolsado no mês corrente.',
  })
  amount: number;

  @ApiProperty({
    example: 14,
    description: 'Contratos desembolsados no mês corrente.',
  })
  contracts: number;

  @ApiProperty({
    example: 6,
    description: 'Contratos de novos clientes no mês.',
  })
  newClients: number;

  @ApiProperty({ example: 5, description: 'Contratos renovados no mês.' })
  renewedClients: number;

  @ApiProperty({
    example: 3,
    description: 'Contratos de clientes reativados no mês.',
  })
  reactiveClients: number;
}

export class ReceiptSummary {
  @ApiProperty({
    example: 83000,
    description: 'Recebimentos efetivados no mês corrente.',
  })
  currentMonthAmount: number;

  @ApiProperty({
    example: 97000,
    description: 'Valor nominal previsto para vencer no mês corrente.',
  })
  scheduledCurrentMonthAmount: number;

  @ApiProperty({
    example: 4200,
    description: 'Recebimentos antecipados no mês corrente.',
  })
  advanceAmount: number;

  @ApiProperty({
    example: 8500,
    description: 'Recebimentos com atraso no mês corrente.',
  })
  lateAmount: number;
}

/**
 * Resumo executivo da carteira. Todos os valores respeitam o escopo de
 * hierarquia do viewer; o período de originação e recebimentos é o mês atual.
 */
export class PortfolioSummary {
  @ApiProperty({
    example: '2026-08',
    description: 'Mês de referência dos indicadores mensais.',
  })
  month: string;

  @ApiProperty({ type: ActivePortfolioSummary })
  active: ActivePortfolioSummary;

  @ApiProperty({ type: DelinquencySummary })
  delinquency: DelinquencySummary;

  @ApiProperty({
    example: 34500.5,
    description: 'Saldo pendente de contratos renegociados.',
  })
  renegotiatedOutstandingAmount: number;

  @ApiProperty({ type: OriginationSummary })
  origination: OriginationSummary;

  @ApiProperty({
    example: 4,
    description:
      'Contratos encerrados cujo último pagamento ocorreu no mês corrente.',
  })
  settledContracts: number;

  @ApiProperty({ type: ReceiptSummary })
  receipts: ReceiptSummary;

  @ApiProperty({
    example: 4386.92,
    description: 'Saldo nominal pendente médio por contrato ativo.',
  })
  averageRemainingNominalPerContract: number;

  @ApiProperty({
    example: 11.25,
    nullable: true,
    description: 'Taxa média de juros das originações do mês, em %.',
  })
  averageInterestRate: number | null;
}
