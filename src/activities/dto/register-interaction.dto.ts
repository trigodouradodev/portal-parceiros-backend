import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ActivityInteractionResult } from '../enums/activity.enums';

/** Payload para registrar o resultado (interação) de uma tarefa de cobrança. */
export class RegisterInteractionDto {
  @ApiProperty({
    enum: ActivityInteractionResult,
    description: 'Resultado do contato (espelha o enum do banco).',
  })
  @IsEnum(ActivityInteractionResult)
  result: ActivityInteractionResult;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Observações livres.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Data prometida de pagamento (ISO; não pode ser no passado).',
  })
  @IsOptional()
  @IsDateString()
  promiseDate?: string;

  @ApiPropertyOptional({
    description: 'Latitude da visita. Obrigatória junto com longitude.',
  })
  @ValidateIf(
    (o: RegisterInteractionDto) =>
      o.longitude !== undefined || o.latitude !== undefined,
  )
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude da visita. Obrigatória junto com latitude.',
  })
  @ValidateIf(
    (o: RegisterInteractionDto) =>
      o.latitude !== undefined || o.longitude !== undefined,
  )
  @IsLongitude()
  longitude?: number;
}
