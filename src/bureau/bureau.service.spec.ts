import { Logger } from '@nestjs/common';
import { BureauConfigService } from './bureau-config.service';
import { BureauService } from './bureau.service';
import { CreditRiskConfigService } from './credit-risk-config.service';

function build(options: { enabled?: boolean; configError?: Error } = {}) {
  const getConfig = jest.fn().mockImplementation(() =>
    options.configError
      ? Promise.reject(options.configError)
      : Promise.resolve({
          baseUrl: 'https://api.bureau.test/',
          apiKey: 'chave-secreta',
        }),
  );
  const isLookupEnabled = jest.fn().mockResolvedValue(options.enabled ?? true);
  return {
    service: new BureauService(
      { getConfig } as unknown as BureauConfigService,
      { isLookupEnabled } as unknown as CreditRiskConfigService,
    ),
    getConfig,
    isLookupEnabled,
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

const CPF = '52998224725';
const REQUESTED_BY = 'portal-parceiros:user-1';

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BureauService.lookupSerasaScore', () => {
  it('chama a rota de lookup com a chave, o solicitante e o CPF', async () => {
    mockResponse({ serasa: { status: 'success', score: 639 } });
    const { service } = build();

    await expect(service.lookupSerasaScore(CPF, REQUESTED_BY)).resolves.toBe(
      639,
    );

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.bureau.test/backoffice/bureau/lookup');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'X-Bureau-API-Key': 'chave-secreta',
      'X-Requested-By': REQUESTED_BY,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({ cpf: CPF });
  });

  it('ignora os blocos dos outros bureaus', async () => {
    mockResponse({
      serasa: { status: 'success', score: 450 },
      lemit: { status: 'success', renda: 500 },
      vaas: { status: 'success', score: 10 },
    });
    const { service } = build();

    await expect(service.lookupSerasaScore(CPF, REQUESTED_BY)).resolves.toBe(
      450,
    );
  });

  it.each(['NOT_FOUND', 'FAILED', 'SKIPPED'])(
    'devolve null quando o Serasa vem %s',
    async (status) => {
      mockResponse({ serasa: { status, score: null, error: 'x' } });
      const { service } = build();

      await expect(
        service.lookupSerasaScore(CPF, REQUESTED_BY),
      ).resolves.toBeNull();
    },
  );

  it.each([
    ['sem bloco serasa', {}],
    ['score em texto', { serasa: { status: 'success', score: '639' } }],
    ['score ausente', { serasa: { status: 'success' } }],
    ['corpo vazio', null],
  ])('devolve null com resposta inválida: %s', async (_label, payload) => {
    mockResponse(payload);
    const { service } = build();

    await expect(
      service.lookupSerasaScore(CPF, REQUESTED_BY),
    ).resolves.toBeNull();
  });

  it.each([400, 401, 500])(
    'devolve null e não repete com HTTP %i',
    async (status) => {
      mockResponse({ message: 'erro' }, { ok: false, status });
      const { service } = build();

      await expect(
        service.lookupSerasaScore(CPF, REQUESTED_BY),
      ).resolves.toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('devolve null quando a rede falha ou estoura o tempo', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    const { service } = build();

    await expect(
      service.lookupSerasaScore(CPF, REQUESTED_BY),
    ).resolves.toBeNull();
  });

  it('não consulta quando a consulta está desligada', async () => {
    const { service, getConfig } = build({ enabled: false });

    await expect(
      service.lookupSerasaScore(CPF, REQUESTED_BY),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('devolve null quando a configuração do bureau está ausente', async () => {
    const { service } = build({ configError: new Error('sem BUREAU_API_KEY') });

    await expect(
      service.lookupSerasaScore(CPF, REQUESTED_BY),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('não escreve o CPF nem a chave no log', async () => {
    mockResponse({}, { ok: false, status: 500 });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('falhou'));
    const { service } = build();

    await service.lookupSerasaScore(CPF, REQUESTED_BY);
    await service.lookupSerasaScore(CPF, REQUESTED_BY);

    const logged = (Logger.prototype.warn as jest.Mock).mock.calls
      .flat()
      .join(' ');
    expect(logged).not.toContain(CPF);
    expect(logged).not.toContain('chave-secreta');
  });
});
