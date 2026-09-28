import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { CabureAuthService } from './cabure-auth.service';
import { CabureConfigService } from './cabure-config.service';
import { CabureService } from './cabure.service';

const configValues = {
  baseUrl: 'https://api.cabure.test/',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  productCode: 'credito-pessoal-21',
};

function build() {
  const cabureConfig = {
    getConfig: jest.fn().mockResolvedValue(configValues),
  } as unknown as CabureConfigService;
  const invalidate = jest.fn();
  const getAccessToken = jest.fn().mockResolvedValue('access-token');
  const auth = {
    getAccessToken,
    invalidate,
  } as unknown as CabureAuthService;
  return {
    service: new CabureService(cabureConfig, auth),
    getAccessToken,
    invalidate,
  };
}

function mockResponse(
  payload: unknown,
  options: { ok?: boolean; status?: number } = {},
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: jest.fn().mockResolvedValue(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CabureService.quote', () => {
  it('cota o seguro com productCode, valor e prazo, e devolve id + premium + productCode', async () => {
    const { service } = build();
    mockResponse({ id: 'quote-1', premium: 189.9 });

    await expect(service.quote(5000, 10)).resolves.toEqual({
      id: 'quote-1',
      premium: 189.9,
      productCode: 'credito-pessoal-21',
    });

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.cabure.test/v2/quotes');
    expect(request.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer access-token' }),
    );
    expect(JSON.parse(request.body as string)).toEqual({
      productCode: 'credito-pessoal-21',
      loanAmount: 5000,
      loanPeriodInMonths: 10,
    });
  });

  it('renova o token e repete uma vez quando recebe 401', async () => {
    const { service, getAccessToken } = build();
    mockResponse({}, { ok: false, status: 401 });
    mockResponse({ id: 'quote-1', premium: 189.9 });

    await expect(service.quote(5000, 10)).resolves.toEqual({
      id: 'quote-1',
      premium: 189.9,
      productCode: 'credito-pessoal-21',
    });

    expect(getAccessToken).toHaveBeenCalledWith(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('devolve 503 quando a Caburé recusa a cotação', async () => {
    const { service } = build();
    mockResponse({ message: 'invalid product' }, { ok: false, status: 422 });

    await expect(service.quote(5000, 10)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('devolve 503 quando a resposta foge do contrato (sem premium)', async () => {
    const { service } = build();
    mockResponse({ id: 'quote-1' });

    await expect(service.quote(5000, 10)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('devolve 503 quando a chamada falha por rede ou timeout', async () => {
    const { service } = build();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(service.quote(5000, 10)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
