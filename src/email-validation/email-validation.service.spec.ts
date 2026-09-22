import { EmailValidationService } from './email-validation.service';
import { SystemConfigsService } from '../system-configs/system-configs.service';

const originalFetch = global.fetch;

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('EmailValidationService', () => {
  let service: EmailValidationService;
  let systemConfigs: { getValues: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    systemConfigs = { getValues: jest.fn() };
    service = new EmailValidationService(
      systemConfigs as unknown as SystemConfigsService,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('aceita um e-mail válido segundo a ZeroBounce', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: null,
    });
    fetchMock.mockResolvedValue(
      response({
        address: 'maria@email.com',
        status: 'valid',
        sub_status: '',
        domain: 'email.com',
        mx_found: 'true',
        did_you_mean: null,
      }),
    );

    await expect(service.validate('maria@email.com')).resolves.toEqual({
      email: 'maria@email.com',
      status: 'valid',
      subStatus: '',
      isAcceptable: true,
      checked: true,
      didYouMean: null,
    });
  });

  it.each(['invalid', 'spamtrap', 'abuse', 'do_not_mail'])(
    'reprova e-mail com status %s',
    async (status) => {
      systemConfigs.getValues.mockResolvedValue({
        ZEROBOUNCE_API_KEY: 'fake-key',
        ZEROBOUNCE_API_URL: null,
      });
      fetchMock.mockResolvedValue(
        response({
          address: 'maria@email.com',
          status,
          sub_status: 'mailbox_not_found',
          domain: 'email.com',
          mx_found: 'true',
        }),
      );

      const result = await service.validate('maria@email.com');
      expect(result.isAcceptable).toBe(false);
      expect(result.checked).toBe(true);
    },
  );

  it.each(['catch-all', 'unknown'])(
    'aceita e-mail com status %s (evita falso negativo)',
    async (status) => {
      systemConfigs.getValues.mockResolvedValue({
        ZEROBOUNCE_API_KEY: 'fake-key',
        ZEROBOUNCE_API_URL: null,
      });
      fetchMock.mockResolvedValue(
        response({
          address: 'maria@email.com',
          status,
          sub_status: '',
          domain: 'email.com',
          mx_found: 'true',
        }),
      );

      const result = await service.validate('maria@email.com');
      expect(result.isAcceptable).toBe(true);
      expect(result.checked).toBe(true);
    },
  );

  it('devolve did_you_mean quando a ZeroBounce sugere correção', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: null,
    });
    fetchMock.mockResolvedValue(
      response({
        address: 'maria@gmial.com',
        status: 'unknown',
        sub_status: '',
        domain: 'gmial.com',
        mx_found: 'false',
        did_you_mean: 'maria@gmail.com',
      }),
    );

    const result = await service.validate('maria@gmial.com');
    expect(result.didYouMean).toBe('maria@gmail.com');
  });

  it('falha aberto (checked=false, isAcceptable=true) quando a credencial não está configurada', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: null,
      ZEROBOUNCE_API_URL: null,
    });

    await expect(service.validate('maria@email.com')).resolves.toEqual({
      email: 'maria@email.com',
      status: 'unknown',
      subStatus: '',
      isAcceptable: true,
      checked: false,
      didYouMean: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha aberto quando a chamada HTTP falha', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: null,
    });
    fetchMock.mockRejectedValue(new Error('network error'));

    const result = await service.validate('maria@email.com');
    expect(result.checked).toBe(false);
    expect(result.isAcceptable).toBe(true);
  });

  it('falha aberto quando a ZeroBounce responde com status HTTP de erro', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: null,
    });
    fetchMock.mockResolvedValue(response({}, false, 500));

    const result = await service.validate('maria@email.com');
    expect(result.checked).toBe(false);
    expect(result.isAcceptable).toBe(true);
  });

  it('falha aberto quando a ZeroBounce retorna erro de negócio', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: null,
    });
    fetchMock.mockResolvedValue(
      response({
        address: 'maria@email.com',
        status: 'unknown',
        sub_status: '',
        domain: '',
        mx_found: 'false',
        error: 'invalid_api_key',
      }),
    );

    const result = await service.validate('maria@email.com');
    expect(result.checked).toBe(false);
    expect(result.isAcceptable).toBe(true);
  });

  it('usa ZEROBOUNCE_API_URL quando configurada, senão o endpoint padrão', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: 'https://custom.example/validate',
    });
    fetchMock.mockResolvedValue(
      response({
        address: 'maria@email.com',
        status: 'valid',
        sub_status: '',
        domain: 'email.com',
        mx_found: 'true',
      }),
    );

    await service.validate('maria@email.com');

    const [calledUrl] = fetchMock.mock.calls[0] as [URL];
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      'https://custom.example/validate',
    );
    expect(calledUrl.searchParams.get('api_key')).toBe('fake-key');
    expect(calledUrl.searchParams.get('email')).toBe('maria@email.com');
  });

  it('falha aberto (sem lançar) quando ZEROBOUNCE_API_URL está malformada', async () => {
    systemConfigs.getValues.mockResolvedValue({
      ZEROBOUNCE_API_KEY: 'fake-key',
      ZEROBOUNCE_API_URL: 'não é uma url válida ://',
    });

    await expect(service.validate('maria@email.com')).resolves.toEqual({
      email: 'maria@email.com',
      status: 'unknown',
      subStatus: '',
      isAcceptable: true,
      checked: false,
      didYouMean: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
