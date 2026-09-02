import { ServiceUnavailableException } from '@nestjs/common';
import { BrazilState } from '../common/brazil-state.enum';
import { BrazilLocationsService } from './brazil-locations.service';

const originalFetch = global.fetch;

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('BrazilLocationsService', () => {
  let service: BrazilLocationsService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new BrazilLocationsService();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('agrupa cidades por estado e mantém o resultado em cache', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response([
          { id: 35, sigla: 'SP', nome: 'São Paulo' },
          { id: 33, sigla: 'RJ', nome: 'Rio de Janeiro' },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            nome: 'São Paulo',
            microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } },
          },
          {
            nome: 'Campinas',
            microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } },
          },
          {
            nome: 'Rio de Janeiro',
            'regiao-imediata': {
              'regiao-intermediaria': { UF: { sigla: 'RJ' } },
            },
          },
        ]),
      );

    const expected = [
      {
        state: BrazilState.RJ,
        stateName: 'Rio de Janeiro',
        cities: ['Rio de Janeiro'],
      },
      {
        state: BrazilState.SP,
        stateName: 'São Paulo',
        cities: ['Campinas', 'São Paulo'],
      },
    ];

    await expect(service.listStatesWithCities()).resolves.toEqual(expected);
    await expect(service.listStatesWithCities()).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('traduz falha do IBGE para indisponibilidade', async () => {
    fetchMock.mockResolvedValue(response({}, false, 500));

    await expect(service.listStatesWithCities()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('recusa resposta sem UF associada a uma cidade', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response([{ id: 35, sigla: 'SP', nome: 'São Paulo' }]),
      )
      .mockResolvedValueOnce(response([{ nome: 'São Paulo' }]));

    await expect(service.listStatesWithCities()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
