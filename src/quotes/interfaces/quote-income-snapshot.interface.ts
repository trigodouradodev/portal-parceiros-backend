import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  ActivityDuration,
  AvailableIncomeProof,
  IncomeSource,
} from '../enums/quote-income.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteAdditionalIncomeSnapshot {
  @ApiProperty({ enum: IncomeSource })
  source: IncomeSource;

  @ApiProperty()
  amount: number;
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

  @ApiPropertyOptional()
  businessDocument?: string;

  @ApiProperty({ enum: ActivityDuration })
  activityDuration: ActivityDuration;

  @ApiProperty()
  declaredMonthlyIncome: number;

  @ApiProperty({ enum: IncomeSource })
  incomeSource: IncomeSource;

  @ApiProperty()
  hasMultipleIncomeSources: boolean;

  @ApiProperty({ type: [QuoteAdditionalIncomeSnapshot] })
  additionalIncomes: QuoteAdditionalIncomeSnapshot[];

  @ApiProperty({ enum: AvailableIncomeProof })
  availableIncomeProof: AvailableIncomeProof;
}
