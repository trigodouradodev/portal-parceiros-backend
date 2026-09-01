import { ServiceUnavailableException } from '@nestjs/common';
import { MissingSystemConfigError } from '../system-configs/errors/missing-system-config.error';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import { CelcoinConfigService } from './celcoin-config.service';

const values: Record<string, string> = {
  CELCOIN_AUTH_BASE_URL: ' https://auth.celcoin.test/ ',
  CELCOIN_PLATFORM_BASE_URL: 'https://api.celcoin.test',
  CELCOIN_ORIGINATOR_ID: 'originator-id',
  CELCOIN_ORIGINATOR_SECRET: 'originator-secret',
  CELCOIN_PRODUCT_ID: 'produto-pf-clean',
};

function build(configValues = values) {
  const getRequiredValues = jest.fn().mockResolvedValue(configValues);
  const systemConfigs = {
    getRequiredValues,
  } as unknown as SystemConfigsService;
  return {
    service: new CelcoinConfigService(systemConfigs),
    getRequiredValues,
  };
}

describe('CelcoinConfigService', () => {
  it('interpreta as cinco system configs do contrato Celcoin', async () => {
    const { service, getRequiredValues } = build();

    await expect(service.getConfig()).resolves.toEqual({
      authBaseUrl: 'https://auth.celcoin.test/',
      platformBaseUrl: 'https://api.celcoin.test',
      originatorId: 'originator-id',
      originatorSecret: 'originator-secret',
      productId: 'produto-pf-clean',
    });
    expect(getRequiredValues).toHaveBeenCalledWith([
      'CELCOIN_AUTH_BASE_URL',
      'CELCOIN_PLATFORM_BASE_URL',
      'CELCOIN_ORIGINATOR_ID',
      'CELCOIN_ORIGINATOR_SECRET',
      'CELCOIN_PRODUCT_ID',
    ]);
  });

  it('converte chave ausente em indisponibilidade da integração', async () => {
    const { service, getRequiredValues } = build();
    getRequiredValues.mockRejectedValueOnce(
      new MissingSystemConfigError(['CELCOIN_PRODUCT_ID']),
    );

    await expect(service.getConfig()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('devolve 503 quando uma chave existe vazia', async () => {
    const { service } = build({
      ...values,
      CELCOIN_ORIGINATOR_SECRET: ' ',
    });

    await expect(service.getConfig()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
