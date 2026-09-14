import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BrazilState } from '../common/brazil-state.enum';
import { StateCities } from './interfaces/state-cities.interface';

const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface IbgeState {
  id: number;
  nome: string;
  sigla: string;
}

interface IbgeMunicipality {
  nome: string;
  microrregiao?: {
    mesorregiao?: { UF?: { sigla?: string } };
  };
  'regiao-imediata'?: {
    'regiao-intermediaria'?: { UF?: { sigla?: string } };
  };
}

@Injectable()
export class BrazilLocationsService {
  private readonly logger = new Logger(BrazilLocationsService.name);
  private cache: { expiresAt: number; data: StateCities[] } | null = null;

  async listStatesWithCities(): Promise<StateCities[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    try {
      const [statesResponse, citiesResponse] = await Promise.all([
        fetch(`${IBGE_URL}/estados?orderBy=nome`, {
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`${IBGE_URL}/municipios?orderBy=nome`, {
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (!statesResponse.ok || !citiesResponse.ok) {
        throw new Error(
          `HTTP states=${statesResponse.status}, cities=${citiesResponse.status}`,
        );
      }

      const states = (await statesResponse.json()) as IbgeState[];
      const municipalities =
        (await citiesResponse.json()) as IbgeMunicipality[];
      const data = mapLocations(states, municipalities);

      this.cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
      return data;
    } catch (error) {
      this.logger.error(
        `Falha ao consultar localidades do IBGE: ${String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Serviço de consulta de estados e cidades indisponível.',
      );
    }
  }
}

function mapLocations(
  states: IbgeState[],
  municipalities: IbgeMunicipality[],
): StateCities[] {
  const citiesByState = new Map<BrazilState, string[]>();

  for (const municipality of municipalities) {
    const state = municipalityState(municipality);
    if (!state || !isBrazilState(state)) {
      throw new Error(`UF ausente para o município ${municipality.nome}.`);
    }
    const cities = citiesByState.get(state) ?? [];
    cities.push(municipality.nome);
    citiesByState.set(state, cities);
  }

  return states
    .map((state) => {
      const code = state.sigla.toUpperCase();
      if (!isBrazilState(code)) {
        throw new Error(`UF inválida retornada pelo IBGE: ${state.sigla}.`);
      }
      return {
        state: code,
        stateName: state.nome,
        cities: (citiesByState.get(code) ?? []).sort((left, right) =>
          left.localeCompare(right, 'pt-BR'),
        ),
      };
    })
    .sort((left, right) =>
      left.stateName.localeCompare(right.stateName, 'pt-BR'),
    );
}

function municipalityState(municipality: IbgeMunicipality): string | undefined {
  return (
    municipality.microrregiao?.mesorregiao?.UF?.sigla ??
    municipality['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
  );
}

function isBrazilState(value: string): value is BrazilState {
  return Object.values(BrazilState).includes(value as BrazilState);
}
