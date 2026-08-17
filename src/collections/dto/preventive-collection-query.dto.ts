import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { OverdueCollectionQueryDto } from './overdue-collection-query.dto';

/** Paginação + janela da aba Preventivo (parcelas a vencer). */
export class PreventiveCollectionQueryDto extends OverdueCollectionQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 90,
    default: 15,
    description:
      'Janela em dias à frente (parcelas com vencimento até hoje + N).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  withinDays: number = 15;
}
