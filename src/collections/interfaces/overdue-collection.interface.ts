import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractResponsible } from './responsible.interface';

/** Tarefa de cobrança (activity) da parcela: a pendente ou a última executada. */
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

  @ApiProperty({
    example: 'pending',
    description: 'pending (ação a fazer) | completed (última executada).',
  })
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'Quando a tarefa foi executada (presente quando status=completed).',
  })
  completedAt?: Date;
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

/** Um item da lista da Cobrança = uma parcela atrasada e seu contexto. */
export class OverdueCollectionItem {
  @ApiProperty({ type: InstallmentInfo })
  installment: InstallmentInfo;

  @ApiProperty({ type: ContractInfo })
  contract: ContractInfo;

  @ApiProperty({ type: ClientInfo })
  client: ClientInfo;

  @ApiPropertyOptional({ type: ContractResponsible })
  responsible?: ContractResponsible;

  @ApiProperty({
    type: ActivityTaskSummary,
    nullable: true,
    description:
      'Tarefa mais recente da parcela: pendente (ação a fazer) ou a última executada (status=completed, ex.: visita final no defaulted). null só se a parcela ainda não teve tarefa.',
  })
  task: ActivityTaskSummary | null;
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
