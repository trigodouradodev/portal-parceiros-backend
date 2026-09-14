import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BrazilState } from '../../common/brazil-state.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export class QuoteGeolocationDto {
  @ApiProperty({ example: -23.55052 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: -46.633308 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: '15m' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  precision: string;
}

export class SaveQuoteAddressDto {
  @ApiProperty({ example: '01001-000' })
  @Transform(trim)
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'zipCode deve ser um CEP válido.',
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

  @ApiProperty({ example: 'Próximo à estação Sé' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  referencePoint: string;

  @ApiPropertyOptional({ type: QuoteGeolocationDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteGeolocationDto)
  geolocation?: QuoteGeolocationDto | null;
}
