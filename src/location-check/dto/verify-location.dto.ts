import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsLatitude, IsLongitude, IsUUID, Min } from 'class-validator';

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
