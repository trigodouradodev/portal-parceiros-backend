import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MissingSystemConfigError } from '../system-configs/errors/missing-system-config.error';
import { SystemConfigsService } from '../system-configs/system-configs.service';

export interface CelcoinIntegrationConfig {
  authBaseUrl: string;
  platformBaseUrl: string;
  originatorId: string;
  originatorSecret: string;
  productId: string;
}

const CONFIG_KEYS = {
  authBaseUrl: 'CELCOIN_AUTH_BASE_URL',
  platformBaseUrl: 'CELCOIN_PLATFORM_BASE_URL',
  originatorId: 'CELCOIN_ORIGINATOR_ID',
  originatorSecret: 'CELCOIN_ORIGINATOR_SECRET',
  productId: 'CELCOIN_PRODUCT_ID',
} as const;

/** Lê a configuração Celcoin da mesma `system_configs` usada pelo connector. */
@Injectable()
export class CelcoinConfigService {
  constructor(private readonly systemConfigs: SystemConfigsService) {}

  async getConfig(): Promise<CelcoinIntegrationConfig> {
    let values: Record<string, string>;
    try {
      values = await this.systemConfigs.getRequiredValues(
        Object.values(CONFIG_KEYS),
      );
    } catch (error) {
      if (error instanceof MissingSystemConfigError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
    const required = (key: string): string => {
      const value = values[key]?.trim();
      if (!value) {
        throw new ServiceUnavailableException(
          `Configuração ${key} vazia em system_configs.`,
        );
      }
      return value;
    };

    return {
      authBaseUrl: required(CONFIG_KEYS.authBaseUrl),
      platformBaseUrl: required(CONFIG_KEYS.platformBaseUrl),
      originatorId: required(CONFIG_KEYS.originatorId),
      originatorSecret: required(CONFIG_KEYS.originatorSecret),
      productId: required(CONFIG_KEYS.productId),
    };
  }
}
