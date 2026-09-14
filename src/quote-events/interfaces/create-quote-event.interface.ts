import type { Prisma } from '@prisma/client';
import { QuoteEventType } from '../enums/quote-event-type.enum';

export interface CreateQuoteEvent {
  quoteId: string;
  actorUserId: string;
  type: QuoteEventType;
  metadata?: Prisma.InputJsonObject;
}
