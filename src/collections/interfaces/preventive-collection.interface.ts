import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientInfo, ContractInfo } from './overdue-collection.interface';
import { ContractResponsible } from './responsible.interface';

/** A parcela a vencer — sujeito de cada item do Preventivo. */
export class UpcomingInstallmentInfo {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  number: number;

  @ApiProperty({ example: '3/12', description: 'number/totalInstallments.' })
  label: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-06-25' })
  dueDate: Date;

  @ApiProperty({ example: 9, description: 'due_date - CURRENT_DATE.' })
  daysUntilDue: number;

  @ApiProperty({ example: 592.37 })
  pendingAmount: number;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;
}

/** Resumo de follow-up (Preventivo) registrado para a parcela. */
export class FollowupSummary {
  @ApiProperty({ example: 2 })
  count: number;

  @ApiPropertyOptional({ example: 'promise_to_pay' })
  latestStatus?: string;
}

/** Um item da lista do Preventivo = uma parcela a vencer e seu contexto. */
export class PreventiveCollectionItem {
  @ApiProperty({ type: UpcomingInstallmentInfo })
  installment: UpcomingInstallmentInfo;

  @ApiProperty({ type: ContractInfo })
  contract: ContractInfo;

  @ApiProperty({ type: ClientInfo })
  client: ClientInfo;

  @ApiPropertyOptional({ type: ContractResponsible })
  responsible?: ContractResponsible;

  @ApiProperty({ type: FollowupSummary })
  followup: FollowupSummary;
}

export class PreventivePagination {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({
    example: 84,
    description: 'Total de parcelas a vencer na janela.',
  })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

export class PreventiveCollectionPage {
  @ApiProperty({ type: [PreventiveCollectionItem] })
  items: PreventiveCollectionItem[];

  @ApiProperty({ type: PreventivePagination })
  pagination: PreventivePagination;
}
