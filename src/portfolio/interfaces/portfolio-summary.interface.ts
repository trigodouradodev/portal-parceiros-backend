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

/** Resumo executivo dos seis KPIs de carteira. */
export class PortfolioSummary {
  @ApiProperty({ type: ActivePortfolioSummary })
  active: ActivePortfolioSummary;

  @ApiProperty({ type: DelinquencySummary })
  delinquency: DelinquencySummary;

  @ApiProperty({
    example: 34500.5,
    description: 'Saldo pendente de contratos renegociados.',
  })
  renegotiatedOutstandingAmount: number;
}
