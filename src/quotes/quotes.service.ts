import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteEventType } from '../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../quote-events/quote-events.service';
import { QuoteStatus } from './enums/quote-status.enum';
import { QuoteStatusResponse } from './interfaces/quote-status-response.interface';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteEvents: QuoteEventsService,
  ) {}

  /**
   * Confirma que o parceiro terminou o draft e entrega a proposta para o
   * cliente revisar. O update condicional impede duas submissões concorrentes.
   */
  async submitDraftForClientReview(
    quoteId: string,
    actor: JwtPayload,
  ): Promise<QuoteStatusResponse> {
    return this.prisma.$transaction(async (tx) => {
      const updatedAt = new Date();
      const isAdmin = actor.permissions.includes(PermissionKey.ROLE_ADMIN);

      const result = await tx.quotes.updateMany({
        where: {
          id: quoteId,
          quote_status: QuoteStatus.DRAFT,
          ...(isAdmin ? {} : { current_sales_agent_id: actor.sub }),
        },
        data: {
          quote_status: QuoteStatus.CLIENT_REVIEW,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.throwSubmitError(tx, quoteId, actor, isAdmin);
      }

      await this.quoteEvents.createWithinTransaction(tx, {
        quoteId,
        actorUserId: actor.sub,
        type: QuoteEventType.DRAFT_SUBMITTED,
        metadata: {
          previousStatus: QuoteStatus.DRAFT,
          newStatus: QuoteStatus.CLIENT_REVIEW,
        },
      });

      return {
        id: quoteId,
        status: QuoteStatus.CLIENT_REVIEW,
        updatedAt,
      };
    });
  }

  private async throwSubmitError(
    tx: Prisma.TransactionClient,
    quoteId: string,
    actor: JwtPayload,
    isAdmin: boolean,
  ): Promise<never> {
    const quote = await tx.quotes.findUnique({
      where: { id: quoteId },
      select: {
        quote_status: true,
        current_sales_agent_id: true,
      },
    });

    if (!quote) {
      throw new NotFoundException('Proposta não encontrada.');
    }

    if (!isAdmin && quote.current_sales_agent_id !== actor.sub) {
      throw new ForbiddenException(
        'Somente o parceiro responsável pode finalizar esta proposta.',
      );
    }

    throw new ConflictException(
      `A proposta não pode ser enviada para revisão a partir do status ${quote.quote_status}.`,
    );
  }
}
