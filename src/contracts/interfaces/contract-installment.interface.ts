import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Status derivado pra exibição na lista de parcelas da Carteira (AUREA-346). */
export type ContractInstallmentDisplayStatus =
  | 'paid'
  | 'overdue'
  | 'due_today'
  | 'upcoming';

export class ContractInstallmentItem {
  @ApiProperty({ example: 3 })
  number: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-08-10' })
  dueDate: Date;

  @ApiProperty({ example: 500.0 })
  totalAmount: number;

  @ApiProperty({ example: 120.5, description: 'Saldo pendente da parcela.' })
  pendingAmount: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-08-09',
    description: 'Data em que a parcela foi paga, quando aplicável.',
  })
  paymentDate?: Date;

  @ApiProperty({
    enum: ['paid', 'overdue', 'due_today', 'upcoming'],
    example: 'overdue',
    description: 'paga / atrasada / vence hoje / a vencer.',
  })
  displayStatus: ContractInstallmentDisplayStatus;
}

/** Todas as parcelas de um contrato, pra tela de lista da Carteira (AUREA-346). */
export class ContractInstallmentsList {
  @ApiProperty({ type: [ContractInstallmentItem] })
  items: ContractInstallmentItem[];
}
