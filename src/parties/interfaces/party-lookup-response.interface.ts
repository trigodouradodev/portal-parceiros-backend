import { ApiProperty } from '@nestjs/swagger';

export class PartyLookupData {
  @ApiProperty({ example: 'Maria Souza' })
  name: string;

  @ApiProperty({ example: '52998224725' })
  document: string;

  @ApiProperty({ example: '1990-05-20', format: 'date', nullable: true })
  birthDate: string | null;

  @ApiProperty({ example: 'maria@email.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: '+5511987654321', nullable: true })
  telephone: string | null;
}
