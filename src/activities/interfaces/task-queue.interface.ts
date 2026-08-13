import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueueClient {
  @ApiProperty()
  name: string;

  @ApiProperty()
  taxId: string;

  @ApiPropertyOptional()
  phone?: string;
}

export class QueueContract {
  @ApiProperty()
  id: string;

  @ApiProperty()
  number: string;

  @ApiProperty({ example: 12 })
  totalInstallments: number;

  @ApiPropertyOptional()
  companyName?: string;
}

export class QueueInstallment {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  number: number;

  @ApiProperty({ example: '3/12' })
  label: string;

  @ApiProperty({ type: String, format: 'date' })
  dueDate: Date;

  @ApiProperty({ example: 15, description: 'CURRENT_DATE - due_date.' })
  daysOverdue: number;

  @ApiProperty({
    example: 592.37,
    description: 'Saldo em aberto (pending_amount).',
  })
  pendingAmount: number;

  @ApiProperty({
    example: 592.37,
    description:
      'TODO(RN-023): valor corrigido hoje (juros+correção). Hoje = pendingAmount cru.',
  })
  amountOverdue: number;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;
}

export class QueueLastInteraction {
  @ApiProperty({ example: 'no_response' })
  result: string;

  @ApiProperty({ example: 'call' })
  channel: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

/** Responsável (subordinado) pela tarefa. */
export class QueueAssignee {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'João Pereira' })
  name: string;
}

/** Um card da fila = uma tarefa de cobrança da parcela + contexto (só codes). */
export class QueueTaskCard {
  @ApiProperty({
    example: 2,
    description: 'Posição na fila (active = 1; locked segue contínuo).',
  })
  position: number;

  @ApiProperty()
  taskId: string;

  @ApiProperty({
    example: 'mid',
    description: 'Code do segmento (front resolve label/cor).',
  })
  segmentCode: string;

  @ApiProperty({
    example: 4,
    description: 'Prioridade do segmento (menor = topo).',
  })
  priority: number;

  @ApiProperty({
    example: 'firm',
    description: 'Code do tom: friendly | firm | severe.',
  })
  tone: string;

  @ApiProperty({ example: 'contact', description: 'contact | visit.' })
  taskType: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({
    description:
      'Executável agora: pertence ao segmento ativo do responsável (AUREA-319). ' +
      'Dentro do segmento ativo, qualquer pendente é executável — não só a recomendada.',
  })
  isActive: boolean;

  @ApiProperty({
    description:
      'É a tarefa sugerida (maior prioridade do segmento ativo) — usada pra ' +
      'destacar o card principal da fila. Só uma por responsável.',
  })
  isRecommended: boolean;

  @ApiProperty({
    type: QueueAssignee,
    nullable: true,
    description:
      'Responsável pela tarefa (subordinado). Gerente/Diretor usam p/ ver por parceiro.',
  })
  assignedTo: QueueAssignee | null;

  @ApiProperty({ type: String, format: 'date' })
  expireDate: Date;

  @ApiProperty()
  wasPostponed: boolean;

  @ApiProperty()
  wasRescheduled: boolean;

  @ApiProperty({ type: QueueClient })
  client: QueueClient;

  @ApiProperty({ type: QueueContract })
  contract: QueueContract;

  @ApiProperty({ type: QueueInstallment })
  installment: QueueInstallment;

  @ApiPropertyOptional({ type: QueueLastInteraction, nullable: true })
  lastInteraction?: QueueLastInteraction | null;
}

/** Totalizador por segmento (pros cabeçalhos de grupo). Conta as travadas, exclui o active. */
export class SegmentSummary {
  @ApiProperty({ example: 'mid' })
  code: string;

  @ApiProperty({ example: 4 })
  priority: number;

  @ApiProperty({
    example: 2,
    description: 'Nº de tarefas travadas nesse segmento.',
  })
  count: number;
}

export class LockedPagination {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 30 })
  limit: number;

  @ApiProperty({
    example: 136,
    description: 'Total de travadas (= counter menos o active).',
  })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

/** Lista paginada das tarefas travadas. */
export class LockedPage {
  @ApiProperty({ type: [QueueTaskCard] })
  items: QueueTaskCard[];

  @ApiProperty({ type: LockedPagination })
  pagination: LockedPagination;
}

/** Fila "Ações de hoje" do usuário logado (home). */
export class TodayQueue {
  @ApiProperty({
    type: QueueTaskCard,
    nullable: true,
    description:
      'A tarefa recomendada do viewer (parceiro) — maior prioridade do segmento ' +
      'ativo; null p/ gerente/diretor. Outras pendentes do mesmo segmento também ' +
      'são executáveis (ver isActive em locked.items).',
  })
  active: QueueTaskCard | null;

  @ApiProperty({
    example: 14,
    description: 'Total de ações pendentes de hoje ("Ações de hoje").',
  })
  counter: number;

  @ApiProperty({
    type: [SegmentSummary],
    description: 'Totalizadores por segmento (travadas).',
  })
  segments: SegmentSummary[];

  @ApiProperty({
    type: LockedPage,
    description: 'Demais pendências de hoje, paginadas.',
  })
  locked: LockedPage;

  @ApiProperty({
    type: [QueueTaskCard],
    description: 'Postergadas/reagendadas (reaparecem na data em expireDate).',
  })
  scheduled: QueueTaskCard[];

  @ApiProperty({
    type: [QueueTaskCard],
    description: 'Concluídas hoje ("Atividades concluídas").',
  })
  completedToday: QueueTaskCard[];
}
