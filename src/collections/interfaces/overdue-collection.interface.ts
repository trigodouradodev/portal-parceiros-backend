import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Tarefa de cobrança (activity) pendente vinculada à parcela. */
export class ActivityTaskSummary {
  @ApiProperty()
  id: string;

  @ApiProperty({
    example: 'warning',
    description:
      'Estágio da régua: friendly | assertive | warning | defaulted.',
  })
  stageCode: string;

  @ApiProperty({
    example: 'Advertência',
    description: 'Label do estágio para exibição (badge).',
  })
  stageBadgeLabel: string;

  @ApiProperty({
    example: 'whatsapp_message',
    description: 'Canal: whatsapp_message | client_call | client_visit.',
  })
  channel: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

/** Endereço do cliente (endereço primário; fallback para o mais recente). */
export class ClientAddress {
  @ApiProperty({ example: 'Rua das Flores' })
  street: string;

  @ApiProperty({ example: '123' })
  number: string;

  @ApiPropertyOptional({ example: 'Apto 4' })
  complement?: string;

  @ApiProperty({ example: 'Centro' })
  neighborhood: string;

  @ApiProperty({ example: 'São Paulo' })
  city: string;

  @ApiPropertyOptional({ example: 'SP' })
  state?: string;

  @ApiProperty({ example: '01001000' })
  zipCode: string;
}

/**
 * Referência a um agente de cobrança. Mantida para o Preventivo; na Cobrança o
 * responsável é representado por `ResponsibleInfo`.
 */
export class CollectionAgentRef {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

/** A parcela atrasada — sujeito de cada item da lista. */
export class InstallmentInfo {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  number: number;

  @ApiProperty({ example: '3/12', description: 'number/totalInstallments.' })
  label: string;

  @ApiProperty({ type: String, format: 'date', example: '2025-10-16' })
  dueDate: Date;

  @ApiProperty({ example: 243, description: 'CURRENT_DATE - due_date.' })
  daysOverdue: number;

  @ApiProperty({ example: 592.37 })
  pendingAmount: number;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;
}

/** Contrato da parcela. */
export class ContractInfo {
  @ApiProperty()
  id: string;

  @ApiProperty()
  number: string;

  @ApiProperty({ example: 12 })
  totalInstallments: number;

  @ApiPropertyOptional()
  companyName?: string;
}

/** Cliente (devedor). */
export class ClientInfo {
  @ApiProperty()
  name: string;

  @ApiProperty()
  taxId: string;

  @ApiPropertyOptional({ example: '11987654321' })
  phone?: string;

  @ApiPropertyOptional({ type: ClientAddress })
  address?: ClientAddress;
}

/** Responsável pela cobrança: agente de cobrança se houver, senão o consultor. */
export class ResponsibleInfo {
  @ApiProperty({
    enum: ['collection_agent', 'consultant'],
    nullable: true,
    example: 'collection_agent',
    description:
      'Qual papel é o responsável; null se o contrato não tiver nenhum.',
  })
  type: 'collection_agent' | 'consultant' | null;

  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  name?: string;
}

/** Resumo de follow-up (Preventivo) registrado para a parcela. */
export class FollowupSummary {
  @ApiProperty({ example: 2 })
  count: number;

  @ApiPropertyOptional({ example: 'promise_to_pay' })
  latestStatus?: string;
}

/** Um item da lista da Cobrança = uma parcela atrasada e seu contexto. */
export class OverdueCollectionItem {
  @ApiProperty({ type: InstallmentInfo })
  installment: InstallmentInfo;

  @ApiProperty({ type: ContractInfo })
  contract: ContractInfo;

  @ApiProperty({ type: ClientInfo })
  client: ClientInfo;

  @ApiProperty({ type: ResponsibleInfo })
  responsible: ResponsibleInfo;

  @ApiProperty({
    type: ActivityTaskSummary,
    nullable: true,
    description: 'Tarefa de cobrança pendente da parcela; null se não houver.',
  })
  task: ActivityTaskSummary | null;

  @ApiProperty({ type: FollowupSummary })
  followup: FollowupSummary;
}

export class OverduePagination {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({ example: 25603, description: 'Total de parcelas atrasadas.' })
  total: number;

  @ApiProperty({ example: 854 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

export class OverdueCollectionPage {
  @ApiProperty({ type: [OverdueCollectionItem] })
  items: OverdueCollectionItem[];

  @ApiProperty({ type: OverduePagination })
  pagination: OverduePagination;
}
