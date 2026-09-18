import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ActivityDuration,
  AvailableIncomeProof,
  IncomeSource,
} from '../enums/quote-income.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class QuoteAdditionalIncomeDto {
  @ApiProperty({ enum: IncomeSource })
  @IsEnum(IncomeSource)
  source: IncomeSource;

  @ApiProperty({ example: 800, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class SaveQuoteIncomeDto {
  @ApiPropertyOptional({
    example: '11222333000181',
    description: 'CNPJ opcional, com ou sem máscara.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(14)
  @MaxLength(18)
  businessDocument?: string;

  @ApiProperty({ enum: ActivityDuration })
  @IsEnum(ActivityDuration)
  activityDuration: ActivityDuration;

  @ApiProperty({ example: 3500, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declaredMonthlyIncome: number;

  @ApiProperty({ enum: IncomeSource })
  @IsEnum(IncomeSource)
  incomeSource: IncomeSource;

  @ApiProperty()
  @IsBoolean()
  hasMultipleIncomeSources: boolean;

  @ApiProperty({ type: [QuoteAdditionalIncomeDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteAdditionalIncomeDto)
  additionalIncomes: QuoteAdditionalIncomeDto[];

  @ApiProperty({ enum: AvailableIncomeProof })
  @IsEnum(AvailableIncomeProof)
  availableIncomeProof: AvailableIncomeProof;
}
