import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FollowUpAuthor {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;
}

export class FollowUpGeolocation {
  @ApiProperty({ example: -23.55052 })
  latitude: number;

  @ApiProperty({ example: -46.633308 })
  longitude: number;
}

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

  @ApiProperty({ type: FollowUpAuthor })
  author: FollowUpAuthor;

  @ApiPropertyOptional({ type: FollowUpGeolocation })
  geolocation?: FollowUpGeolocation;
}

export class CollectionInstallmentDetail {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3 })
  installmentNumber: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2025-10-16',
    description: 'Vencimento da parcela (data, sem hora).',
  })
  dueDate: Date;

  @ApiProperty({ example: 1000.0, description: 'Valor total da parcela.' })
  totalAmount: number;

  @ApiProperty({ example: 592.37, description: 'Saldo em aberto da parcela.' })
  pendingAmount: number;

  @ApiProperty({ example: 'not_paid' })
  status: string;
}

export class CollectionDetail {
  @ApiProperty()
  contractId: string;

  @ApiProperty()
  contractNumber: string;

  @ApiProperty({ example: 12000.0, description: 'Valor total do contrato.' })
  contractTotalAmount: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2025-01-10',
    description: 'Início do contrato (data de desembolso).',
  })
  contractStartDate?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2025-12-10',
    description: 'Fim do contrato (vencimento da última parcela).',
  })
  contractEndDate?: Date;

  @ApiProperty({
    example: 12,
    description: 'Total de parcelas do contrato (para "parcela X de Y").',
  })
  totalInstallments: number;

  @ApiProperty({ type: CollectionInstallmentDetail })
  installment: CollectionInstallmentDetail;

  @ApiProperty({ type: [FollowUpHistoryItem] })
  followUps: FollowUpHistoryItem[];
}
