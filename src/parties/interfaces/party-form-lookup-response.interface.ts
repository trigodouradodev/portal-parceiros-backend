import { ApiProperty } from '@nestjs/swagger';

export class PartyFormAddress {
  @ApiProperty({ example: '01001000' })
  zipCode: string;

  @ApiProperty({ example: 'Praça da Sé' })
  streetName: string;

  @ApiProperty({ example: '100' })
  streetNumber: string;

  @ApiProperty({ example: 'Apto 12' })
  streetComplement: string;

  @ApiProperty({ example: 'Sé' })
  streetDistrict: string;

  @ApiProperty({ example: 'São Paulo' })
  city: string;

  @ApiProperty({ example: 'SP', nullable: true })
  state: string | null;
}

export class PartyFormData {
  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '52998224725' })
  document: string;

  @ApiProperty({ example: 'maria@email.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: '+5511987654321', nullable: true })
  telephone: string | null;

  @ApiProperty({ type: PartyFormAddress, nullable: true })
  address: PartyFormAddress | null;
}

export class PartyFormLookupResponse {
  @ApiProperty({ type: PartyFormData, nullable: true })
  party: PartyFormData | null;
}
