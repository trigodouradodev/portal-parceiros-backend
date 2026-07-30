import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'senha-atual' })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ example: 'nova-senha-segura', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
