import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Payload financeiro para preview Celcoin sem persistir simulação. */
export class PreviewSimulationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 5000, minimum: 500, maximum: 30000 })
  @Type(() => Number)
  @IsNumber()
  @Min(500)
  @Max(30000)
  amount: number;

  @ApiProperty({ example: 10, minimum: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  installments: number;

  @ApiProperty({
    example: '2026-09-10',
    format: 'date',
    description: 'Primeira parcela: dia 5, 10, 15 ou 20, no máximo D+45.',
  })
  @IsDateString()
  firstInstallmentDate: string;

  @ApiPropertyOptional({
    example: 0.0339,
    description:
      'Taxa a.m. em decimal (0.0339 = 3,39%). Omitida usa o máximo do produto.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  interestRate?: number;
}
