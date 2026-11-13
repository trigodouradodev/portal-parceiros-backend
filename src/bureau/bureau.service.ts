import { Injectable, Logger } from '@nestjs/common';
import { BureauConfigService } from './bureau-config.service';
import { CreditRiskConfigService } from './credit-risk-config.service';

/**
 * Sem cache, a consulta roda o Serasa de verdade. O tempo é folgado para isso,
 * mas curto o bastante para a simulação não ficar pendurada: a consulta roda em
 * paralelo com a Celcoin e a Caburé.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Cliente da Consulta de Bureaus (trigo-api), só o score do Serasa.
 *
 * Nunca lança: o score é um indicativo e não pode impedir a simulação de
 * crédito. Qualquer falha (consulta desligada, config ausente, bureau sem dado
 * ou fora do ar) devolve `null` e fica no log, sem CPF nem dado do bureau.
 */
@Injectable()
export class BureauService {
  private readonly logger = new Logger(BureauService.name);

  constructor(
    private readonly bureauConfig: BureauConfigService,
    private readonly creditRiskConfig: CreditRiskConfigService,
  ) {}

  /**
   * @param cpf 11 dígitos, sem máscara, com dígito verificador válido.
   * @param requestedBy quem originou a consulta, para a trilha de acesso.
   */
  async lookupSerasaScore(
    cpf: string,
    requestedBy: string,
  ): Promise<number | null> {
    try {
      if (!(await this.creditRiskConfig.isLookupEnabled())) return null;

      const { baseUrl, apiKey } = await this.bureauConfig.getConfig();
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/backoffice/bureau/lookup`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Bureau-API-Key': apiKey,
            'X-Requested-By': requestedBy,
          },
          body: JSON.stringify({ cpf }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Consulta de bureau falhou com HTTP ${response.status}.`,
        );
        return null;
      }

      return extractSerasaScore(await response.json());
    } catch (error) {
      this.logger.warn(`Consulta de bureau indisponível: ${String(error)}`);
      return null;
    }
  }
}

/** `NOT_FOUND`, `FAILED` e `SKIPPED` não são score: valem como "sem dado". */
function extractSerasaScore(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const serasa = (payload as Record<string, unknown>).serasa;
  if (!serasa || typeof serasa !== 'object') return null;
  const { status, score } = serasa as Record<string, unknown>;
  if (status !== 'success') return null;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}
