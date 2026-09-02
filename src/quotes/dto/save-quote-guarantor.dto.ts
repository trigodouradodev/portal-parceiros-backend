import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BrazilState } from '../../common/brazil-state.enum';
import { GuarantorRelationship } from '../enums/quote-guarantor.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export class QuoteGuarantorAddressDto {
  @ApiProperty({ example: '01001-000' })
  @Transform(trim)
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'address.zipCode deve ser um CEP válido.',
  })
  zipCode: string;

  @ApiProperty({ example: 'Praça da Sé' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  streetName: string;

  @ApiProperty({ example: '100' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  streetNumber: string;

  @ApiPropertyOptional({ example: 'Apto 12' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(255)
  streetComplement?: string;

  @ApiProperty({ example: 'Sé' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  streetDistrict: string;

  @ApiProperty({ example: 'São Paulo' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  city: string;

  @ApiProperty({ enum: BrazilState })
  @IsEnum(BrazilState)
  state: BrazilState;
}

export class SaveQuoteGuarantorDto {
  @ApiProperty({ example: 'João Souza' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '390.533.447-05' })
  @Transform(trim)
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  document: string;

  @ApiProperty({ example: '1988-03-15', format: 'date' })
  @Transform(trim)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDate deve estar no formato YYYY-MM-DD.',
  })
  birthDate: string;

  @ApiProperty({ example: 'joao@email.com', format: 'email' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '(11) 98765-4321' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  telephone: string;

  @ApiProperty({ type: QuoteGuarantorAddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => QuoteGuarantorAddressDto)
  address: QuoteGuarantorAddressDto;

  @ApiProperty({ enum: GuarantorRelationship })
  @IsEnum(GuarantorRelationship)
  relationship: GuarantorRelationship;
}
