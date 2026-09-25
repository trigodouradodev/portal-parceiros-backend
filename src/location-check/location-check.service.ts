import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mapGuarantor } from '../activities/activities.mapper';
import { FollowUpParty } from '../follow-up/enums/follow-up.enums';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyLocationDto } from './dto/verify-location.dto';
import { GeocodingService } from '../locations/geocoding.service';
import { LocationCheckResult } from './interfaces/location-check-result.interface';

/** Raio médio da Terra em metros (para a fórmula de Haversine). */
const EARTH_RADIUS_METERS = 6_371_000;
/** Raio default (metros) quando LOCATION_CHECK_RADIUS_METERS não está setado. */
const DEFAULT_RADIUS_METERS = 100;
/** Faixa intermediária default quando LOCATION_CHECK_PROXIMITY_RADIUS_METERS não está setado. */
const DEFAULT_PROXIMITY_RADIUS_METERS = 300;
/**
 * Teto do bônus de accuracy no raio exato — evita que GPS indoor (accuracy
 * de centenas de metros) transforme a checagem em "qualquer lugar".
 */
const MAX_ACCURACY_BONUS_METERS = 100;

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
   * do endereço cadastrado do destinatário da visita. Para o cliente, o
   * endereço é resolvido com prioridade para o primário; para o avalista, vem
   * do JSON da proposta de origem. Ambos são geocodificados e comparados por
   * Haversine.
   * Responde sempre 200 com `withinRadius`; "fora do raio" é resultado válido.
   */
  async verify(dto: VerifyLocationDto): Promise<LocationCheckResult> {
    const contract = await this.prisma.contracts.findUnique({
      where: { id: dto.contractId },
      select: {
        id: true,
        client_id: true,
        quotes: { select: { guarantor: true } },
      },
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

    const party = dto.party ?? FollowUpParty.CLIENT;
    const address =
      party === FollowUpParty.GUARANTOR
        ? this.resolveGuarantorAddress(contract.quotes?.guarantor)
        : await this.findClientAddress(contract.client_id);

    const geo = await this.geocoding.geocode(this.buildAddressText(address), {
      postalCode: address.zip_code,
    });
    if (!geo) {
      return this.unreliableResult(dto);
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
    const configuredProximityMeters =
      this.config.get<number>('geocoding.proximityRadiusMeters') ??
      DEFAULT_PROXIMITY_RADIUS_METERS;
    const accuracyBonus = Math.min(
      Math.max(dto.accuracyMeters ?? 0, 0),
      MAX_ACCURACY_BONUS_METERS,
    );
    // A faixa de proximidade é o teto. O bônus de GPS não empurra o raio
    // exato para além dela; se o raio base já for maior, a faixa sobe junto.
    const proximityRadiusMeters = Math.max(
      configuredProximityMeters,
      radiusMeters,
    );
    const effectiveRadiusMeters = Math.min(
      radiusMeters + accuracyBonus,
      proximityRadiusMeters,
    );
    const addressLikelyWrong = this.isAddressLikelyWrong(geo, address.city);
    const confirmationLevel = addressLikelyWrong
      ? null
      : this.resolveConfirmationLevel(
          distanceMeters,
          effectiveRadiusMeters,
          proximityRadiusMeters,
        );

    return {
      withinRadius: confirmationLevel !== null,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
      radiusMeters,
      effectiveRadiusMeters,
      proximityRadiusMeters,
      confirmationLevel,
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
      addressLikelyWrong,
    };
  }

  /**
   * exact dentro do raio efetivo; proximity na faixa intermediária; null fora.
   */
  private resolveConfirmationLevel(
    distanceMeters: number,
    effectiveRadiusMeters: number,
    proximityRadiusMeters: number,
  ): 'exact' | 'proximity' | null {
    if (distanceMeters <= effectiveRadiusMeters) return 'exact';
    if (distanceMeters <= proximityRadiusMeters) return 'proximity';
    return null;
  }

  /**
   * true quando o ponto do geocoding não é confiável pro raio de 100 m —
   * ou porque o Google não tem certeza ROOFTOP do ponto (RANGE_INTERPOLATED/
   * GEOMETRIC_CENTER/APPROXIMATE podem interpolar/aproximar o ponto errado
   * mesmo dentro da cidade certa — caso real do AUREA-352: parceiro
   * confirmadamente no endereço certo, Google devolveu RANGE_INTERPOLATED e
   * errou o ponto por ~35km), ou porque o endereço formatado nem menciona a
   * cidade cadastrada (sinal mais grave: via de mesmo nome em outro
   * município). O primeiro caso é o mais comum na prática — não dá pra
   * confiar no texto pra detectar "cidade errada dentro do ponto certo".
   */
  private isAddressLikelyWrong(
    geo: { formattedAddress: string; locationType: string },
    registeredCity: string,
  ): boolean {
    if (geo.locationType !== 'ROOFTOP') return true;

    if (!registeredCity.trim()) return false;
    return !this.normalizeText(geo.formattedAddress).includes(
      this.normalizeText(registeredCity),
    );
  }

  /** Sem acentos e em minúsculas, pra comparar texto vindo de fontes diferentes. */
  private normalizeText(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /**
   * Sem ponto do provedor a checagem não confirma sozinha. A distância alta
   * evita que a tolerância do cliente trate o caso como "no endereço".
   */
  private unreliableResult(dto: VerifyLocationDto): LocationCheckResult {
    const radiusMeters =
      this.config.get<number>('geocoding.radiusMeters') ??
      DEFAULT_RADIUS_METERS;
    const proximityRadiusMeters =
      this.config.get<number>('geocoding.proximityRadiusMeters') ??
      DEFAULT_PROXIMITY_RADIUS_METERS;

    return {
      withinRadius: false,
      distanceMeters: 1_000_000,
      radiusMeters,
      effectiveRadiusMeters: radiusMeters,
      proximityRadiusMeters,
      confirmationLevel: null,
      registeredCoordinates: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      providedCoordinates: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      matchedAddress: '',
      locationType: 'UNAVAILABLE',
      partialMatch: true,
      addressLikelyWrong: true,
    };
  }

  private async findClientAddress(
    clientId: string,
  ): Promise<AddressForGeocoding> {
    const address = await this.prisma.addresses.findFirst({
      where: { client_id: clientId },
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

    return {
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zip_code: address.zip_code,
    };
  }

  private resolveGuarantorAddress(
    rawGuarantor: Parameters<typeof mapGuarantor>[0],
  ): AddressForGeocoding {
    const address = mapGuarantor(rawGuarantor)?.address;
    if (!address) {
      throw new NotFoundException('Endereço do avalista não encontrado.');
    }

    return {
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state ?? null,
      zip_code: address.zipCode,
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
