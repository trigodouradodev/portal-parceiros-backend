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
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  ActivityChannel,
  ActivityInteractionResult,
  ActivityRecipientType,
} from '../enums/activity.enums';

const LOCATION_CONFIRMATIONS = ['exact', 'proximity', 'manual'] as const;
const MANUAL_LOCATION_REASONS = [
  'gps_imprecise',
  'no_signal',
  'wrong_address',
  'receiving_at_address',
] as const;

@ValidatorConstraint({ name: 'visitLocationConfirmation', async: false })
class VisitLocationConfirmationConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as RegisterInteractionDto;
    const confirmation = dto.locationConfirmation;
    const reason = dto.manualLocationReason;
    const confirmationKnown =
      confirmation === undefined ||
      (LOCATION_CONFIRMATIONS as readonly string[]).includes(confirmation);
    const reasonKnown =
      reason === undefined ||
      (MANUAL_LOCATION_REASONS as readonly string[]).includes(reason);
    if (!confirmationKnown || !reasonKnown) return false;
    if (confirmation === 'manual') return reason !== undefined;
    return reason === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as RegisterInteractionDto;
    if (
      dto.locationConfirmation === 'manual' &&
      dto.manualLocationReason === undefined
    ) {
      return 'manualLocationReason é obrigatório quando a confirmação é manual.';
    }
    if (
      dto.manualLocationReason !== undefined &&
      dto.locationConfirmation !== 'manual'
    ) {
      return 'manualLocationReason só pode ser enviado na confirmação manual.';
    }
    return 'locationConfirmation ou manualLocationReason inválido.';
  }
}

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

  @ApiPropertyOptional({
    enum: LOCATION_CONFIRMATIONS,
    description:
      'Como a presença na visita foi confirmada: exact, proximity ou manual.',
  })
  @Validate(VisitLocationConfirmationConstraint)
  locationConfirmation?: 'exact' | 'proximity' | 'manual';

  @ApiPropertyOptional({
    enum: MANUAL_LOCATION_REASONS,
    description:
      'Motivo da confirmação manual. Obrigatório quando locationConfirmation=manual e proibido nos outros casos.',
  })
  manualLocationReason?: (typeof MANUAL_LOCATION_REASONS)[number];
}
