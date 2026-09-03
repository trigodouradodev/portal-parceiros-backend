import { ApiProperty } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';

export class ReverseGeocodedAddress {
  @ApiProperty({ example: '01001000', nullable: true })
  zipCode: string | null;

  @ApiProperty({ example: 'Praça da Sé', nullable: true })
  streetName: string | null;

  @ApiProperty({ example: '100', nullable: true })
  streetNumber: string | null;

  @ApiProperty({ example: 'Bloco A', nullable: true })
  streetComplement: string | null;

  @ApiProperty({ example: 'Sé', nullable: true })
  streetDistrict: string | null;

  @ApiProperty({ example: 'São Paulo', nullable: true })
  city: string | null;

  @ApiProperty({ enum: BrazilState, nullable: true })
  state: BrazilState | null;

  @ApiProperty({
    example: 'Praça da Sé, 100 - Sé, São Paulo - SP, 01001-000, Brasil',
  })
  formattedAddress: string;

  @ApiProperty({ example: -23.55052 })
  latitude: number;

  @ApiProperty({ example: -46.633308 })
  longitude: number;

  @ApiProperty({ example: 'ROOFTOP' })
  locationType: string;
}
