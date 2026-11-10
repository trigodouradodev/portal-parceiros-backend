import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigsService } from '../system-configs/system-configs.service';

/** Limites das faixas: abaixo de `highBelow` é alto; acima de `lowAbove`, baixo. */
export interface CreditRiskBands {
  highBelow: number;
  lowAbove: number;
}

const LOOKUP_ENABLED_KEY = 'CREDIT_RISK_LOOKUP_ENABLED';
const BANDS_KEY = 'CREDIT_RISK_BANDS';

export const DEFAULT_CREDIT_RISK_BANDS: CreditRiskBands = {
  highBelow: 400,
  lowAbove: 700,
};

/**
 * Configuração do risco de crédito em `system_configs` (cache de 5 min): mudar
 * as faixas ou desligar a consulta não exige deploy.
 */
@Injectable()
export class CreditRiskConfigService {
  private readonly logger = new Logger(CreditRiskConfigService.name);

  constructor(private readonly systemConfigs: SystemConfigsService) {}

  /** Cada consulta é paga: `CREDIT_RISK_LOOKUP_ENABLED=false` desliga. */
  async isLookupEnabled(): Promise<boolean> {
    const value = await this.systemConfigs.getValue(LOOKUP_ENABLED_KEY);
    return value?.trim().toLowerCase() !== 'false';
  }

  /**
   * `CREDIT_RISK_BANDS` = `{"highBelow":400,"lowAbove":700}`. Ausente usa o
   * padrão. Inválida devolve `null` (sem faixa): mostrar uma faixa calculada
   * com limite quebrado é pior do que não mostrar.
   */
  async getBands(): Promise<CreditRiskBands | null> {
    const raw = await this.systemConfigs.getValue(BANDS_KEY);
    if (raw === null) return DEFAULT_CREDIT_RISK_BANDS;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isCreditRiskBands(parsed)) return parsed;
    } catch {
      // cai no log abaixo
    }
    this.logger.error(`${BANDS_KEY} inválida em system_configs.`);
    return null;
  }
}

function isCreditRiskBands(value: unknown): value is CreditRiskBands {
  if (!value || typeof value !== 'object') return false;
  const { highBelow, lowAbove } = value as Record<string, unknown>;
  return (
    typeof highBelow === 'number' &&
    typeof lowAbove === 'number' &&
    Number.isFinite(highBelow) &&
    Number.isFinite(lowAbove) &&
    highBelow >= 0 &&
    highBelow <= lowAbove
  );
}
