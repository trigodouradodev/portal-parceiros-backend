import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ExpenseCategory,
  LoanCategory,
  LoanFrequency,
  LoanInstitution,
} from '../enums/quote-financial.enum';

const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export class QuoteExpenseDto {
  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiProperty({ example: 850, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'Aluguel da residência' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class QuoteLoanDto {
  @ApiProperty({ example: 420.5, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  installmentAmount: number;

  @ApiProperty({ enum: LoanFrequency })
  @IsEnum(LoanFrequency)
  frequency: LoanFrequency;

  @ApiProperty({ enum: LoanInstitution })
  @IsEnum(LoanInstitution)
  institution: LoanInstitution;

  @ApiProperty({ enum: LoanCategory })
  @IsEnum(LoanCategory)
  category: LoanCategory;

  @ApiPropertyOptional({ example: 'Empréstimo para capital de giro' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class SaveQuoteFinancialDto {
  @ApiProperty({ type: [QuoteExpenseDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteExpenseDto)
  expenses: QuoteExpenseDto[];

  @ApiProperty({ type: [QuoteLoanDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLoanDto)
  loans: QuoteLoanDto[];
}
