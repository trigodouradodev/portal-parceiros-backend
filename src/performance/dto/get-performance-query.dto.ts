import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length, Matches, ValidateIf } from 'class-validator';

export class GetPerformanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-09',
    description: 'Competência YYYY-MM. Padrão: mês corrente em Brasília.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(7, 7)
  @Matches(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be a valid month in YYYY-MM format',
  })
  month?: string;
}
