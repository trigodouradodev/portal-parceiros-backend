import { ApiProperty } from '@nestjs/swagger';

/** Opção de produto para filtros da carteira e simulação de originação. */
export class ProductOption {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({ example: 'CRÉDITO PESSOAL' })
  description: string;

  @ApiProperty({
    example: 0.02,
    description: 'Taxa mínima a.m. em decimal (0.02 = 2%).',
  })
  minInterestRate: number;

  @ApiProperty({
    example: 0.0339,
    description: 'Taxa máxima a.m. em decimal (0.0339 = 3,39%).',
  })
  maxInterestRate: number;

  @ApiProperty({ example: 2 })
  minInstallmentCount: number;

  @ApiProperty({ example: 12 })
  maxInstallmentCount: number;

  @ApiProperty({ example: true })
  enabled: boolean;
}
