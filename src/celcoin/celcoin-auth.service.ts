import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CelcoinConfigService } from './celcoin-config.service';

interface CelcoinTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

const TOKEN_EXPIRY_SAFETY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Autenticação OAuth2 client-credentials do originador Celcoin. */
@Injectable()
export class CelcoinAuthService {
  private readonly logger = new Logger(CelcoinAuthService.name);
  private cachedToken?: CachedToken;
  private pendingToken?: Promise<string>;

  constructor(private readonly celcoinConfig: CelcoinConfigService) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    if (!this.pendingToken) {
      this.pendingToken = this.authenticate().finally(() => {
        this.pendingToken = undefined;
      });
    }

    return this.pendingToken;
  }

  invalidate(): void {
    this.cachedToken = undefined;
  }

  private async authenticate(): Promise<string> {
    const config = await this.celcoinConfig.getConfig();
    const credentials = Buffer.from(
      `${config.originatorId}:${config.originatorSecret}`,
    ).toString('base64');

    try {
      const response = await fetch(
        `${trimTrailingSlash(config.authBaseUrl)}/oauth2/token`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Autenticação Celcoin falhou com HTTP ${response.status}.`,
        );
        throw new ServiceUnavailableException(
          'Não foi possível autenticar no serviço de simulação.',
        );
      }

      const payload = (await response.json()) as CelcoinTokenResponse;
      if (typeof payload.access_token !== 'string' || !payload.access_token) {
        throw new Error('Resposta de autenticação sem access_token.');
      }

      const expiresIn =
        typeof payload.expires_in === 'number' && payload.expires_in > 0
          ? payload.expires_in
          : 300;
      this.cachedToken = {
        value: payload.access_token,
        expiresAt:
          Date.now() +
          Math.max(expiresIn * 1_000 - TOKEN_EXPIRY_SAFETY_MS, 1_000),
      };
      return payload.access_token;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Falha ao autenticar na Celcoin: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Serviço de simulação temporariamente indisponível.',
      );
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
