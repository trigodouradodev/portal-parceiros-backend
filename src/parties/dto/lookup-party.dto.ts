import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LookupPartyDto {
  @ApiProperty({
    example: '529.982.247-25',
    description: 'CPF com ou sem máscara.',
  })
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  document: string;
}
