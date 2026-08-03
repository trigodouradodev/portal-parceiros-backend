import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContractListItem {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'CT-000123' })
  contractNumber: string;

  @ApiProperty({ example: 'João da Silva' })
  clientName: string;

  @ApiPropertyOptional({ example: 'Empresa ABC' })
  companyName?: string;

  @ApiPropertyOptional({ example: 'Maria Souza' })
  consultantName?: string;

  @ApiProperty({ example: 'CRÉDITO PESSOAL' })
  productName: string;

  @ApiProperty({ example: 10000, description: 'Valor desembolsado.' })
  disbursedAmount: number;

  @ApiProperty({
    example: 12450,
    description: 'Valor total projetado, incluindo IOF.',
  })
  projectedAmount: number;

  @ApiProperty({ example: 7300.5, description: 'Soma das parcelas em aberto.' })
  outstandingBalance: number;

  @ApiProperty({ example: 12 })
  totalInstallments: number;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-01-10' })
  disbursementDate?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-09-10',
    description: 'Parcela em aberto com a menor data de vencimento.',
  })
  nextDueDate?: Date;
}

export class ContractsPagination {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({ example: 125 })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

export class ContractsPage {
  @ApiProperty({ type: [ContractListItem] })
  items: ContractListItem[];

  @ApiProperty({ type: ContractsPagination })
  pagination: ContractsPagination;
}
