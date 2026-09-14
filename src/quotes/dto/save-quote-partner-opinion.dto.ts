import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CustomerRelationshipDuration,
  CustomerRelationshipOrigin,
  PartnerAssessment,
} from '../enums/quote-partner-opinion.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SaveQuotePartnerOpinionDto {
  @ApiProperty({ enum: CustomerRelationshipDuration })
  @IsEnum(CustomerRelationshipDuration)
  relationshipDuration: CustomerRelationshipDuration;

  @ApiProperty({ enum: CustomerRelationshipOrigin })
  @IsEnum(CustomerRelationshipOrigin)
  relationshipOrigin: CustomerRelationshipOrigin;

  @ApiPropertyOptional({ example: 'Feira de empreendedores do bairro' })
  @ValidateIf(
    (dto: SaveQuotePartnerOpinionDto) =>
      dto.relationshipOrigin === CustomerRelationshipOrigin.OTHER,
  )
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  relationshipOriginOther?: string;

  @ApiPropertyOptional({ example: '529.982.247-25' })
  @ValidateIf(
    (dto: SaveQuotePartnerOpinionDto) =>
      dto.relationshipOrigin ===
      CustomerRelationshipOrigin.AUREA_CUSTOMER_REFERRAL,
  )
  @Transform(trim)
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  referrerDocument?: string;

  @ApiProperty({ enum: PartnerAssessment })
  @IsEnum(PartnerAssessment)
  assessment: PartnerAssessment;

  @ApiProperty()
  @IsBoolean()
  hasInformalDebtSigns: boolean;

  @ApiProperty()
  @IsBoolean()
  hasFinancialUrgencySigns: boolean;

  @ApiProperty({ example: 'Cliente conhecido e com atividade estável.' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  opinion: string;
}
