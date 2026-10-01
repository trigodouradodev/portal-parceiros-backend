import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MissingSystemConfigError } from './errors/missing-system-config.error';

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1_000;

/** Acesso read-only compartilhado à tabela `system_configs`. */
@Injectable()
export class SystemConfigsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getValue(key: string): Promise<string | null> {
    const values = await this.getValues([key]);
    return values[key];
  }

  /** Busca chaves em lote e devolve `null` para as que não existem. */
  async getValues(
    keys: readonly string[],
  ): Promise<Record<string, string | null>> {
    const uniqueKeys = [...new Set(keys)];
    const now = Date.now();
    const keysToLoad = uniqueKeys.filter((key) => {
      const cached = this.cache.get(key);
      return !cached || cached.expiresAt <= now;
    });

    if (keysToLoad.length > 0) {
      const rows = await this.prisma.system_configs.findMany({
        where: { key: { in: keysToLoad } },
        select: { key: true, value: true },
      });
      const loaded = new Map(rows.map((row) => [row.key, row.value]));
      const expiresAt = now + CACHE_TTL_MS;
      for (const key of keysToLoad) {
        this.cache.set(key, { value: loaded.get(key) ?? null, expiresAt });
      }
    }

    return Object.fromEntries(
      uniqueKeys.map((key) => [key, this.cache.get(key)?.value ?? null]),
    );
  }

  /** Busca em lote e falha explicitamente se qualquer chave não existir. */
  async getRequiredValues(
    keys: readonly string[],
  ): Promise<Record<string, string>> {
    const values = await this.getValues(keys);
    const missing = [...new Set(keys)].filter((key) => values[key] === null);
    if (missing.length > 0) throw new MissingSystemConfigError(missing);
    return values as Record<string, string>;
  }
}
