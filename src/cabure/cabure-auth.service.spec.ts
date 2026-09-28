import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { CabureAuthService } from './cabure-auth.service';
import {
  CabureConfigService,
  CabureIntegrationConfig,
} from './cabure-config.service';

const configValues: CabureIntegrationConfig = {
  baseUrl: 'https://api.cabure.test/',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  productCode: 'credito-pessoal-21',
};

function build(overrides: Partial<CabureIntegrationConfig> = {}) {
  const cabureConfig = {
    getConfig: jest.fn().mockResolvedValue({ ...configValues, ...overrides }),
  } as unknown as CabureConfigService;
  return new CabureAuthService(cabureConfig);
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

describe('CabureAuthService', () => {
  it('autentica com clientId/clientSecret e reutiliza o token válido', async () => {
    const service = build();
    mockResponse({
      accessToken: 'token-123',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    await expect(service.getAccessToken()).resolves.toBe('token-123');
    await expect(service.getAccessToken()).resolves.toBe('token-123');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.cabure.test/v2/auth/login');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body as string)).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
  });

  it('busca outro token quando forçado (retry após 401)', async () => {
    mockResponse({
      accessToken: 'token-1',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    mockResponse({
      accessToken: 'token-2',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const service = build();

    await expect(service.getAccessToken()).resolves.toBe('token-1');
    await expect(service.getAccessToken(true)).resolves.toBe('token-2');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('devolve 503 quando o login é recusado', async () => {
    const service = build();
    mockResponse({}, { ok: false, status: 401 });

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('devolve 503 quando accessToken/expiresAt não vêm no contrato', async () => {
    const service = build();
    mockResponse({ accessToken: 'token-123' });

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('não chama a rede quando a leitura da system config falha', async () => {
    const cabureConfig = {
      getConfig: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('System config ausente'),
        ),
    } as unknown as CabureConfigService;
    const service = new CabureAuthService(cabureConfig);

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
