import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ValidateEmailDto {
  @ApiProperty({ example: 'maria@email.com', format: 'email' })
  @Transform(trim)
  @IsEmail()
  email: string;
}
