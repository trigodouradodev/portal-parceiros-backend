import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const INVALID_BOOLEAN = 'invalid_boolean';

function parseOptionalBoolean(
  value: unknown,
): boolean | undefined | typeof INVALID_BOOLEAN {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return INVALID_BOOLEAN;
}

/** Paginação da listagem de contratos vinculados ao usuário. */
export class ContractsQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    default: 1,
    description: 'Página (1-based).',
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
    description: 'Itens por página (máximo 100).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;

  @ApiPropertyOptional({
    description: 'Busca parcial por nome do cliente ou número do contrato.',
    example: 'CT-000123',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    isArray: true,
    description:
      'IDs de produtos. Aceita parâmetros repetidos ou uma lista separada por vírgula.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const values = Array.isArray(value) ? value : [value];
    const products = values
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    return products.length > 0 ? products : undefined;
  })
  @IsUUID('4', { each: true })
  products?: string[];

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-01-01',
    description: 'Data inicial de desembolso (inclusiva).',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-01-31',
    description: 'Data final de desembolso (inclusiva).',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Quando true, retorna somente contratos com saldo pendente hoje (KPI Carteira/Contratos Ativos — analytics.vw_fato_parcela.valor_pendente > 0).',
  })
  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  onlyActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Quando true, retorna somente contratos em inadimplência pela Regra do Vagão (analytics.vw_fato_parcela.valor_contribuicao_inadimplencia > 0).',
  })
  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  onlyDelinquency?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Quando true, retorna somente contratos com renegociação.',
  })
  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  onlyRenegotiated?: boolean;
}
