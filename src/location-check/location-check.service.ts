import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyLocationDto } from './dto/verify-location.dto';
import { GeocodingService } from './geocoding.service';
import { LocationCheckResult } from './interfaces/location-check-result.interface';

/** Raio médio da Terra em metros (para a fórmula de Haversine). */
const EARTH_RADIUS_METERS = 6_371_000;
/** Raio default (metros) quando LOCATION_CHECK_RADIUS_METERS não está setado. */
const DEFAULT_RADIUS_METERS = 100;

interface AddressForGeocoding {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string | null;
  zip_code: string;
}

@Injectable()
export class LocationCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifica se a coordenada capturada pelo agente está a até `RADIUS_METERS`
   * do endereço cadastrado do cliente do contrato. O endereço é resolvido
   * (primário; fallback mais recente), geocodificado e comparado por Haversine.
   * Responde sempre 200 com `withinRadius`; "fora do raio" é resultado válido.
   */
  async verify(dto: VerifyLocationDto): Promise<LocationCheckResult> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: dto.contractId },
      select: { id: true, client_id: true },
    });
    if (!contract) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const installment = await this.prisma.installments.findFirst({
      where: {
        contract_id: dto.contractId,
        installment_number: dto.installmentNumber,
      },
      select: { id: true },
    });
    if (!installment) {
      throw new NotFoundException('Parcela não encontrada para o contrato.');
    }

    const address = await this.prisma.addresses.findFirst({
      where: { client_id: contract.client_id },
      orderBy: [
        { is_primary: { sort: 'desc', nulls: 'last' } },
        { created_at: 'desc' },
      ],
      select: {
        street: true,
        number: true,
        neighborhood: true,
        city: true,
        state: true,
        zip_code: true,
      },
    });
    if (!address) {
      throw new NotFoundException('Endereço do cliente não encontrado.');
    }

    const geo = await this.geocoding.geocode(this.buildAddressText(address));
    if (!geo) {
      throw new UnprocessableEntityException(
        'Não foi possível geolocalizar o endereço cadastrado.',
      );
    }

    const distanceMeters = this.haversineMeters(
      geo.latitude,
      geo.longitude,
      dto.latitude,
      dto.longitude,
    );
    const radiusMeters =
      this.config.get<number>('geocoding.radiusMeters') ??
      DEFAULT_RADIUS_METERS;

    return {
      withinRadius: distanceMeters <= radiusMeters,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
      radiusMeters,
      registeredCoordinates: {
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
      providedCoordinates: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      matchedAddress: geo.formattedAddress,
      locationType: geo.locationType,
      partialMatch: geo.partialMatch,
    };
  }

  /** Monta o texto do endereço (com CEP) para enviar ao geocoder. */
  private buildAddressText(address: AddressForGeocoding): string {
    // Zeros à esquerda no número (ex.: "002539") atrapalham o matching do
    // Google e derrubam o ponto para o nível da via; normaliza para "2539".
    const number = address.number.replace(/^0+(?=\d)/, '').trim();
    const streetLine = number ? `${address.street}, ${number}` : address.street;
    const parts = [
      streetLine,
      address.neighborhood,
      address.state ? `${address.city} - ${address.state}` : address.city,
      address.zip_code,
      'Brasil',
    ];
    return parts.filter((part) => part && part.trim().length > 0).join(', ');
  }

  /** Distância em metros entre dois pontos (lat/lng em graus) via Haversine. */
  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_METERS * 2 * Math.asin(Math.sqrt(a));
  }
}
