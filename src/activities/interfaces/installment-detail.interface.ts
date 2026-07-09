import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientAddress } from '../../collections/interfaces/overdue-collection.interface';
import { ContractResponsible } from '../../collections/interfaces/responsible.interface';

export class DetailAuthor {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;
}

export class DetailGeolocation {
  @ApiProperty({ example: -23.55052 })
  latitude: number;

  @ApiProperty({ example: -46.633308 })
  longitude: number;
}

/** A interação registrada de uma tarefa (0 ou 1 por tarefa). */
export class TaskInteraction {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'whatsapp', description: 'whatsapp | call | visit.' })
  channel: string;

  @ApiProperty({
    example: 'client',
    description: 'client | guarantor | other.',
  })
  recipientType: string;

  @ApiProperty({ example: 'payment_promise' })
  result: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  promiseDate?: Date;

  @ApiPropertyOptional()
  observation?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: DetailAuthor, description: 'Quem registrou.' })
  author: DetailAuthor;

  @ApiPropertyOptional({ type: DetailGeolocation })
  geolocation?: DetailGeolocation;
}

/** Uma tarefa do histórico da parcela, com sua interação (se houve). */
export class TaskHistoryItem {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'fpd' })
  segmentCode: string;

  @ApiPropertyOptional({ example: 'FPD' })
  segmentBadgeLabel?: string;

  @ApiProperty({ example: 2 })
  priority: number;

  @ApiProperty({
    example: 'friendly',
    description: 'friendly | firm | severe.',
  })
  tone: string;

  @ApiProperty({ example: 'contact', description: 'contact | visit.' })
  taskType: string;

  @ApiProperty({
    example: 'completed',
    description: 'pending | completed | system_closed | cancelled.',
  })
  status: string;

  @ApiProperty({
    example: 'system',
    description: 'Quem criou: system (job) | user.',
  })
  createdBy: string;

  @ApiProperty({ type: String, format: 'date' })
  expireDate: Date;

  @ApiProperty()
  wasPostponed: boolean;

  @ApiProperty()
  wasRescheduled: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  completedAt?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Quando o sistema fechou a tarefa (não executada).',
  })
  systemClosedAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  cancelledAt?: Date;

  @ApiPropertyOptional()
  cancellationReason?: string;

  @ApiProperty({
    type: TaskInteraction,
    nullable: true,
    description:
      'Interação registrada nesta tarefa; null se não foi executada.',
  })
  interaction: TaskInteraction | null;
}

export class DetailContract {
  @ApiProperty()
  id: string;

  @ApiProperty()
  number: string;

  @ApiProperty({ example: 12 })
  totalInstallments: number;

  @ApiProperty({ example: 12000.0 })
  totalAmount: number;

  @ApiPropertyOptional({ type: String, format: 'date' })
  startDate?: Date;

  @ApiPropertyOptional({ type: String, format: 'date' })
  endDate?: Date;

  @ApiPropertyOptional()
  companyName?: string;
}

export class DetailInstallment {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  number: number;

  @ApiProperty({ example: '3/12' })
  label: string;

  @ApiProperty({ type: String, format: 'date' })
  dueDate: Date;

  @ApiProperty({ example: 5, description: 'CURRENT_DATE - due_date.' })
  daysOverdue: number;

  @ApiProperty({ example: 592.37 })
  pendingAmount: number;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;
}

export class DetailClient {
  @ApiProperty()
  name: string;

  @ApiProperty()
  taxId: string;

  @ApiPropertyOptional({ example: '11987654321' })
  phone?: string;

  @ApiPropertyOptional({ type: ClientAddress })
  address?: ClientAddress;
}

/**
 * Detalhe da PARCELA: contrato, cliente, responsável e o histórico completo de tarefas
 * da parcela — cada uma com a sua interação.
 */
export class InstallmentDetail {
  @ApiProperty({ type: DetailInstallment })
  installment: DetailInstallment;

  @ApiProperty({ type: DetailContract })
  contract: DetailContract;

  @ApiProperty({ type: DetailClient })
  client: DetailClient;

  @ApiProperty({
    type: ContractResponsible,
    nullable: true,
    description:
      'Responsável atual da parcela (assigned_to da tarefa mais recente).',
  })
  responsible: ContractResponsible | null;

  @ApiProperty({
    type: [TaskHistoryItem],
    description:
      'Todas as tarefas da parcela (mais recente primeiro), cada uma com sua interação.',
  })
  tasks: TaskHistoryItem[];
}
