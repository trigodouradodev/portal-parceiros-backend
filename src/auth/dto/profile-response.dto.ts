import { ApiProperty } from '@nestjs/swagger';

/** Perfil do usuário autenticado retornado por GET /auth/me. */
export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'parceiro@trigodourado.com', format: 'email' })
  email: string;

  @ApiProperty({ example: 'Maria Souza' })
  full_name: string;

  @ApiProperty({ example: 'ROLE_CONSULTANT', description: 'Papel do usuário.' })
  role: string;

  @ApiProperty({
    type: [String],
    example: ['INSTALLMENT_VIEW', 'CONTRACT_VIEW'],
    description: 'Chaves de permissão efetivas do usuário.',
  })
  permissions: string[];
}
