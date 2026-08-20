import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DetailGuarantor } from '../../activities/interfaces/installment-detail.interface';
import { ClientInfo } from './overdue-collection.interface';
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

/** Dados do contrato no detalhe. */
export class ContractDetailInfo {
  @ApiProperty()
  id: string;

  @ApiProperty()
  number: string;

  @ApiProperty({
    example: 'disbursed',
    description:
      'Status bruto do contrato (contracts.status) — vocabulário controlado por integrações externas, não editável no portal.',
  })
  status: string;

  @ApiProperty({ example: 12 })
  totalInstallments: number;

  @ApiProperty({ example: 12000.0, description: 'Valor total do contrato.' })
  totalAmount: number;

  @ApiPropertyOptional({
    example: 12987.5,
    description: 'Valor total com IOF.',
  })
  totalWithIof?: number;

  @ApiPropertyOptional({ example: 987.5, description: 'Valor do IOF.' })
  iofAmount?: number;

  @ApiPropertyOptional({
    example: 150.0,
    description: 'TAC (Tarifa de Abertura de Crédito) da proposta de origem.',
  })
  tacAmount?: number;

  @ApiPropertyOptional({
    example: 'CRÉDITO PESSOAL',
    description: 'Nome do produto financeiro da proposta de origem.',
  })
  productName?: string;

  @ApiPropertyOptional({
    example: 'CELCOIN',
    description: 'Empresa/origem do contrato.',
  })
  companyName?: string;

  @ApiPropertyOptional({
    example: 'Maria Souza',
    description:
      'Consultor responsável pela proposta de origem (pode diferir do consultor atual do contrato, se reatribuído).',
  })
  originationConsultantName?: string;

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

/** Item do histórico de mudança de status do contrato. */
export class ContractStatusHistoryItem {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'pending' })
  oldStatus: string;

  @ApiProperty({ example: 'disbursed' })
  newStatus: string;

  @ApiPropertyOptional({ example: 'Confirmação de desembolso via webhook.' })
  reason?: string;

  @ApiProperty({ example: 'Maria Souza' })
  changedByName: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
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
    type: [FollowUpHistoryItem],
    description: 'Preventivo: histórico de follow-up da parcela.',
  })
  followups: FollowUpHistoryItem[];

  @ApiPropertyOptional({
    type: DetailGuarantor,
    nullable: true,
    description:
      'Avalista da proposta de origem (quotes.guarantor, JSON sem schema fixo — null quando ausente/vazio).',
  })
  guarantor?: DetailGuarantor | null;

  @ApiProperty({
    type: [ContractStatusHistoryItem],
    description: 'Histórico de mudanças de status do contrato.',
  })
  statusHistory: ContractStatusHistoryItem[];
}
