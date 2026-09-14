import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteDraftAddressPrefill {
  @ApiProperty()
  zipCode: string;

  @ApiProperty()
  streetName: string;

  @ApiProperty()
  streetNumber: string;

  @ApiProperty()
  streetComplement: string;

  @ApiProperty()
  streetDistrict: string;

  @ApiProperty()
  city: string;

  @ApiProperty({ enum: BrazilState })
  state: string;

  @ApiPropertyOptional({ nullable: true })
  referencePoint?: string | null;
}

/** Draft recém-criado com os campos reaproveitados da simulação. */
export class QuoteDraftSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  simulationId: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT], example: QuoteStatus.DRAFT })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ example: '2026-09-02T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '52998224725' })
  document: string;

  @ApiProperty({ example: '1990-05-20' })
  birthDate: string;

  @ApiProperty({ example: 'maria@email.com' })
  email: string;

  @ApiProperty({ example: '11987654321' })
  telephone: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'GIRO' })
  productName: string;

  @ApiProperty({ example: 0.0339 })
  interestRate: number;

  @ApiProperty({ example: 5000 })
  financeAmount: number;

  @ApiProperty({ example: 10 })
  installmentNumbers: number;

  @ApiProperty({ example: '2026-09-10' })
  firstInstallmentDate: string;

  @ApiProperty({ example: 612.34 })
  installmentAmount: number;

  @ApiPropertyOptional({ example: 6123.4 })
  totalAmountOwed?: number;

  @ApiPropertyOptional({ type: QuoteDraftAddressPrefill })
  address?: QuoteDraftAddressPrefill;
}
