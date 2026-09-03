import { Test, TestingModule } from '@nestjs/testing';
import {
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingService } from '../locations/geocoding.service';

const API_KEY = 'chave-de-teste';

function googlePayload(overrides: Record<string, unknown> = {}) {
  return {
    status: 'OK',
    results: [
      {
        formatted_address:
          'R. das Flores, 123 - Centro, São Paulo - SP, Brasil',
        partial_match: false,
        geometry: {
          location: { lat: -23.56321, lng: -46.65412 },
          location_type: 'ROOFTOP',
        },
      },
    ],
    ...overrides,
  };
}

function reverseGoogleResult(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    formatted_address:
      'Praça da Sé, 100 - Sé, São Paulo - SP, 01001-000, Brasil',
    types: ['street_address'],
    address_components: [
      { long_name: '100', short_name: '100', types: ['street_number'] },
      {
        long_name: 'Praça da Sé',
        short_name: 'Praça da Sé',
        types: ['route'],
      },
      {
        long_name: 'Sé',
        short_name: 'Sé',
        types: ['sublocality_level_1', 'political'],
      },
      {
        long_name: 'São Paulo',
        short_name: 'São Paulo',
        types: ['locality', 'political'],
      },
      {
        long_name: 'São Paulo',
        short_name: 'SP',
        types: ['administrative_area_level_1', 'political'],
      },
      {
        long_name: 'Brasil',
        short_name: 'BR',
        types: ['country', 'political'],
      },
      {
        long_name: '01001-000',
        short_name: '01001-000',
        types: ['postal_code'],
      },
    ],
    geometry: {
      location: { lat: -23.55052, lng: -46.633308 },
      location_type: 'ROOFTOP',
    },
    ...overrides,
  };
}

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

async function build(apiKey = API_KEY): Promise<GeocodingService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GeocodingService,
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue(apiKey) },
      },
    ],
  }).compile();
  return module.get(GeocodingService);
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  global.fetch = jest.fn();
  // O service loga warn/error nos caminhos de imprecisão e falha; silencia para
  // não poluir a saída da suíte.
  warnSpy = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isEnabled', () => {
  it('true quando há chave configurada', async () => {
    await expect(build().then((s) => s.isEnabled())).resolves.toBe(true);
  });

  it('false quando a chave está vazia — o endpoint fica desabilitado', async () => {
    await expect(build('').then((s) => s.isEnabled())).resolves.toBe(false);
  });
});

