import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CelcoinAuthService } from './celcoin-auth.service';
import { CelcoinConfigService } from './celcoin-config.service';
import {
  CelcoinSimulationInput,
  CelcoinSimulationResult,
} from './interfaces/celcoin-simulation.interface';

const REQUEST_TIMEOUT_MS = 10_000;

/** Gateway do preview de crédito por valor solicitado da Celcoin. */
@Injectable()
export class CelcoinSimulationService {
  private readonly logger = new Logger(CelcoinSimulationService.name);

  constructor(
    private readonly celcoinConfig: CelcoinConfigService,
    private readonly auth: CelcoinAuthService,
  ) {}

  async simulateRequestedAmount(
    input: CelcoinSimulationInput,
  ): Promise<CelcoinSimulationResult> {
    const config = await this.celcoinConfig.getConfig();
    const token = await this.auth.getAccessToken();
    const url = `${trimTrailingSlash(config.platformBaseUrl)}/banking/originator/products/${encodeURIComponent(config.productId)}/preview`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requested_amount: input.requestedAmount,
          interest_rate: input.interestRate,
          finance_fee: 0,
          insurance_amount: 0,
          iof_type: 'PERSON',
          num_payments: input.installments,
          first_payment_date: input.firstPaymentDate,
          disbursement_date: todayInSaoPaulo(),
          schedule_type: 'MONTHLY',
          tac_amount: 0,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Falha ao chamar preview Celcoin: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Serviço de simulação temporariamente indisponível.',
      );
    }

    if (!response.ok) {
      this.logger.error(`Preview Celcoin falhou com HTTP ${response.status}.`);
      if (response.status === 401 || response.status === 403) {
        this.auth.invalidate();
        throw new ServiceUnavailableException(
          'Não foi possível autenticar no serviço de simulação.',
        );
      }
      if (response.status >= 400 && response.status < 500) {
        throw new UnprocessableEntityException(
          'A Celcoin não aceitou as condições informadas para a simulação.',
        );
      }
      throw new ServiceUnavailableException(
        'Serviço de simulação temporariamente indisponível.',
      );
    }

    const payload = await this.readJson(response);
    if (!isSimulationResult(payload)) {
      this.logger.error('Preview Celcoin retornou um contrato inválido.');
      throw new ServiceUnavailableException(
        'Serviço de simulação retornou uma resposta inválida.',
      );
    }

    return payload;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      this.logger.error(
        `Não foi possível interpretar a resposta Celcoin: ${String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Serviço de simulação retornou uma resposta inválida.',
      );
    }
  }
}

function isSimulationResult(value: unknown): value is CelcoinSimulationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.payment_amount === 'number' &&
    Number.isFinite(result.payment_amount) &&
    result.payment_amount > 0 &&
    typeof result.total_amount_owed === 'number' &&
    Number.isFinite(result.total_amount_owed) &&
    result.total_amount_owed > 0
  );
}

function todayInSaoPaulo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
