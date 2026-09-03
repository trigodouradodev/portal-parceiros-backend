import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export class ListQuotesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;

  @ApiPropertyOptional({
    example: 'Maria ou 529.982.247-25',
    description:
      'Busca parcial pelo nome ou CPF do cliente. O CPF aceita máscara.',
  })
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    example: 'draft',
    description:
      'Status da proposta. Aceita também status legados existentes na base.',
  })
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(50)
  status?: string;
}
