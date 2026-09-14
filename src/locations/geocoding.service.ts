import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrazilState } from '../common/brazil-state.enum';
import { ReverseGeocodedAddress } from './interfaces/reverse-geocoded-address.interface';

/** Coordenada + endereço normalizado retornados pelo provedor. */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /** Precisão informada pelo Google para o ponto encontrado. */
  locationType: string;
  /** True quando o Google não casou o endereço exato. */
  partialMatch: boolean;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  partial_match?: boolean;
  address_components?: GoogleAddressComponent[];
  types?: string[];
  geometry: {
    location: { lat: number; lng: number };
    location_type: string;
  };
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: GoogleGeocodeResult[];
}

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Cliente compartilhado da Google Geocoding API para geocodificação direta e
 * reversa. Não acessa nem altera entidades do banco.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.getApiKey().length > 0;
  }

  /** Converte um endereço textual em coordenadas. */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = this.createUrl();
    url.searchParams.set('address', address);
    url.searchParams.set('region', 'br');
    url.searchParams.set('components', 'country:BR');

    const payload = await this.request(url);
    const best = this.firstResult(payload);
    if (!best) return null;

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

  /** Converte coordenadas no Brasil nos componentes do endereço do wizard. */
  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodedAddress | null> {
    const url = this.createUrl();
    url.searchParams.set('latlng', `${latitude},${longitude}`);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('region', 'br');

    const payload = await this.request(url);
    if (payload.status === 'ZERO_RESULTS') return null;
    if (payload.status !== 'OK' || payload.results.length === 0) {
      this.throwProviderStatus(payload);
    }

    const result = mostSpecificResult(payload.results);
    if (!result) this.throwProviderStatus(payload);

    const countryCode = component(result, 'country', true);
    if (countryCode && countryCode !== 'BR') {
      throw new UnprocessableEntityException(
        'As coordenadas informadas não pertencem a um endereço no Brasil.',
      );
    }

    const stateCode = component(result, 'administrative_area_level_1', true);
    const state = isBrazilState(stateCode) ? stateCode : null;

    return {
      zipCode: digitsOrNull(component(result, 'postal_code')),
      streetName: component(result, 'route') ?? component(result, 'premise'),
      streetNumber: component(result, 'street_number'),
      streetComplement: component(result, 'subpremise'),
      streetDistrict:
        component(result, 'sublocality_level_1') ??
        component(result, 'sublocality') ??
        component(result, 'neighborhood'),
      city:
        component(result, 'locality') ??
        component(result, 'administrative_area_level_2'),
      state,
      formattedAddress: result.formatted_address,
      latitude,
      longitude,
      locationType: result.geometry.location_type,
    };
  }

  private createUrl(): URL {
    const apiKey = this.getApiKey();
    if (apiKey.length === 0) {
      throw new ServiceUnavailableException(
        'Geocoding não configurado (GOOGLE_MAPS_API_KEY ausente).',
      );
    }
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('key', apiKey);
    return url;
  }

  private async request(url: URL): Promise<GoogleGeocodeResponse> {
    let payload: GoogleGeocodeResponse;
    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = (await response.json()) as GoogleGeocodeResponse;
    } catch (error) {
      this.logger.error(`Falha ao chamar geocoding: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Serviço de geocoding indisponível.',
      );
    }
    return payload;
  }

  private firstResult(
    payload: GoogleGeocodeResponse,
  ): GoogleGeocodeResult | null {
    if (payload.status === 'OK' && payload.results.length > 0) {
      return payload.results[0];
    }
    if (payload.status === 'ZERO_RESULTS') return null;
    this.throwProviderStatus(payload);
  }

  private throwProviderStatus(payload: GoogleGeocodeResponse): never {
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

function mostSpecificResult(
  results: GoogleGeocodeResult[],
): GoogleGeocodeResult | null {
  return (
    results.find((result) =>
      result.types?.some((type) =>
        ['street_address', 'premise', 'subpremise'].includes(type),
      ),
    ) ??
    results[0] ??
    null
  );
}

function component(
  result: GoogleGeocodeResult,
  type: string,
  short = false,
): string | null {
  const found = result.address_components?.find((item) =>
    item.types.includes(type),
  );
  if (!found) return null;
  const value = short ? found.short_name : found.long_name;
  return value.trim() || null;
}

function digitsOrNull(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits || null;
}

function isBrazilState(value: string | null): value is BrazilState {
  return Object.values(BrazilState).includes(value as BrazilState);
}