describe('geocode — requisição', () => {
  it('recusa antes de chamar o provedor quando não há chave', async () => {
    const service = await build('');

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('monta a URL com endereço, chave e viés de Brasil', async () => {
    const service = await build();
    mockFetchOnce(googlePayload());

    await service.geocode('R. das Flores, 123');

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [URL];
    expect(url.origin + url.pathname).toBe(
      'https://maps.googleapis.com/maps/api/geocode/json',
    );
    expect(url.searchParams.get('address')).toBe('R. das Flores, 123');
    expect(url.searchParams.get('key')).toBe(API_KEY);
    // O viés evita casar endereço homônimo em outro país.
    expect(url.searchParams.get('region')).toBe('br');
    expect(url.searchParams.get('components')).toBe('country:BR');
  });
});

describe('geocode — resposta bem-sucedida', () => {
  it('mapeia o primeiro resultado', async () => {
    const service = await build();
    mockFetchOnce(googlePayload());

    await expect(service.geocode('R. das Flores, 123')).resolves.toEqual({
      latitude: -23.56321,
      longitude: -46.65412,
      formattedAddress: 'R. das Flores, 123 - Centro, São Paulo - SP, Brasil',
      locationType: 'ROOFTOP',
      partialMatch: false,
    });
  });

  it('usa o primeiro resultado quando o provedor devolve vários', async () => {
    const service = await build();
    const first = googlePayload().results[0];
    const second = {
      ...first,
      formatted_address: 'Outro endereço',
      geometry: { ...first.geometry, location: { lat: 0, lng: 0 } },
    };
    mockFetchOnce({ status: 'OK', results: [first, second] });

    const result = await service.geocode('R. das Flores, 123');
    expect(result?.formattedAddress).toBe(first.formatted_address);
  });

  it('trata partial_match ausente como false', async () => {
    const service = await build();
    const payload = googlePayload();
    delete (payload.results[0] as { partial_match?: boolean }).partial_match;
    mockFetchOnce(payload);

    const result = await service.geocode('R. das Flores, 123');
    expect(result?.partialMatch).toBe(false);
  });

  it('devolve o resultado impreciso em vez de recusar, mas registra o aviso', async () => {
    // APPROXIMATE é centroide de via/bairro: o caller precisa do dado para
    // decidir, então o service entrega e sinaliza pelo locationType.
    const service = await build();
    mockFetchOnce(
      googlePayload({
        results: [
          {
            ...googlePayload().results[0],
            partial_match: true,
            geometry: {
              location: { lat: -23.5, lng: -46.6 },
              location_type: 'APPROXIMATE',
            },
          },
        ],
      }),
    );

    const result = await service.geocode('R. das Flores');
    expect(result?.locationType).toBe('APPROXIMATE');
    expect(result?.partialMatch).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('geocode — endereço não encontrado', () => {
  it('devolve null em ZERO_RESULTS, que não é erro', async () => {
    const service = await build();
    mockFetchOnce({ status: 'ZERO_RESULTS', results: [] });

    await expect(service.geocode('endereço inexistente')).resolves.toBeNull();
  });
});

describe('geocode — falhas', () => {
  it.each([
    ['OVER_QUERY_LIMIT'],
    ['REQUEST_DENIED'],
    ['INVALID_REQUEST'],
    ['UNKNOWN_ERROR'],
  ])('lança 503 para status %s do provedor', async (status) => {
    const service = await build();
    mockFetchOnce({ status, results: [], error_message: 'falhou' });

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lança 503 quando o status é OK mas a lista vem vazia', async () => {
    // Combinação que o Google não deveria produzir; cai no caminho de erro em
    // vez de devolver null, para não ser confundida com ZERO_RESULTS.
    const service = await build();
    mockFetchOnce({ status: 'OK', results: [] });

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lança 503 quando a resposta HTTP não é ok', async () => {
    const service = await build();
    mockFetchOnce({}, false, 500);

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lança 503 quando a rede falha', async () => {
    const service = await build();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lança 503 quando o corpo não é JSON válido', async () => {
    const service = await build();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Unexpected token')),
    });

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('não vaza a chave da API na mensagem de erro', async () => {
    const service = await build();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(service.geocode('R. das Flores, 123')).rejects.toThrow(
      /^(?!.*chave-de-teste).*$/,
    );
  });
});

describe('reverseGeocode', () => {
  it('consulta por lat/lng e mapeia os componentes para o endereço da quote', async () => {
    const service = await build();
    mockFetchOnce({ status: 'OK', results: [reverseGoogleResult()] });

    await expect(
      service.reverseGeocode(-23.55052, -46.633308),
    ).resolves.toEqual({
      zipCode: '01001000',
      streetName: 'Praça da Sé',
      streetNumber: '100',
      streetComplement: null,
      streetDistrict: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      formattedAddress:
        'Praça da Sé, 100 - Sé, São Paulo - SP, 01001-000, Brasil',
      latitude: -23.55052,
      longitude: -46.633308,
      locationType: 'ROOFTOP',
    });

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [URL];
    expect(url.searchParams.get('latlng')).toBe('-23.55052,-46.633308');
    expect(url.searchParams.get('language')).toBe('pt-BR');
    expect(url.searchParams.get('region')).toBe('br');
    expect(url.searchParams.get('key')).toBe(API_KEY);
  });

  it('prefere um endereço exato mesmo quando ele não é o primeiro resultado', async () => {
    const service = await build();
    const neighborhood = reverseGoogleResult({
      formatted_address: 'Sé, São Paulo - SP, Brasil',
      types: ['neighborhood'],
    });
    const street = reverseGoogleResult();
    mockFetchOnce({ status: 'OK', results: [neighborhood, street] });

    const result = await service.reverseGeocode(-23.55052, -46.633308);

    expect(result?.formattedAddress).toBe(
      'Praça da Sé, 100 - Sé, São Paulo - SP, 01001-000, Brasil',
    );
  });

  it('devolve null quando o provedor não encontra um endereço', async () => {
    const service = await build();
    mockFetchOnce({ status: 'ZERO_RESULTS', results: [] });

    await expect(
      service.reverseGeocode(-23.55052, -46.633308),
    ).resolves.toBeNull();
  });

  it('mantém como null os componentes que o provedor não informou', async () => {
    const service = await build();
    const resultWithoutComponents = reverseGoogleResult({
      address_components: [
        {
          long_name: 'Brasil',
          short_name: 'BR',
          types: ['country', 'political'],
        },
      ],
    });
    mockFetchOnce({ status: 'OK', results: [resultWithoutComponents] });

    const result = await service.reverseGeocode(-23.55052, -46.633308);

    expect(result).toMatchObject({
      zipCode: null,
      streetName: null,
      streetNumber: null,
      streetComplement: null,
      streetDistrict: null,
      city: null,
      state: null,
    });
  });

  it('recusa coordenadas cujo resultado pertence a outro país', async () => {
    const service = await build();
    const foreignResult = reverseGoogleResult({
      address_components: [
        {
          long_name: 'Estados Unidos',
          short_name: 'US',
          types: ['country', 'political'],
        },
      ],
    });
    mockFetchOnce({ status: 'OK', results: [foreignResult] });

    await expect(service.reverseGeocode(40.7128, -74.006)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lança 503 quando o provedor retorna erro', async () => {
    const service = await build();
    mockFetchOnce({ status: 'REQUEST_DENIED', results: [] });

    await expect(service.reverseGeocode(-23.55052, -46.633308)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
