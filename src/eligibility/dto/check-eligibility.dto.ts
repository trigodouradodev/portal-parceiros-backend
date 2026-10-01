import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength } from 'class-validator';

/** Payload da consulta de elegibilidade do cliente. */
export class CheckEligibilityDto {
  @ApiProperty({ example: 'Maria Souza' })
  @IsString()
  @MinLength(3)
  name: string;

  @ApiProperty({
    example: '52998224725',
    description: 'CPF (com ou sem máscara).',
  })
  @IsString()
  @MinLength(11)
  document: string;

  @ApiProperty({ example: '1990-05-20', format: 'date' })
  @IsDateString()
  birthDate: string;
}
