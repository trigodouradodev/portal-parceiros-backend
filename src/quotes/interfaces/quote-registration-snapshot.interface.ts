import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  CreditPurpose,
  EconomicActivityCategory,
  Gender,
  GovernmentProgram,
  HousingStatus,
  MaritalStatus,
  ResidenceDuration,
} from '../enums/quote-registration.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteRegistrationSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.REGISTRATION] })
  step: QuoteDraftStep.REGISTRATION;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  isRenegotiation: boolean;

  @ApiProperty({ enum: Gender })
  gender: Gender;

  @ApiProperty()
  secondaryDocument: string;

  @ApiProperty()
  profession: string;

  @ApiProperty({ enum: EconomicActivityCategory, isArray: true })
  economicActivityCategories: EconomicActivityCategory[];

  @ApiPropertyOptional()
  economicActivityOther?: string;

  @ApiProperty({ enum: MaritalStatus })
  maritalStatus: MaritalStatus;

  @ApiPropertyOptional()
  spouseDocument?: string;

  @ApiProperty()
  childrenCount: number;

  @ApiProperty()
  householdMembers: number;

  @ApiProperty({ enum: HousingStatus })
  housingStatus: HousingStatus;

  @ApiProperty({ enum: ResidenceDuration })
  residenceDuration: ResidenceDuration;

  @ApiProperty({ enum: GovernmentProgram, isArray: true })
  governmentPrograms: GovernmentProgram[];

  @ApiProperty()
  ownsVehicle: boolean;

  @ApiPropertyOptional()
  vehicleFinanced?: boolean;

  @ApiProperty({ enum: CreditPurpose })
  creditPurpose: CreditPurpose;
}
