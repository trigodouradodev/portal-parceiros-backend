import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteEventType } from './enums/quote-event-type.enum';
import { QuoteEventsService } from './quote-events.service';

const EVENT = {
  quoteId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  type: QuoteEventType.DRAFT_SUBMITTED,
  metadata: { previousStatus: 'draft', newStatus: 'client_review' },
};

async function build() {
  const prisma = {
    quote_events: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuoteEventsService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  return { service: module.get(QuoteEventsService), prisma };
}

describe('QuoteEventsService', () => {
  it('registra um evento isolado', async () => {
    const { service, prisma } = await build();

    await service.create(EVENT);

    expect(prisma.quote_events.create).toHaveBeenCalledWith({
      data: {
        quote_id: EVENT.quoteId,
        actor_user_id: EVENT.actorUserId,
        event_type: QuoteEventType.DRAFT_SUBMITTED,
        metadata: EVENT.metadata,
      },
    });
  });

  it('usa o client transacional fornecido pelo caso de uso', async () => {
    const { service, prisma } = await build();
    const tx = {
      quote_events: {
        create: jest.fn().mockResolvedValue({ id: 'event-2' }),
      },
    };

    await service.createWithinTransaction(tx as never, EVENT);

    expect(tx.quote_events.create).toHaveBeenCalledTimes(1);
    expect(prisma.quote_events.create).not.toHaveBeenCalled();
  });
});
