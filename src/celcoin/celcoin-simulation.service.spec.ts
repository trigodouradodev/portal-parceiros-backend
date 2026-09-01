import {
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CelcoinAuthService } from './celcoin-auth.service';
import {
  CelcoinConfigService,
  CelcoinIntegrationConfig,
} from './celcoin-config.service';
import { CelcoinSimulationService } from './celcoin-simulation.service';

const configValues: CelcoinIntegrationConfig = {
  authBaseUrl: 'https://auth.celcoin.test/',
  platformBaseUrl: 'https://api.celcoin.test/',
  originatorId: 'originator-id',
  originatorSecret: 'originator-secret',
  productId: 'produto-pf-clean',
};

const input = {
  requestedAmount: 5000,
  interestRate: 0.0339,
  installments: 10,
  firstPaymentDate: '2026-09-10',
};

const result = {
  payment_amount: 612.34,
  total_amount_owed: 6123.4,
  iof_amount: 123.45,
  schedule: [{ period: 1, payment: 612.34 }],
};

function build(overrides: Partial<CelcoinIntegrationConfig> = {}) {
  const celcoinConfig = {
    getConfig: jest.fn().mockResolvedValue({ ...configValues, ...overrides }),
  } as unknown as CelcoinConfigService;
  const invalidate = jest.fn();
  const auth = {
    getAccessToken: jest.fn().mockResolvedValue('access-token'),
    invalidate,
  } as unknown as CelcoinAuthService;
  return {
    service: new CelcoinSimulationService(celcoinConfig, auth),
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
  jest.useFakeTimers().setSystemTime(new Date('2026-09-01T03:30:00.000Z'));
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CelcoinSimulationService', () => {
  it('envia o preview no produto global e devolve o payload completo', async () => {
    const { service } = build();
    mockResponse(result);

    await expect(service.simulateRequestedAmount(input)).resolves.toEqual(
      result,
    );

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://api.celcoin.test/banking/originator/products/produto-pf-clean/preview',
    );
    expect(request.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer access-token' }),
    );
    expect(JSON.parse(request.body as string)).toEqual({
      requested_amount: 5000,
      interest_rate: 0.0339,
      finance_fee: 0,
      insurance_amount: 0,
      iof_type: 'PERSON',
      num_payments: 10,
      first_payment_date: '2026-09-10',
      disbursement_date: '2026-09-01',
      schedule_type: 'MONTHLY',
      tac_amount: 0,
    });
  });

  it('usa payment_amount sem depender dos valores do schedule', async () => {
    const { service } = build();
    mockResponse({
      ...result,
      payment_amount: 700,
      schedule: [{ period: 1, payment: 699.99 }],
    });

    await expect(service.simulateRequestedAmount(input)).resolves.toEqual(
      expect.objectContaining({ payment_amount: 700 }),
    );
  });

  it('devolve 422 quando a Celcoin recusa as condições financeiras', async () => {
    const { service } = build();
    mockResponse(
      { message: 'invalid first payment date' },
      { ok: false, status: 422 },
    );

    await expect(service.simulateRequestedAmount(input)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('devolve 503 para erro 5xx do provedor', async () => {
    const { service } = build();
    mockResponse({ message: 'unavailable' }, { ok: false, status: 500 });

    await expect(service.simulateRequestedAmount(input)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('invalida o token quando o provedor recusa a autenticação', async () => {
    const { service, invalidate } = build();
    mockResponse({}, { ok: false, status: 401 });

    await expect(service.simulateRequestedAmount(input)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...result, payment_amount: 0 },
    { ...result, payment_amount: undefined },
    { ...result, total_amount_owed: undefined },
  ])('rejeita resposta de sucesso fora do contrato', async (payload) => {
    const { service } = build();
    mockResponse(payload);

    await expect(service.simulateRequestedAmount(input)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('devolve 503 quando a chamada falha por rede ou timeout', async () => {
    const { service } = build();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(service.simulateRequestedAmount(input)).rejects.toThrow(
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
    const auth = {
      getAccessToken: jest.fn(),
      invalidate: jest.fn(),
    } as unknown as CelcoinAuthService;
    const service = new CelcoinSimulationService(celcoinConfig, auth);

    await expect(service.simulateRequestedAmount(input)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
