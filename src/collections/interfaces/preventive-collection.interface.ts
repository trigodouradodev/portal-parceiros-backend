import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClientAddress,
  CollectionAgentRef,
} from './overdue-collection.interface';

/** Próxima parcela a vencer de um contrato (driver do preventivo). */
export class UpcomingInstallmentSummary {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  installmentNumber: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-06-25',
    description: 'Vencimento da parcela (data, sem hora).',
  })
  dueDate: Date;

  @ApiProperty({
    example: 9,
    description: 'Dias até vencer = due_date - CURRENT_DATE.',
  })
  daysUntilDue: number;

  @ApiProperty({ example: 592.37 })
  pendingAmount: number;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;

  @ApiProperty({
    example: 0,
    description: 'Nº de followups registrados para a parcela.',
  })
  followupCount: number;

  @ApiPropertyOptional({
    example: 'contacted',
    description: 'Status do followup mais recente.',
  })
  latestFollowupStatus?: string;
}

/** Contrato a vencer, representado pela sua próxima parcela. */
export class PreventiveContract {
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

  @ApiPropertyOptional({ example: '11987654321' })
  clientPhone?: string;

  @ApiPropertyOptional({ type: ClientAddress })
  address?: ClientAddress;

  @ApiPropertyOptional()
  consultantName?: string;

  @ApiPropertyOptional()
  companyName?: string;

  @ApiPropertyOptional({ type: CollectionAgentRef })
  collectionAgent?: CollectionAgentRef;

  @ApiProperty({ type: UpcomingInstallmentSummary })
  nextInstallment: UpcomingInstallmentSummary;
}

export class PreventivePagination {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({ example: 84 })
  totalContracts: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

export class PreventiveCollectionPage {
  @ApiProperty({ type: [PreventiveContract] })
  contracts: PreventiveContract[];

  @ApiProperty({ type: PreventivePagination })
  pagination: PreventivePagination;
}
