import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteEvent } from './interfaces/create-quote-event.interface';

@Injectable()
export class QuoteEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra um evento em uma operação isolada. */
  create(event: CreateQuoteEvent) {
    return this.persist(this.prisma, event);
  }

  /**
   * Registra um evento dentro da transação do caso de uso chamador. Assim a
   * mudança da quote e sua auditoria são confirmadas ou revertidas juntas.
   */
  createWithinTransaction(
    tx: Prisma.TransactionClient,
    event: CreateQuoteEvent,
  ) {
    return this.persist(tx, event);
  }

  private persist(
    client: Pick<Prisma.TransactionClient, 'quote_events'>,
    event: CreateQuoteEvent,
  ) {
    return client.quote_events.create({
      data: {
        quote_id: event.quoteId,
        actor_user_id: event.actorUserId,
        event_type: event.type,
        metadata: event.metadata ?? {},
      },
    });
  }
}
