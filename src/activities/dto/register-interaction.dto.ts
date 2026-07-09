import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  ActivityChannel,
  ActivityInteractionResult,
  ActivityRecipientType,
} from '../enums/activity.enums';

/**
 * Payload para registrar a execução (interação) de uma tarefa de cobrança.
 * `channel`/`result` são validados contra o `task_type` da tarefa no service.
 */
export class RegisterInteractionDto {
  @ApiProperty({
    enum: ActivityChannel,
    description: 'Canal usado: whatsapp/call (contato) ou visit (visita).',
  })
  @IsEnum(ActivityChannel)
  channel: ActivityChannel;

  @ApiProperty({
    enum: ActivityRecipientType,
    description: 'Destinatário: cliente, avalista ou outro contato.',
  })
  @IsEnum(ActivityRecipientType)
  recipientType: ActivityRecipientType;

  @ApiPropertyOptional({
    description:
      'ID do contato enriquecido (quando recipientType=other). Stub por ora.',
  })
  @IsOptional()
  @IsUUID()
  recipientContactId?: string;

  @ApiProperty({
    enum: ActivityInteractionResult,
    description: 'Resultado do desfecho (validado conforme o tipo da tarefa).',
  })
  @IsEnum(ActivityInteractionResult)
  result: ActivityInteractionResult;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Observações livres. Obrigatória quando result=other.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation?: string;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Data prometida (obrigatória e ≤ D+10 quando result=payment_promise).',
  })
  @IsOptional()
  @IsDateString()
  promiseDate?: string;

  @ApiPropertyOptional({
    description: 'Latitude da visita (junto com longitude).',
  })
  @ValidateIf(
    (o: RegisterInteractionDto) =>
      o.longitude !== undefined || o.latitude !== undefined,
  )
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude da visita (junto com latitude).',
  })
  @ValidateIf(
    (o: RegisterInteractionDto) =>
      o.latitude !== undefined || o.longitude !== undefined,
  )
  @IsLongitude()
  longitude?: number;
}
