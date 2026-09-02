import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  CustomerRelationshipDuration,
  CustomerRelationshipOrigin,
  PartnerAssessment,
} from '../enums/quote-partner-opinion.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuotePartnerOpinionSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.PARTNER_OPINION] })
  step: QuoteDraftStep.PARTNER_OPINION;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ enum: CustomerRelationshipDuration })
  relationshipDuration: CustomerRelationshipDuration;

  @ApiProperty({ enum: CustomerRelationshipOrigin })
  relationshipOrigin: CustomerRelationshipOrigin;

  @ApiPropertyOptional()
  relationshipOriginOther?: string;

  @ApiPropertyOptional()
  referrerDocument?: string;

  @ApiProperty({ enum: PartnerAssessment })
  assessment: PartnerAssessment;

  @ApiProperty()
  hasInformalDebtSigns: boolean;

  @ApiProperty()
  hasFinancialUrgencySigns: boolean;

  @ApiProperty()
  opinion: string;
}
