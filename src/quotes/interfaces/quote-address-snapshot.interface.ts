import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteGeolocationSnapshot {
  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty()
  precision: string;
}

export class QuoteAddressSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.ADDRESS] })
  step: QuoteDraftStep.ADDRESS;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  zipCode: string;

  @ApiProperty()
  streetName: string;

  @ApiProperty()
  streetNumber: string;

  @ApiPropertyOptional()
  streetComplement?: string;

  @ApiProperty()
  streetDistrict: string;

  @ApiProperty()
  city: string;

  @ApiProperty({ enum: BrazilState })
  state: BrazilState;

  @ApiProperty()
  referencePoint: string;

  @ApiPropertyOptional({ type: QuoteGeolocationSnapshot })
  geolocation?: QuoteGeolocationSnapshot;
}
