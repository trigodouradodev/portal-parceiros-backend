import { ApiProperty } from '@nestjs/swagger';

/** Condições comerciais da proposta depois de recalculadas (AUREA-701). */
export class QuoteDraftSimulationSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  simulationId: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty({ description: 'Taxa a.m. em decimal (0.0339 = 3,39%).' })
  interestRate: number;

  @ApiProperty()
  financeAmount: number;

  @ApiProperty()
  installmentNumbers: number;

  @ApiProperty({ format: 'date' })
  firstInstallmentDate: string;

  @ApiProperty({ description: 'Parcela sem seguro.' })
  installmentAmount: number;

  @ApiProperty({ description: 'Parcela financiada com o seguro.' })
  installmentAmountWithInsurance: number;

  @ApiProperty({ description: 'Prêmio do seguro prestamista.' })
  insurancePremium: number;

  @ApiProperty()
  totalAmountOwed: number;
}
