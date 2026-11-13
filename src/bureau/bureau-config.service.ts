import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MissingSystemConfigError } from '../system-configs/errors/missing-system-config.error';
import { SystemConfigsService } from '../system-configs/system-configs.service';

export interface BureauIntegrationConfig {
  baseUrl: string;
  apiKey: string;
}

const CONFIG_KEYS = {
  baseUrl: 'BUREAU_BASE_URL',
  apiKey: 'BUREAU_API_KEY',
} as const;

/**
 * Lê de `system_configs` o endereço e a chave da Consulta de Bureaus (rota
 * `POST /backoffice/bureau/lookup` do trigo-api). A chave identifica o
 * consumidor `portal_parceiros`, que lá só tem o Serasa liberado.
 */
@Injectable()
export class BureauConfigService {
  constructor(private readonly systemConfigs: SystemConfigsService) {}

  async getConfig(): Promise<BureauIntegrationConfig> {
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
      apiKey: required(CONFIG_KEYS.apiKey),
    };
  }
}
