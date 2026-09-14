import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BrazilState } from '../common/brazil-state.enum';
import { PostalCodeService } from './postal-code.service';

const originalFetch = global.fetch;

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('PostalCodeService', () => {
  let service: PostalCodeService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new PostalCodeService();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('normaliza o CEP e mapeia a resposta do ViaCEP', async () => {
    fetchMock.mockResolvedValue(
      response({
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        complemento: 'lado ímpar',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    );

    await expect(service.find('01001-000')).resolves.toEqual({
      zipCode: '01001000',
      streetName: 'Praça da Sé',
      streetComplement: 'lado ímpar',
      streetDistrict: 'Sé',
      city: 'São Paulo',
      state: BrazilState.SP,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://viacep.com.br/ws/01001000/json/',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('retorna not found quando o ViaCEP informa erro', async () => {
    fetchMock.mockResolvedValue(response({ erro: true }));

    await expect(service.find('99999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('recusa CEP inválido antes de chamar o provedor', async () => {
    await expect(service.find('123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'falha de rede',
      result: () => Promise.reject(new Error('offline')),
    },
    {
      name: 'erro HTTP',
      result: () => Promise.resolve(response({}, false, 500)),
    },
  ])('traduz $name para indisponibilidade', async ({ result }) => {
    fetchMock.mockImplementation(result);

    await expect(service.find('01001000')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
