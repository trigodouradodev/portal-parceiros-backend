import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CreditPurpose,
  EconomicActivityCategory,
  Gender,
  GovernmentProgram,
  HousingStatus,
  MaritalStatus,
  ResidenceDuration,
} from '../enums/quote-registration.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SaveQuoteRegistrationDto {
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

  @ApiProperty({ example: 'Comerciante' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  profession: string;

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
