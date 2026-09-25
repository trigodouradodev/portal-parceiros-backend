import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  ActivityDuration,
  FamilyRelationship,
  IncomeEntryRole,
  IncomeSource,
} from '../enums/quote-income.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import {
  BusinessActivityBranch,
  BusinessActivitySubcategory,
  EconomicActivityCategory,
} from '../enums/quote-registration.enum';

export class QuoteIncomeEntrySnapshot {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: IncomeEntryRole })
  role: IncomeEntryRole;

  @ApiProperty({ enum: EconomicActivityCategory })
  economicActivity: EconomicActivityCategory;

  @ApiPropertyOptional()
  economicActivityOther?: string;

  @ApiPropertyOptional()
  profession?: string;

  @ApiPropertyOptional({ enum: BusinessActivityBranch })
  businessActivityBranch?: BusinessActivityBranch;

  @ApiPropertyOptional({ enum: BusinessActivitySubcategory })
  businessActivitySubcategory?: BusinessActivitySubcategory;

  @ApiProperty({ enum: ActivityDuration })
  activityDuration: ActivityDuration;

  @ApiProperty({ enum: IncomeSource })
  source: IncomeSource;

  @ApiProperty()
  amount: number;

  @ApiPropertyOptional({ enum: FamilyRelationship })
  familyRelationship?: FamilyRelationship;
}

export class QuoteIncomeSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.INCOME] })
  step: QuoteDraftStep.INCOME;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ example: 1 })
  incomeModelVersion: number;

  @ApiProperty({ type: [QuoteIncomeEntrySnapshot] })
  incomes: QuoteIncomeEntrySnapshot[];
}
