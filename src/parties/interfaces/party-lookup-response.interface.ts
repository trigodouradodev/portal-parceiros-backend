import { ApiProperty } from '@nestjs/swagger';

export class PartyLookupData {
  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '52998224725' })
  document: string;

  @ApiProperty({ example: 'maria@email.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: '+5511987654321', nullable: true })
  telephone: string | null;
}

export class PartyLookupResponse {
  @ApiProperty({ example: true })
  found: boolean;

  @ApiProperty({ type: PartyLookupData, nullable: true })
  party: PartyLookupData | null;
}
