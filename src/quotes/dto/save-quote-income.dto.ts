import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ActivityDuration,
  FamilyRelationship,
  IncomeEntryRole,
  IncomeSource,
} from '../enums/quote-income.enum';
import {
  BusinessActivityBranch,
  BusinessActivitySubcategory,
  EconomicActivityCategory,
  requiresProfession,
} from '../enums/quote-registration.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class QuoteIncomeEntryDto {
  @ApiProperty({ example: 'income-1' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id: string;

  @ApiProperty({ enum: IncomeEntryRole })
  @IsEnum(IncomeEntryRole)
  role: IncomeEntryRole;

  @ApiProperty({ enum: EconomicActivityCategory })
  @IsEnum(EconomicActivityCategory)
  economicActivity: EconomicActivityCategory;

  @ApiPropertyOptional({ example: 'Artesanato' })
  @ValidateIf(
    (dto: QuoteIncomeEntryDto) =>
      dto.economicActivity === EconomicActivityCategory.OTHER,
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  economicActivityOther?: string;

  @ApiPropertyOptional({ example: 'Comerciante' })
  @ValidateIf((dto: QuoteIncomeEntryDto) =>
    requiresProfession([dto.economicActivity]),
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  profession?: string;

  @ApiPropertyOptional({
    enum: BusinessActivityBranch,
    description:
      'Não exigido para CLT, Servidor Público, Aposentado/Pensionista e ' +
      'Desempregado — quem não tem negócio/atividade autônoma em curso.',
  })
  @ValidateIf(
    (dto: QuoteIncomeEntryDto) => !requiresProfession([dto.economicActivity]),
  )
  @IsEnum(BusinessActivityBranch)
  businessActivityBranch?: BusinessActivityBranch;

  @ApiPropertyOptional({ enum: BusinessActivitySubcategory })
  @ValidateIf(
    (dto: QuoteIncomeEntryDto) => !requiresProfession([dto.economicActivity]),
  )
  @IsEnum(BusinessActivitySubcategory)
  businessActivitySubcategory?: BusinessActivitySubcategory;

  @ApiProperty({ enum: ActivityDuration })
  @IsEnum(ActivityDuration)
  activityDuration: ActivityDuration;

  @ApiProperty({ example: 3500, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: IncomeSource })
  @IsEnum(IncomeSource)
  source: IncomeSource;

  @ApiPropertyOptional({ enum: FamilyRelationship })
  @ValidateIf(
    (dto: QuoteIncomeEntryDto) => dto.source === IncomeSource.FAMILY_INCOME,
  )
  @IsEnum(FamilyRelationship)
  familyRelationship?: FamilyRelationship;
}

export class SaveQuoteIncomeDto {
  @ApiProperty({ type: [QuoteIncomeEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => QuoteIncomeEntryDto)
  incomes: QuoteIncomeEntryDto[];
}
