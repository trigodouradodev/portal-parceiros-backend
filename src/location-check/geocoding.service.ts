import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Coordenada + endereço normalizado retornados pelo provedor. */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /**
   * Precisão do ponto segundo o Google: ROOFTOP (exato), RANGE_INTERPOLATED,
   * GEOMETRIC_CENTER ou APPROXIMATE (centroide da via/bairro — não confiável
   * para o raio de 15m).
   */
  locationType: string;
  /** True quando o Google não casou o endereço exato (ex.: ignorou o número). */
  partialMatch: boolean;
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: {
    formatted_address: string;
    partial_match?: boolean;
    geometry: {
      location: { lat: number; lng: number };
      location_type: string;
    };
  }[];
}

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Geocodifica endereços textuais via Google Maps Geocoding API. Isolado em um
 * serviço próprio para concentrar a dependência externa e facilitar troca de
 * provedor/teste.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly config: ConfigService) {}

  /** True se há API key configurada (endpoint habilitado). */
  isEnabled(): boolean {
    return this.getApiKey().length > 0;
  }

  /**
   * Converte um endereço textual em coordenadas. Retorna `null` quando o
   * provedor não encontra o endereço (ZERO_RESULTS). Lança
   * ServiceUnavailableException para falhas de configuração/rede/provedor.
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const apiKey = this.getApiKey();
    if (apiKey.length === 0) {
      throw new ServiceUnavailableException(
        'Geocoding não configurado (GOOGLE_MAPS_API_KEY ausente).',
      );
    }

    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'br');
    url.searchParams.set('components', 'country:BR');

    let payload: GoogleGeocodeResponse;
    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      payload = (await response.json()) as GoogleGeocodeResponse;
    } catch (err) {
      this.logger.error(`Falha ao chamar geocoding: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Serviço de geocoding indisponível.',
      );
    }

    if (payload.status === 'OK' && payload.results.length > 0) {
      const best = payload.results[0];
      if (best.geometry.location_type !== 'ROOFTOP' || best.partial_match) {
        this.logger.warn(
          `Geocoding impreciso para "${address}": location_type=${best.geometry.location_type}, partial_match=${best.partial_match ?? false}`,
        );
      }
      return {
        latitude: best.geometry.location.lat,
        longitude: best.geometry.location.lng,
        formattedAddress: best.formatted_address,
        locationType: best.geometry.location_type,
        partialMatch: best.partial_match ?? false,
      };
    }

    if (payload.status === 'ZERO_RESULTS') {
      return null;
    }

    // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, etc.
    this.logger.error(
      `Geocoding retornou status ${payload.status}: ${payload.error_message ?? ''}`,
    );
    throw new ServiceUnavailableException(
      'Serviço de geocoding retornou erro.',
    );
  }

  private getApiKey(): string {
    return this.config.get<string>('geocoding.apiKey') ?? '';
  }
}
