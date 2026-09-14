import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ActivityDuration,
  AvailableIncomeProof,
  IncomeSource,
} from '../enums/quote-income.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

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

  @ApiPropertyOptional({ example: 800, minimum: 0.01 })
  @ValidateIf((dto: SaveQuoteIncomeDto) => dto.hasMultipleIncomeSources)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  secondaryIncome?: number;

  @ApiProperty({ enum: AvailableIncomeProof })
  @IsEnum(AvailableIncomeProof)
  availableIncomeProof: AvailableIncomeProof;
}
