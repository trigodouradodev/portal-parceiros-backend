import { ApiProperty } from '@nestjs/swagger';

/** Opção de responsável que o usuário autenticado pode acompanhar. */
export class SubordinateOption {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'João Pereira' })
  name: string;
}
