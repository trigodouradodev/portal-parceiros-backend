import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  ExpenseCategory,
  LoanCategory,
  LoanFrequency,
  LoanInstitution,
} from '../enums/quote-financial.enum';
import { QuoteStatus } from '../enums/quote-status.enum';

export class QuoteExpenseSnapshot {
  @ApiProperty({ enum: ExpenseCategory })
  category: ExpenseCategory;

  @ApiProperty()
  amount: number;

  @ApiPropertyOptional()
  description?: string;
}

export class QuoteLoanSnapshot {
  @ApiProperty()
  installmentAmount: number;

  @ApiProperty({ enum: LoanFrequency })
  frequency: LoanFrequency;

  @ApiProperty({ enum: LoanInstitution })
  institution: LoanInstitution;

  @ApiProperty({ enum: LoanCategory })
  category: LoanCategory;

  @ApiPropertyOptional()
  description?: string;
}

export class QuoteFinancialSnapshot {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [QuoteStatus.DRAFT] })
  status: QuoteStatus.DRAFT;

  @ApiProperty({ enum: [QuoteDraftStep.FINANCIAL] })
  step: QuoteDraftStep.FINANCIAL;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [QuoteExpenseSnapshot] })
  expenses: QuoteExpenseSnapshot[];

  @ApiProperty({ type: [QuoteLoanSnapshot] })
  loans: QuoteLoanSnapshot[];
}
