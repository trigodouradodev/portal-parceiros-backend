import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { CelcoinAuthService } from './celcoin-auth.service';
import {
  CelcoinConfigService,
  CelcoinIntegrationConfig,
} from './celcoin-config.service';

const configValues: CelcoinIntegrationConfig = {
  authBaseUrl: 'https://auth.celcoin.test/',
  platformBaseUrl: 'https://api.celcoin.test/',
  originatorId: 'originator-id',
  originatorSecret: 'originator-secret',
  productId: 'produto-pf-clean',
};

function build(overrides: Partial<CelcoinIntegrationConfig> = {}) {
  const celcoinConfig = {
    getConfig: jest.fn().mockResolvedValue({ ...configValues, ...overrides }),
  } as unknown as CelcoinConfigService;
  return new CelcoinAuthService(celcoinConfig);
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

describe('CelcoinAuthService', () => {
  it('autentica com client credentials e reutiliza o token válido', async () => {
    const service = build();
    mockResponse({ access_token: 'token-123', expires_in: 3600 });

    await expect(service.getAccessToken()).resolves.toBe('token-123');
    await expect(service.getAccessToken()).resolves.toBe('token-123');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://auth.celcoin.test/oauth2/token');
    expect(request.method).toBe('POST');
    expect(request.body).toBe('grant_type=client_credentials');
    expect(request.headers).toEqual(
      expect.objectContaining({
        Authorization: `Basic ${Buffer.from('originator-id:originator-secret').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
    );
  });

  it('busca outro token depois de invalidar o cache', async () => {
    const service = build();
    mockResponse({ access_token: 'token-1', expires_in: 3600 });
    mockResponse({ access_token: 'token-2', expires_in: 3600 });

    await expect(service.getAccessToken()).resolves.toBe('token-1');
    service.invalidate();
    await expect(service.getAccessToken()).resolves.toBe('token-2');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('devolve 503 quando a autenticação é recusada', async () => {
    const service = build();
    mockResponse({}, { ok: false, status: 401 });

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('devolve 503 quando access_token não vem no contrato', async () => {
    const service = build();
    mockResponse({ expires_in: 3600 });

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('não chama a rede quando a leitura da system config falha', async () => {
    const celcoinConfig = {
      getConfig: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('System config ausente'),
        ),
    } as unknown as CelcoinConfigService;
    const service = new CelcoinAuthService(celcoinConfig);

    await expect(service.getAccessToken()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
