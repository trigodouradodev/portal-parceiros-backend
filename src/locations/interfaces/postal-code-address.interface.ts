import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';

export class PostalCodeAddress {
  @ApiProperty({ example: '01001000' })
  zipCode: string;

  @ApiProperty({ example: 'Praça da Sé' })
  streetName: string;

  @ApiPropertyOptional({ example: 'lado ímpar' })
  streetComplement?: string;

  @ApiProperty({ example: 'Sé' })
  streetDistrict: string;

  @ApiProperty({ example: 'São Paulo' })
  city: string;

  @ApiProperty({ enum: BrazilState })
  state: BrazilState;
}
