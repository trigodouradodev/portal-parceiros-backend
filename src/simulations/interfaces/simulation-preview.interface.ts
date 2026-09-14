import { ApiProperty } from '@nestjs/swagger';

/** Resultado do preview Celcoin sem persistência. */
export class SimulationPreview {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 5000 })
  amount: number;

  @ApiProperty({ example: 10 })
  installments: number;

  @ApiProperty({ example: '2026-09-10' })
  firstInstallmentDate: string;

  @ApiProperty({
    example: 0.095,
    description: 'Taxa a.m. em decimal usada no preview.',
  })
  interestRate: number;

  @ApiProperty({
    example: 1063.41,
    description: 'Parcela oficial (Celcoin payment_amount).',
  })
  installmentAmount: number;

  @ApiProperty({
    example: 6380.46,
    description: 'Total devido calculado pela Celcoin.',
  })
  totalAmountOwed: number;
}
