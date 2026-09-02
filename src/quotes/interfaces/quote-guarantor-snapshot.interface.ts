import { ApiProperty } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { GuarantorRelationship } from '../enums/quote-guarantor.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteGuarantorAddressSnapshot {
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
  state: BrazilState;
}

export class QuoteGuarantorSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.GUARANTOR] })
  step: QuoteDraftStep.GUARANTOR;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  name: string;

  @ApiProperty()
  document: string;

  @ApiProperty({ format: 'date' })
  birthDate: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ example: '+5511987654321' })
  telephone: string;

  @ApiProperty({ type: QuoteGuarantorAddressSnapshot })
  address: QuoteGuarantorAddressSnapshot;

  @ApiProperty({ enum: GuarantorRelationship })
  relationship: GuarantorRelationship;
}
