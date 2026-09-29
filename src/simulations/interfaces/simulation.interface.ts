import { ApiProperty } from '@nestjs/swagger';
import { SimulationStatus } from '../enums/simulation-status.enum';

/** Snapshot persistido da simulação. Campos em camelCase EN. */
export class SimulationSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-08-26T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ enum: SimulationStatus, example: SimulationStatus.AVAILABLE })
  status: SimulationStatus;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '1990-05-20' })
  birthDate: string;

  @ApiProperty({ example: 'maria@email.com' })
  email: string;

  @ApiProperty({ example: '11987654321' })
  telephone: string;

  @ApiProperty({ example: '52998224725' })
  document: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'GIRO' })
  productName: string;

  @ApiProperty({ example: 5000 })
  amount: number;

  @ApiProperty({ example: 10 })
  installments: number;

  @ApiProperty({ example: '2026-09-10' })
  firstInstallmentDate: string;

  @ApiProperty({ example: 1560.32 })
  installmentAmount: number;

  @ApiProperty({
    required: false,
    example: 500,
    description:
      'Prêmio do seguro prestamista cotado na Caburé. Ausente quando o ' +
      'cliente não é elegível ou a cotação falhou nesta simulação.',
  })
  insurancePremium?: number;

  @ApiProperty({
    required: false,
    example: 742.56,
    description:
      'Parcela COM seguro, já financiada com juros pela Celcoin (mesmo ' +
      'mecanismo da TAC) — installmentAmount já é o valor SEM seguro; ' +
      'este campo é o valor alternativo a exibir quando o seguro está ' +
      'incluso. Ausente quando insurancePremium também está ausente.',
  })
  installmentAmountWithInsurance?: number;
}
