import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MissingSystemConfigError } from '../system-configs/errors/missing-system-config.error';
import { SystemConfigsService } from '../system-configs/system-configs.service';

export interface CabureIntegrationConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  productCode: string;
}

const CONFIG_KEYS = {
  baseUrl: 'CABURE_BASE_URL',
  clientId: 'CABURE_CLIENT_ID',
  clientSecret: 'CABURE_CLIENT_SECRET',
  productCode: 'CABURE_PRODUCT_CODE',
} as const;

/**
 * Lê a configuração Caburé da mesma `system_configs` usada pelo Celcoin.
 *
 * As credenciais (CABURE_CLIENT_ID/SECRET) são as mesmas já usadas pelo
 * trigo-api — reaproveitadas de propósito, não uma integração nova e
 * independente com a Caburé.
 */
@Injectable()
export class CabureConfigService {
  constructor(private readonly systemConfigs: SystemConfigsService) {}

  async getConfig(): Promise<CabureIntegrationConfig> {
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
      baseUrl: required(CONFIG_KEYS.baseUrl),
      clientId: required(CONFIG_KEYS.clientId),
      clientSecret: required(CONFIG_KEYS.clientSecret),
      productCode: required(CONFIG_KEYS.productCode),
    };
  }
}
