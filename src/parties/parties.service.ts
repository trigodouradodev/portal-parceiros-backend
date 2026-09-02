import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeCpf } from '../common/cpf.util';
import { PrismaService } from '../prisma/prisma.service';
import { PartyFormData } from './interfaces/party-form-lookup-response.interface';
import { PartyLookupData } from './interfaces/party-lookup-response.interface';

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

interface PartyFormRow extends PartyRow {
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip_code: string | null;
}

type PartyQueryClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findDataByCpf(value: string): Promise<PartyLookupData | null> {
    const document = normalizeCpf(value);
    const party = await this.findRecordByCpf(document, this.prisma);

    if (!party) return null;

    return {
      name: party.name,
      document,
      email: party.email,
      telephone: party.phone,
    };
  }

  async findFormDataByCpf(value: string): Promise<PartyFormData | null> {
    const document = normalizeCpf(value);
    const [party] = await this.prisma.$queryRaw<PartyFormRow[]>`
      SELECT
        p.id,
        p.name,
        p.tax_id,
        p.email,
        p.phone,
        a.street AS address_street,
        a.number AS address_number,
        a.complement AS address_complement,
        a.neighborhood AS address_neighborhood,
        a.city AS address_city,
        a.state AS address_state,
        a.zip_code AS address_zip_code
      FROM public.parties p
      LEFT JOIN LATERAL (
        SELECT
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
          zip_code
        FROM public.addresses
        WHERE client_id = p.id
        ORDER BY is_primary DESC NULLS LAST, created_at DESC, id DESC
        LIMIT 1
      ) a ON TRUE
      WHERE regexp_replace(p.tax_id, '\\D', '', 'g') = ${document}
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT 1
    `;

    if (!party) return null;

    return {
      name: party.name,
      document,
      email: party.email,
      telephone: party.phone,
      address: party.address_street
        ? {
            zipCode: party.address_zip_code?.replace(/\D/g, '') ?? '',
            streetName: party.address_street,
            streetNumber: party.address_number ?? '',
            streetComplement: party.address_complement ?? '',
            streetDistrict: party.address_neighborhood ?? '',
            city: party.address_city ?? '',
            state: party.address_state?.trim().toUpperCase() ?? null,
          }
        : null,
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
    const existing = await this.findRecordByCpf(document, tx);
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

    const raceWinner = await this.findRecordByCpf(document, tx);
    if (!raceWinner) {
      throw new Error(
        'Falha ao resolver identidade: CPF em conflito, mas não encontrado.',
      );
    }

    return raceWinner.id;
  }

  private async findRecordByCpf(
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
