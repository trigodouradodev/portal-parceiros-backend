import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CabureConfigService } from './cabure-config.service';

interface CabureLoginResponse {
  accessToken?: unknown;
  expiresAt?: unknown;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

// Login da Caburé não devolve refreshToken, só accessToken + expiresAt
// (ISO date). Renovação proativa com 10min de folga — mesmo padrão do
// CabureAuthService do trigo-api.
const TOKEN_EXPIRY_SAFETY_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Autenticação da Caburé (mesmas credenciais já usadas pelo trigo-api). */
@Injectable()
export class CabureAuthService {
  private readonly logger = new Logger(CabureAuthService.name);
  private cachedToken?: CachedToken;
  private pendingToken?: Promise<string>;

  constructor(private readonly cabureConfig: CabureConfigService) {}

  async getAccessToken(force = false): Promise<string> {
    if (!force && this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    if (!this.pendingToken) {
      this.pendingToken = this.login().finally(() => {
        this.pendingToken = undefined;
      });
    }

    return this.pendingToken;
  }

  invalidate(): void {
    this.cachedToken = undefined;
  }

  private async login(): Promise<string> {
    const config = await this.cabureConfig.getConfig();

    let response: Response;
    try {
      response = await fetch(
        `${trimTrailingSlash(config.baseUrl)}/v2/auth/login`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      this.logger.error(`Falha ao autenticar na Caburé: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Serviço de seguro temporariamente indisponível.',
      );
    }

    if (!response.ok) {
      this.logger.error(`Login Caburé falhou com HTTP ${response.status}.`);
      throw new ServiceUnavailableException(
        'Não foi possível autenticar no serviço de seguro.',
      );
    }

    let payload: CabureLoginResponse;
    try {
      payload = (await response.json()) as CabureLoginResponse;
    } catch (error) {
      this.logger.error(
        `Não foi possível interpretar a resposta de login da Caburé: ${String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Serviço de seguro retornou uma resposta inválida.',
      );
    }

    if (
      typeof payload.accessToken !== 'string' ||
      !payload.accessToken ||
      typeof payload.expiresAt !== 'string'
    ) {
      throw new ServiceUnavailableException(
        'Resposta de login da Caburé inválida.',
      );
    }

    this.cachedToken = {
      value: payload.accessToken,
      expiresAt: new Date(payload.expiresAt).getTime() - TOKEN_EXPIRY_SAFETY_MS,
    };
    return this.cachedToken.value;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
