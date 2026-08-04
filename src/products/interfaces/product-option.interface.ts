import { ApiProperty } from '@nestjs/swagger';

/** Opção mínima para filtros de produto no frontend. */
export class ProductOption {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({ example: 'CRÉDITO PESSOAL' })
  description: string;
}
