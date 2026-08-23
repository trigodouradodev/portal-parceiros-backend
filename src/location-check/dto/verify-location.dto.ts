import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { FollowUpParty } from '../../follow-up/enums/follow-up.enums';

/**
 * Payload da verificação de localização: a coordenada capturada pelo agente em
 * campo, mais o contrato/parcela cuja parcela está sendo visitada.
 */
export class VerifyLocationDto {
  @ApiProperty({ format: 'uuid', description: 'Contrato a verificar.' })
  @IsUUID()
  contractId: string;

  @ApiProperty({
    minimum: 1,
    description: 'Número da parcela visitada (deve existir no contrato).',
  })
  @IsInt()
  @Min(1)
  installmentNumber: number;

  @ApiPropertyOptional({
    enum: FollowUpParty,
    default: FollowUpParty.CLIENT,
    description:
      'Destinatário da visita. Ausente mantém a compatibilidade e usa o cliente.',
  })
  @IsOptional()
  @IsEnum(FollowUpParty)
  party?: FollowUpParty;

  @ApiProperty({
    example: -23.56321,
    description: 'Latitude capturada pelo dispositivo do agente.',
  })
  @IsLatitude()
  latitude: number;

  @ApiProperty({
    example: -46.65412,
    description: 'Longitude capturada pelo dispositivo do agente.',
  })
  @IsLongitude()
  longitude: number;
}
