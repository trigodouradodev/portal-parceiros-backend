import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActivityTaskSummary,
  ClientInfo,
} from './overdue-collection.interface';
import { ContractResponsible } from './responsible.interface';

/** Autor de um registro (follow-up ou interação de cobrança). */
export class HistoryAuthor {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;
}

/** Ponto de geolocalização (visita) — usado em follow-ups e interações. */
export class Geolocation {
  @ApiProperty({ example: -23.55052 })
  latitude: number;

  @ApiProperty({ example: -46.633308 })
  longitude: number;
}

/** Item do histórico de follow-up (Preventivo) da parcela. */
export class FollowUpHistoryItem {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'promise_to_pay' })
  status: string;

  @ApiPropertyOptional({ example: 'Cliente prometeu pagar na sexta.' })
  note?: string;

  @ApiPropertyOptional({
    example: 'will_pay_on_date',
    description: 'Resultado esperado do contato.',
  })
  expectedResult?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Previsão de pagamento informada no follow-up.',
  })
  paymentForecast?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: HistoryAuthor })
  author: HistoryAuthor;

  @ApiPropertyOptional({ type: Geolocation })
  geolocation?: Geolocation;
}

/** Item do histórico de interações (Cobrança) da parcela. */
export class ActivityInteractionHistoryItem {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'client_visit' })
  channel: string;

  @ApiProperty({ example: 'no_return' })
  result: string;

  @ApiPropertyOptional()
  observation?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  promiseDate?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: HistoryAuthor })
  author: HistoryAuthor;

  @ApiPropertyOptional({ type: Geolocation })
  geolocation?: Geolocation;
}

/** Histórico da régua de cobrança (activity) da parcela. */
export class ActivityHistory {
  @ApiProperty({
    type: [ActivityTaskSummary],
    description:
      'Tasks da régua, mais recente primeiro (a 1ª é a tarefa atual).',
  })
  tasks: ActivityTaskSummary[];

  @ApiProperty({
    type: [ActivityInteractionHistoryItem],
    description: 'Interações registradas, mais recente primeiro.',
  })
  interactions: ActivityInteractionHistoryItem[];
}

/** Dados do contrato no detalhe. */
export class ContractDetailInfo {
  @ApiProperty()
  id: string;

  @ApiProperty()
  number: string;

  @ApiProperty({ example: 12 })
  totalInstallments: number;

  @ApiProperty({ example: 12000.0, description: 'Valor total do contrato.' })
  totalAmount: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2025-01-10',
    description: 'Início do contrato (desembolso).',
  })
  startDate?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2025-12-10',
    description: 'Fim do contrato (vencimento da última parcela).',
  })
  endDate?: Date;
}

/** A parcela selecionada, no detalhe. */
export class InstallmentDetailInfo {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  number: number;

  @ApiProperty({ example: '3/12', description: 'number/totalInstallments.' })
  label: string;

  @ApiProperty({ type: String, format: 'date', example: '2025-10-16' })
  dueDate: Date;

  @ApiProperty({ example: 1000.0 })
  totalAmount: number;

  @ApiProperty({ example: 592.37 })
  pendingAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;
}

/** Detalhe de uma parcela: contrato + cliente + responsável + régua + follow-ups. */
export class CollectionDetail {
  @ApiProperty({ type: ContractDetailInfo })
  contract: ContractDetailInfo;

  @ApiProperty({ type: ClientInfo })
  client: ClientInfo;

  @ApiPropertyOptional({ type: ContractResponsible })
  responsible?: ContractResponsible;

  @ApiProperty({ type: InstallmentDetailInfo })
  installment: InstallmentDetailInfo;

  @ApiProperty({
    type: ActivityHistory,
    description: 'Cobrança: tasks + interações da régua dessa parcela.',
  })
  activity: ActivityHistory;

  @ApiProperty({
    type: [FollowUpHistoryItem],
    description: 'Preventivo: histórico de follow-up da parcela.',
  })
  followups: FollowUpHistoryItem[];
}
