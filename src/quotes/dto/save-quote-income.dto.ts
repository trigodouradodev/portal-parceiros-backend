import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ActivityDuration,
  AvailableIncomeProof,
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
  @ApiProperty({ enum: EconomicActivityCategory, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsEnum(EconomicActivityCategory, { each: true })
  economicActivityCategories: EconomicActivityCategory[];

  @ApiPropertyOptional({ example: 'Artesanato' })
  @ValidateIf((dto: SaveQuoteIncomeDto) =>
    dto.economicActivityCategories?.includes(EconomicActivityCategory.OTHER),
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  economicActivityOther?: string;

  @ApiPropertyOptional({
    example: 'Comerciante',
    description:
      'Exigido para CLT, Servidor Público, Aposentado/Pensionista e Desempregado.',
  })
  @ValidateIf((dto: SaveQuoteIncomeDto) =>
    requiresProfession(dto.economicActivityCategories ?? []),
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  profession?: string;

  @ApiProperty({
    enum: BusinessActivityBranch,
    description: 'Ramo de atividade do cliente.',
  })
  @IsEnum(BusinessActivityBranch)
  businessActivityBranch: BusinessActivityBranch;

  @ApiProperty({
    enum: BusinessActivitySubcategory,
    description: 'Subcategoria pertencente ao ramo de atividade selecionado.',
  })
  @IsEnum(BusinessActivitySubcategory)
  businessActivitySubcategory: BusinessActivitySubcategory;

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

  @ApiPropertyOptional({
    enum: AvailableIncomeProof,
    description:
      'Legado: mantido apenas para compatibilidade com dados já salvos. O ' +
      'comprovante de renda agora é sempre obrigatório na Documentação, ' +
      'independentemente deste campo.',
  })
  @IsOptional()
  @IsEnum(AvailableIncomeProof)
  availableIncomeProof?: AvailableIncomeProof;
}
