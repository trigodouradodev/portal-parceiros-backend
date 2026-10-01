import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Filtros opcionais da lista de simulações do parceiro autenticado. */
export class ListSimulationsQueryDto {
  @ApiPropertyOptional({
    example: 'maria',
    description:
      'Busca parcial no nome do cliente (case-insensitive, contains).',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: '529.982.247-25',
    description:
      'CPF com ou sem máscara. A comparação usa só os dígitos (contains).',
  })
  @IsOptional()
  @IsString()
  document?: string;
}
