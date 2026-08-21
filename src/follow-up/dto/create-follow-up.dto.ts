import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AutomaticFollowUpAction,
  FollowUpExpectedResult,
  FollowUpParty,
  FollowUpStatus,
  FollowUpType,
} from '../enums/follow-up.enums';

/** Payload para registrar um follow-up de parcela. */
export class CreateFollowUpDto {
  @ApiProperty({ format: 'uuid', description: 'Contrato do follow-up.' })
  @IsUUID()
  contractId: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Número da parcela. Opcional (follow-up pode ser do contrato).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  installmentNumber?: number;

  @ApiPropertyOptional({
    enum: FollowUpStatus,
    description:
      'Status do payload legado. Não enviar junto do modelo estruturado.',
  })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  @ApiPropertyOptional({
    enum: FollowUpType,
    description: 'Tipo do follow-up no modelo estruturado.',
  })
  @IsOptional()
  @IsEnum(FollowUpType)
  followUpType?: FollowUpType;

  @ApiPropertyOptional({
    enum: FollowUpParty,
    description: 'Parte envolvida: cliente ou avalista.',
  })
  @IsOptional()
  @IsEnum(FollowUpParty)
  party?: FollowUpParty;

  @ApiPropertyOptional({
    enum: AutomaticFollowUpAction,
    description: 'Ação obrigatória apenas para follow-up automático.',
  })
  @IsOptional()
  @IsEnum(AutomaticFollowUpAction)
  automaticAction?: AutomaticFollowUpAction;

  @ApiPropertyOptional({ description: 'Observações livres (opcional).' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    enum: FollowUpExpectedResult,
    description: 'Resultado esperado do contato (Etapa 3 — Resultado).',
  })
  @IsOptional()
  @IsEnum(FollowUpExpectedResult)
  expectedResult?: FollowUpExpectedResult;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Previsão de pagamento (ISO 8601).',
  })
  @IsOptional()
  @IsDateString()
  paymentForecast?: string;

  @ApiPropertyOptional({
    description: 'Latitude da visita. Obrigatória junto com longitude.',
  })
  @ValidateIf(
    (o: CreateFollowUpDto) =>
      o.longitude !== undefined || o.latitude !== undefined,
  )
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude da visita. Obrigatória junto com latitude.',
  })
  @ValidateIf(
    (o: CreateFollowUpDto) =>
      o.latitude !== undefined || o.longitude !== undefined,
  )
  @IsLongitude()
  longitude?: number;
}
