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
  FollowUpExpectedResult,
  FollowUpStatus,
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

  @ApiProperty({
    enum: FollowUpStatus,
    description: 'Tipo/canal da ação (espelha o enum do banco).',
  })
  @IsEnum(FollowUpStatus)
  status: FollowUpStatus;

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
