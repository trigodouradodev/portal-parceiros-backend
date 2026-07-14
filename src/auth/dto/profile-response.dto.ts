import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'parceiro@trigodourado.com', format: 'email' })
  email: string;

  @ApiProperty({ example: 'Maria Souza' })
  full_name: string;

  @ApiPropertyOptional({ example: '11987654321', nullable: true })
  phone_number: string | null;

  @ApiProperty({ example: 'ROLE_CONSULTANT', description: 'Papel do usuário.' })
  role: string;

  @ApiProperty({
    type: [String],
    example: ['INSTALLMENT_VIEW', 'CONTRACT_VIEW'],
    description: 'Chaves de permissão efetivas do usuário.',
  })
  permissions: string[];
}
