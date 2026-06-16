import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Parcela vencida mais antiga de um contrato (driver do atraso). */
export class OverdueInstallmentSummary {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 1 })
  installmentNumber: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2025-10-16',
    description: 'Vencimento da parcela (data, sem hora).',
  })
  dueDate: Date;

  @ApiProperty({
    example: 243,
    description: 'Dias de atraso = CURRENT_DATE - due_date.',
  })
  daysOverdue: number;

  @ApiProperty({ example: 592.37 })
  pendingAmount: number;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;

  @ApiProperty({
    example: 2,
    description: 'Nº de followups registrados para a parcela.',
  })
  followupCount: number;

  @ApiPropertyOptional({
    example: 'promise_to_pay',
    description: 'Status do followup mais recente.',
  })
  latestFollowupStatus?: string;
}

export class CollectionAgentRef {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

/** Contrato atrasado, representado pela sua parcela vencida mais antiga. */
export class OverdueContract {
  @ApiProperty()
  contractId: string;

  @ApiProperty()
  contractNumber: string;

  @ApiProperty({
    example: 12,
    description: 'Total de parcelas do contrato (para "parcela X de Y").',
  })
  totalInstallments: number;

  @ApiProperty()
  clientName: string;

  @ApiProperty()
  clientTaxId: string;

  @ApiPropertyOptional()
  consultantName?: string;

  @ApiPropertyOptional()
  companyName?: string;

  @ApiPropertyOptional({ type: CollectionAgentRef })
  collectionAgent?: CollectionAgentRef;

  @ApiProperty({ type: OverdueInstallmentSummary })
  firstOverdueInstallment: OverdueInstallmentSummary;
}

export class OverduePagination {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({ example: 248 })
  totalContracts: number;

  @ApiProperty({ example: 9 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

export class OverdueCollectionPage {
  @ApiProperty({ type: [OverdueContract] })
  contracts: OverdueContract[];

  @ApiProperty({ type: OverduePagination })
  pagination: OverduePagination;
}
