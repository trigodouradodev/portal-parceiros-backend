import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * AUREA-346: permite pedir o detalhe de uma parcela específica do contrato
 * (ex.: escolhida na lista de parcelas da Carteira) em vez de deixar o
 * backend resolver automaticamente qual mostrar.
 */
export class ContractDetailQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    example: 3,
    description:
      'Parcela específica a mostrar. Sem esse parâmetro, o backend resolve automaticamente (parcela em aberto mais próxima; sem nenhuma, a última).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentNumber?: number;
}
