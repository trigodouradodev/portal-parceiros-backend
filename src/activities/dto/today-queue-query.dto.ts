import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Paginação da lista `locked` da fila do dia. */
export class TodayQueueQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Responsável da fila. Ausente retorna as atividades do próprio usuário; quando informado, deve ser alguém de sua hierarquia.',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: 'Página do locked (1-based).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 30,
    description: 'Itens por página do locked (máx 100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}
