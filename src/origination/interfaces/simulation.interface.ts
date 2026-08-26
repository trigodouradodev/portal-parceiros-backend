import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Snapshot persistido da simulação (AUREA-428). Campos em camelCase EN. */
export class SimulationSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-08-26T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '1990-05-20' })
  birthDate: string;

  @ApiProperty({ example: 'maria@email.com' })
  email: string;

  @ApiProperty({ example: '11987654321' })
  telephone: string;

  @ApiProperty({ example: '52998224725' })
  document: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'GIRO' })
  productName: string;

  @ApiProperty({
    example: 0.095,
    description:
      'Taxa a.m. em decimal (0.095 = 9,5%), como no POST e no banco.',
  })
  interestRate: number;

  @ApiProperty({ example: 5000 })
  amount: number;

  @ApiProperty({ example: 10 })
  installments: number;

  @ApiProperty({ example: '2026-09-10' })
  firstInstallmentDate: string;

  @ApiProperty({ example: 1560.32 })
  installmentAmount: number;

  @ApiPropertyOptional({
    description: 'Payload cru da simulação (Celcoin), quando houver.',
  })
  simulationResult?: unknown;
}
