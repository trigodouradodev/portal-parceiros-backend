import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BusinessActivityBranch,
  BusinessActivitySubcategory,
  CreditPurpose,
  EconomicActivityCategory,
  Gender,
  GovernmentProgram,
  HousingStatus,
  MaritalStatus,
  ResidenceDuration,
  requiresProfession,
} from '../enums/quote-registration.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SaveQuoteRegistrationDto {
  @ApiProperty({ example: 'Maria Souza' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: '00820787264',
    description:
      'CPF somente para compatibilidade com o formulário; não é alterado neste endpoint.',
  })
  @IsOptional()
  @IsString()
  document?: string;

  @ApiProperty({ example: '1990-05-20', format: 'date' })
  @IsDateString()
  birthDate: string;

  @ApiProperty({ example: 'maria@email.com', format: 'email' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '11987654321' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  telephone: string;

  @ApiProperty()
  @IsBoolean()
  isRenegotiation: boolean;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: '123456789' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  secondaryDocument: string;

  @ApiPropertyOptional({
    example: 'Comerciante',
    description:
      'Cargo/ocupação do cliente — exigido para CLT, Servidor Público, ' +
      'Aposentado/Pensionista e Desempregado. Pra Empresário e Autônomo, ' +
      'o Ramo de atividade e a Subcategoria já descrevem a atividade de ' +
      'forma estruturada.',
  })
  @ValidateIf((dto: SaveQuoteRegistrationDto) =>
    requiresProfession(dto.economicActivityCategories ?? []),
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  profession?: string;

  @ApiProperty({
    enum: BusinessActivityBranch,
    description:
      'Ramo de atividade do cliente — dado estruturado equivalente ao ' +
      'subgrupo ocupacional do Analytics, coletado na origem em vez de ' +
      'classificado por regex sobre a profissão em texto livre.',
  })
  @IsEnum(BusinessActivityBranch)
  businessActivityBranch: BusinessActivityBranch;

  @ApiProperty({
    enum: BusinessActivitySubcategory,
    description:
      'Subcategoria dentro do ramo de atividade — desambigua o ramo ' +
      '(ex.: pedreiro vs. eletricista em Construção Civil). Sempre exigida ' +
      'junto de businessActivityBranch.',
  })
  @IsEnum(BusinessActivitySubcategory)
  businessActivitySubcategory: BusinessActivitySubcategory;

  @ApiProperty({ enum: EconomicActivityCategory, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsEnum(EconomicActivityCategory, { each: true })
  economicActivityCategories: EconomicActivityCategory[];

  @ApiPropertyOptional({ example: 'Artesanato' })
  @ValidateIf((dto: SaveQuoteRegistrationDto) =>
    dto.economicActivityCategories?.includes(EconomicActivityCategory.OTHER),
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  economicActivityOther?: string;

  @ApiProperty({ enum: MaritalStatus })
  @IsEnum(MaritalStatus)
  maritalStatus: MaritalStatus;

  @ApiPropertyOptional({ example: '52998224725' })
  @ValidateIf(
    (dto: SaveQuoteRegistrationDto) =>
      dto.maritalStatus === MaritalStatus.MARRIED ||
      dto.maritalStatus === MaritalStatus.STABLE_UNION,
  )
  @Transform(trim)
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  spouseDocument?: string;

  @ApiProperty({ minimum: 0, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childrenCount: number;

  @ApiProperty({ minimum: 1, example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  householdMembers: number;

  @ApiProperty({ enum: HousingStatus })
  @IsEnum(HousingStatus)
  housingStatus: HousingStatus;

  @ApiProperty({ enum: ResidenceDuration })
  @IsEnum(ResidenceDuration)
  residenceDuration: ResidenceDuration;

  @ApiProperty({ enum: GovernmentProgram, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsEnum(GovernmentProgram, { each: true })
  governmentPrograms: GovernmentProgram[];

  @ApiProperty()
  @IsBoolean()
  ownsVehicle: boolean;

  @ApiPropertyOptional()
  @ValidateIf((dto: SaveQuoteRegistrationDto) => dto.ownsVehicle)
  @IsBoolean()
  vehicleFinanced?: boolean;

  @ApiProperty({ enum: CreditPurpose })
  @IsEnum(CreditPurpose)
  creditPurpose: CreditPurpose;
}
