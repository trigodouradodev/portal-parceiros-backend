import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  // E-mail não é editável por aqui: é o login do usuário. Alterá-lo é uma
  // operação administrativa, fora do escopo desta rota.

  @ApiPropertyOptional({ example: 'Maria Souza' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({
    example: '11987654321',
    nullable: true,
    description: 'null limpa o telefone.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string | null;
}
