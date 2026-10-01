import { Injectable } from '@nestjs/common';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

/**
 * Limite básico em memória, por usuário, pra proteger a cota paga da
 * ZeroBounce — compartilhada com o trigo-connector, que o Backoffice
 * depende pra sua própria operação — de um loop de retry com bug ou de
 * abuso deliberado. `QUOTE_CREATE` (a permissão deste endpoint) é ampla,
 * de qualquer parceiro que cria propostas, não só backoffice interno.
 *
 * NÃO coordena entre instâncias/tasks — cada réplica do serviço tem seu
 * próprio contador, então o limite efetivo cresce com o número de
 * instâncias rodando. É uma primeira linha de defesa, não uma garantia
 * dura. Se a cota real virar problema, mover pra um limiter compartilhado
 * (Redis) ou @nestjs/throttler.
 */
@Injectable()
export class EmailValidationRateLimiterService {
  private readonly hitsByUser = new Map<string, number[]>();

  /** true se o usuário ainda tem cota nesta janela (e já registra o uso). */
  consume(userId: string): boolean {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const recentHits = (this.hitsByUser.get(userId) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );

    if (recentHits.length >= MAX_REQUESTS_PER_WINDOW) {
      this.hitsByUser.set(userId, recentHits);
      return false;
    }

    recentHits.push(now);
    this.hitsByUser.set(userId, recentHits);
    return true;
  }
}
