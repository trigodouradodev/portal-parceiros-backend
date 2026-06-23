import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientAddress } from './overdue-collection.interface';

/** Origem do responsável pela parcela. */
export enum ResponsibleType {
  COLLECTION_AGENT = 'COLLECTION_AGENT',
  CONSULTANT = 'CONSULTANT',
}

/**
 * Responsável pela parcela: o agente de cobrança do contrato; na ausência,
 * cai para o consultor. `type` indica qual dos dois foi retornado.
 */
export class ContractResponsible {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({
    enum: ResponsibleType,
    example: ResponsibleType.COLLECTION_AGENT,
  })
  type: ResponsibleType;
}

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

  @ApiProperty({ example: 'Maria Souza', description: 'Nome do cliente.' })
  clientName: string;

  @ApiProperty({
    example: '12345678900',
    description: 'Documento do cliente (CPF/CNPJ).',
  })
  clientTaxId: string;

  @ApiPropertyOptional({
    type: ClientAddress,
    description:
      'Endereço do cliente (primário; fallback para o mais recente).',
  })
  address?: ClientAddress;

  @ApiPropertyOptional({
    type: ContractResponsible,
    description:
      'Responsável pela parcela: agente de cobrança ou, na ausência, o consultor (ver `type`).',
  })
  responsible?: ContractResponsible;

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
