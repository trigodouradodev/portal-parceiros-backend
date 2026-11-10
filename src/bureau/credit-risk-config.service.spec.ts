import { Logger } from '@nestjs/common';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import {
  CreditRiskConfigService,
  DEFAULT_CREDIT_RISK_BANDS,
} from './credit-risk-config.service';

function build(values: Record<string, string | null>) {
  const systemConfigs = {
    getValue: jest.fn((key: string) => Promise.resolve(values[key] ?? null)),
  } as unknown as SystemConfigsService;
  return new CreditRiskConfigService(systemConfigs);
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CreditRiskConfigService.getBands', () => {
  it('usa 400/700 quando a chave não existe', async () => {
    await expect(build({}).getBands()).resolves.toEqual(
      DEFAULT_CREDIT_RISK_BANDS,
    );
  });

  it('lê os limites de CREDIT_RISK_BANDS', async () => {
    const service = build({
      CREDIT_RISK_BANDS: '{"highBelow":450,"lowAbove":720}',
    });
    await expect(service.getBands()).resolves.toEqual({
      highBelow: 450,
      lowAbove: 720,
    });
  });

  it.each([
    ['JSON quebrado', '{highBelow'],
    ['campo ausente', '{"highBelow":400}'],
    ['texto no lugar do número', '{"highBelow":"400","lowAbove":600}'],
    ['limites invertidos', '{"highBelow":700,"lowAbove":600}'],
    ['limite negativo', '{"highBelow":-1,"lowAbove":600}'],
    ['lista', '[400,600]'],
  ])('devolve null e loga erro com %s', async (_label, raw) => {
    const service = build({ CREDIT_RISK_BANDS: raw });
    await expect(service.getBands()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('CreditRiskConfigService.isLookupEnabled', () => {
  it('liga por padrão, sem a chave', async () => {
    await expect(build({}).isLookupEnabled()).resolves.toBe(true);
  });

  it.each(['false', ' FALSE '])('desliga com %p', async (value) => {
    const service = build({ CREDIT_RISK_LOOKUP_ENABLED: value });
    await expect(service.isLookupEnabled()).resolves.toBe(false);
  });

  it('qualquer outro valor mantém ligada', async () => {
    const service = build({ CREDIT_RISK_LOOKUP_ENABLED: 'true' });
    await expect(service.isLookupEnabled()).resolves.toBe(true);
  });
});
