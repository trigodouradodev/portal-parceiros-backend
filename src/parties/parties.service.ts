import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeCpf } from '../common/cpf.util';
import { PrismaService } from '../prisma/prisma.service';
import { PartyLookupResponse } from './interfaces/party-lookup-response.interface';

interface PartyRow {
  id: string;
  name: string;
  tax_id: string;
  email: string | null;
  phone: string | null;
}

interface PartyIdentityInput {
  name: string;
  document: string;
  email: string;
  telephone: string;
}

type PartyQueryClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  async lookupByCpf(value: string): Promise<PartyLookupResponse> {
    const document = normalizeCpf(value);
    const party = await this.findByCpf(document, this.prisma);

    if (!party) {
      return { found: false, party: null };
    }

    return {
      found: true,
      party: {
        name: party.name,
        document,
        email: party.email,
        telephone: party.phone,
      },
    };
  }

  /**
   * Resolve a identidade dentro da mesma transação que cria a simulação.
   *
   * Enquanto a migração `clients` -> `parties` estiver ativa, novas pessoas
   * entram por `clients`; o trigger do connector replica a linha para
   * `parties` mantendo o mesmo ID. Identidades existentes nunca são
   * sobrescritas pelos dados digitados na simulação.
   */
  async resolveForSimulation(
    input: PartyIdentityInput,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const document = normalizeCpf(input.document);
    const existing = await this.findByCpf(document, tx);
    if (existing) return existing.id;

    const [inserted] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO public.clients (
        name,
        tax_id,
        tax_id_type,
        email,
        phone
      )
      VALUES (
        ${input.name.trim()},
        ${document},
        'cpf',
        ${input.email.trim().toLowerCase()},
        ${formatPartyPhone(input.telephone)}
      )
      ON CONFLICT (tax_id) DO NOTHING
      RETURNING id
    `;

    if (inserted) return inserted.id;

    const raceWinner = await this.findByCpf(document, tx);
    if (!raceWinner) {
      throw new Error(
        'Falha ao resolver identidade: CPF em conflito, mas não encontrado.',
      );
    }

    return raceWinner.id;
  }

  private async findByCpf(
    document: string,
    client: PartyQueryClient,
  ): Promise<PartyRow | undefined> {
    const [party] = await client.$queryRaw<PartyRow[]>`
      SELECT
        id,
        name,
        tax_id,
        email,
        phone
      FROM public.parties
      WHERE regexp_replace(tax_id, '\\D', '', 'g') = ${document}
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `;

    return party;
  }
}

function formatPartyPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const nationalNumber = digits.startsWith('55') ? digits.slice(2) : digits;

  if (/^\d{10,11}$/.test(nationalNumber)) {
    return `+55${nationalNumber}`;
  }

  return value;
}
