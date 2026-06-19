import { ApiProperty } from '@nestjs/swagger';

/** Par de coordenadas (graus decimais). */
export class Coordinates {
  @ApiProperty({ example: -23.56321 })
  latitude: number;

  @ApiProperty({ example: -46.65412 })
  longitude: number;
}

/** Resultado da verificação de proximidade entre a captura e o endereço. */
export class LocationCheckResult {
  @ApiProperty({
    example: true,
    description:
      'true se a coordenada capturada está dentro do raio do endereço.',
  })
  withinRadius: boolean;

  @ApiProperty({
    example: 8.4,
    description:
      'Distância entre a captura e o endereço geocodificado, em metros.',
  })
  distanceMeters: number;

  @ApiProperty({
    example: 15,
    description: 'Raio máximo aceito para considerar a visita válida (metros).',
  })
  radiusMeters: number;

  @ApiProperty({
    type: Coordinates,
    description: 'Coordenada do endereço cadastrado (resultado do geocoding).',
  })
  registeredCoordinates: Coordinates;

  @ApiProperty({
    type: Coordinates,
    description: 'Coordenada capturada pelo agente (ecoada da requisição).',
  })
  providedCoordinates: Coordinates;

  @ApiProperty({
    example: 'R. das Flores, 123 - Centro, São Paulo - SP, 01001-000, Brasil',
    description: 'Endereço formatado retornado pelo provedor de geocoding.',
  })
  matchedAddress: string;

  @ApiProperty({
    example: 'ROOFTOP',
    description:
      'Precisão do geocoding: ROOFTOP (exato) é confiável; APPROXIMATE/' +
      'GEOMETRIC_CENTER indicam ponto aproximado (raio de 15m não confiável).',
  })
  locationType: string;

  @ApiProperty({
    example: false,
    description:
      'true quando o Google não casou o endereço exato (ex.: ignorou o ' +
      'número). Indica resultado pouco confiável para o raio.',
  })
  partialMatch: boolean;
}
