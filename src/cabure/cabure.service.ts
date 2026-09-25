import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CabureAuthService } from './cabure-auth.service';
import { CabureConfigService } from './cabure-config.service';
import { CabureQuote } from './interfaces/cabure-quote.interface';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Cliente Caburé (seguro prestamista) — só o necessário para cotar antes de
 * simular. Demais operações (proposta real, listagem) continuam sendo
 * responsabilidade exclusiva do trigo-api.
 */
@Injectable()
export class CabureService {
  private readonly logger = new Logger(CabureService.name);

  constructor(
    private readonly cabureConfig: CabureConfigService,
    private readonly auth: CabureAuthService,
  ) {}

  async quote(
    loanAmount: number,
    loanPeriodInMonths: number,
  ): Promise<CabureQuote> {
    const config = await this.cabureConfig.getConfig();
    return this.request(
      config.baseUrl,
      config.productCode,
      loanAmount,
      loanPeriodInMonths,
    );
  }

  private async request(
    baseUrl: string,
    productCode: string,
    loanAmount: number,
    loanPeriodInMonths: number,
    retry = true,
  ): Promise<CabureQuote> {
    const token = await this.auth.getAccessToken();

    let response: Response;
    try {
      response = await fetch(`${trimTrailingSlash(baseUrl)}/v2/quotes`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productCode,
          loanAmount,
          loanPeriodInMonths,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Falha ao cotar seguro na Caburé: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Serviço de seguro temporariamente indisponível.',
      );
    }

    if (response.status === 401 && retry) {
      await this.auth.getAccessToken(true);
      return this.request(
        baseUrl,
        productCode,
        loanAmount,
        loanPeriodInMonths,
        false,
      );
    }

    if (!response.ok) {
      this.logger.error(`Cotação Caburé falhou com HTTP ${response.status}.`);
      throw new ServiceUnavailableException(
        'Não foi possível cotar o seguro no momento.',
      );
    }

    const payload = await this.readJson(response);
    if (!isCabureQuote(payload)) {
      this.logger.error('Cotação Caburé retornou um contrato inválido.');
      throw new ServiceUnavailableException(
        'Serviço de seguro retornou uma resposta inválida.',
      );
    }

    return payload;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      this.logger.error(
        `Não foi possível interpretar a resposta da Caburé: ${String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Serviço de seguro retornou uma resposta inválida.',
      );
    }
  }
}

function isCabureQuote(value: unknown): value is CabureQuote {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.id === 'string' &&
    result.id.length > 0 &&
    typeof result.premium === 'number' &&
    Number.isFinite(result.premium) &&
    result.premium > 0
  );
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
