import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteEventType } from '../../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../../quote-events/quote-events.service';
import { QuoteStatus } from '../enums/quote-status.enum';
import {
  buildRenewalPrefillUpdate,
  RENEWAL_PREFILL_FIELD_WHITELIST,
  RENEWAL_SOURCE_QUOTE_SELECT,
} from '../renewal/quote-renewal-prefill.fields';

const RENEWAL_SOURCE_CONTRACT_STATUSES = ['disbursed', 'closed'] as const;

interface LockedQuote {
  id: string;
  party_id: string | null;
  quote_status: string;
  current_sales_agent_id: string;
}

export interface RenewalPrefillResult {
  applied: boolean;
  sourceContractId: string | null;
  sourceQuoteId: string | null;
}

@Injectable()
export class QuoteRenewalPrefillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteEvents: QuoteEventsService,
  ) {}

  async apply(
    quoteId: string,
    actor: JwtPayload,
  ): Promise<RenewalPrefillResult> {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.lockEditableQuote(tx, quoteId, actor);

      const previousPrefill = await tx.quote_events.findFirst({
        where: {
          quote_id: quoteId,
          event_type: QuoteEventType.RENEWAL_PREFILLED,
        },
        select: { metadata: true },
      });
      if (previousPrefill) {
        return {
          applied: false,
          sourceContractId: metadataString(
            previousPrefill.metadata,
            'sourceContractId',
          ),
          sourceQuoteId: metadataString(
            previousPrefill.metadata,
            'sourceQuoteId',
          ),
        };
      }

      if (!quote.party_id) {
        throw new NotFoundException(
          'A proposta não possui um tomador vinculado para localizar a renovação.',
        );
      }

      const sourceContract = await tx.contracts.findFirst({
        where: {
          client_id: quote.party_id,
          status: { in: [...RENEWAL_SOURCE_CONTRACT_STATUSES] },
          quote_id: { not: null },
          NOT: { quote_id: quoteId },
        },
        select: {
          id: true,
          quote_id: true,
          quotes: { select: RENEWAL_SOURCE_QUOTE_SELECT },
        },
        orderBy: [
          { disbursement_date: { sort: 'desc', nulls: 'last' } },
          { created_at: 'desc' },
          { id: 'desc' },
        ],
      });
      if (!sourceContract?.quote_id || !sourceContract.quotes) {
        throw new NotFoundException(
          'Nenhum contrato desembolsado ou quitado com proposta foi encontrado para este tomador.',
        );
      }

      const partyAddress = await tx.addresses.findFirst({
        where: { client_id: quote.party_id },
        orderBy: [
          { is_primary: { sort: 'desc', nulls: 'last' } },
          { created_at: 'desc' },
        ],
        select: {
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zip_code: true,
          landmark: true,
        },
      });

      await tx.quotes.update({
        where: { id: quoteId },
        data: {
          ...buildRenewalPrefillUpdate(sourceContract.quotes, partyAddress),
          updated_at: new Date(),
        },
      });

      await this.quoteEvents.createWithinTransaction(tx, {
        quoteId,
        actorUserId: actor.sub,
        type: QuoteEventType.RENEWAL_PREFILLED,
        metadata: {
          sourceContractId: sourceContract.id,
          sourceQuoteId: sourceContract.quote_id,
          copiedFields: RENEWAL_PREFILL_FIELD_WHITELIST,
        },
      });

      return {
        applied: true,
        sourceContractId: sourceContract.id,
        sourceQuoteId: sourceContract.quote_id,
      };
    });
  }

  private async lockEditableQuote(
    tx: Prisma.TransactionClient,
    quoteId: string,
    actor: JwtPayload,
  ): Promise<LockedQuote> {
    const rows = await tx.$queryRaw<LockedQuote[]>(Prisma.sql`
      SELECT id, party_id, quote_status, current_sales_agent_id
      FROM quotes
      WHERE id = ${quoteId}::uuid
      FOR UPDATE
    `);
    const quote = rows[0];
    if (!quote) throw new NotFoundException('Proposta não encontrada.');

    const isAdmin = actor.permissions.includes(PermissionKey.ROLE_ADMIN);
    if (!isAdmin && quote.current_sales_agent_id !== actor.sub) {
      throw new ForbiddenException(
        'Somente o parceiro responsável pode copiar dados para esta proposta.',
      );
    }
    if (quote.quote_status !== String(QuoteStatus.DRAFT)) {
      throw new ConflictException(
        `Os dados de renovação não podem ser copiados no status ${quote.quote_status}.`,
      );
    }
    return quote;
  }
}

function metadataString(
  metadata: Prisma.JsonValue,
  key: string,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}
