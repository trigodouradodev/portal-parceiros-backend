import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import {
  BLOCKED_ZERO_BOUNCE_STATUSES,
  ZeroBounceStatus,
} from './enums/zero-bounce-status.enum';
import { EmailValidationResult } from './interfaces/email-validation-result.interface';

const DEFAULT_API_URL = 'https://api.zerobounce.net/v2/validate';
const REQUEST_TIMEOUT_MS = 10_000;

interface ZeroBounceRawResponse {
  address: string;
  status: string;
  sub_status: string;
  domain: string;
  mx_found: string;
  did_you_mean?: string | null;
  error?: string;
}

/**
 * Verifica a entregabilidade de um e-mail via ZeroBounce. Lê a credencial da
 * mesma tabela `system_configs` já usada pelo trigo-connector (banco
 * compartilhado — chaves ZEROBOUNCE_API_KEY/ZEROBOUNCE_API_URL já existem
 * lá, nenhuma credencial nova precisou ser provisionada).
 *
 * Fail-open sempre: qualquer falha na integração (sem credencial, timeout,
 * erro HTTP, erro de negócio da própria ZeroBounce) devolve um resultado
 * com `checked: false` e `isAcceptable: true` — nunca lança exceção, nunca
 * bloqueia o fluxo de proposta por causa de uma integração externa.
 */
@Injectable()
export class EmailValidationService {
  private readonly logger = new Logger(EmailValidationService.name);

  constructor(private readonly systemConfigs: SystemConfigsService) {}

  async validate(email: string): Promise<EmailValidationResult> {
    const { ZEROBOUNCE_API_KEY: apiKey, ZEROBOUNCE_API_URL: apiUrl } =
      await this.systemConfigs.getValues([
        'ZEROBOUNCE_API_KEY',
        'ZEROBOUNCE_API_URL',
      ]);

    if (!apiKey) {
      this.logger.error('ZEROBOUNCE_API_KEY não configurada.');
      return this.uncheckedResult(email);
    }

    let payload: ZeroBounceRawResponse;
    try {
      // ZEROBOUNCE_API_URL vem de uma tabela mutável e compartilhada com o
      // trigo-connector — `new URL()` lança de forma síncrona se o valor
      // estiver malformado, então precisa estar dentro do try pra não
      // furar o fail-open.
      const url = new URL(apiUrl || DEFAULT_API_URL);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('email', email);

      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = (await response.json()) as ZeroBounceRawResponse;
    } catch (error) {
      this.logger.error(`Falha ao chamar a ZeroBounce: ${String(error)}`);
      return this.uncheckedResult(email);
    }

    if (payload.error) {
      this.logger.error(
        `ZeroBounce retornou erro de negócio: ${payload.error}`,
      );
      return this.uncheckedResult(email);
    }

    const status = payload.status as ZeroBounceStatus;
    return {
      email,
      status,
      subStatus: payload.sub_status,
      isAcceptable: !BLOCKED_ZERO_BOUNCE_STATUSES.includes(status),
      checked: true,
      didYouMean: payload.did_you_mean || null,
    };
  }

  private uncheckedResult(email: string): EmailValidationResult {
    return {
      email,
      status: ZeroBounceStatus.UNKNOWN,
      subStatus: '',
      isAcceptable: true,
      checked: false,
      didYouMean: null,
    };
  }
}
