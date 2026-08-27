import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteEventType } from '../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../quote-events/quote-events.service';
import { QuoteStatus } from './enums/quote-status.enum';
import { QuotesService } from './quotes.service';

const QUOTE_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

function actor(
  sub = OWNER_ID,
  permissions: string[] = [PermissionKey.QUOTE_CREATE],
): JwtPayload {
  return {
    sub,
    email: 'parceiro@trigo.test',
    role: 'consultant',
    permissions,
  };
}

interface BuildOptions {
  updateCount?: number;
  quote?: {
    quote_status: string;
    current_sales_agent_id: string;
  } | null;
}

async function build(options: BuildOptions = {}) {
  const tx = {
    quotes: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.updateCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue(options.quote ?? null),
    },
  };
  const quoteEvents = {
    createWithinTransaction: jest.fn().mockResolvedValue({ id: 'event-1' }),
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuotesService,
      { provide: PrismaService, useValue: prisma },
      { provide: QuoteEventsService, useValue: quoteEvents },
    ],
  }).compile();

  return { service: module.get(QuotesService), prisma, quoteEvents, tx };
}

describe('QuotesService.submitDraftForClientReview', () => {
  it('muda o draft do parceiro para client_review e registra o evento', async () => {
    const { service, quoteEvents, tx } = await build();

    await expect(
      service.submitDraftForClientReview(QUOTE_ID, actor()),
    ).resolves.toEqual({
      id: QUOTE_ID,
      status: QuoteStatus.CLIENT_REVIEW,
      updatedAt: expect.any(Date) as unknown,
    });

    expect(tx.quotes.updateMany).toHaveBeenCalledWith({
      where: {
        id: QUOTE_ID,
        quote_status: QuoteStatus.DRAFT,
        current_sales_agent_id: OWNER_ID,
      },
      data: {
        quote_status: QuoteStatus.CLIENT_REVIEW,
        updated_at: expect.any(Date) as unknown,
      },
    });
    expect(quoteEvents.createWithinTransaction).toHaveBeenCalledWith(tx, {
      quoteId: QUOTE_ID,
      actorUserId: OWNER_ID,
      type: QuoteEventType.DRAFT_SUBMITTED,
      metadata: {
        previousStatus: QuoteStatus.DRAFT,
        newStatus: QuoteStatus.CLIENT_REVIEW,
      },
    });
  });

  it('permite que ROLE_ADMIN finalize qualquer draft', async () => {
    const { service, tx } = await build();

    await service.submitDraftForClientReview(
      QUOTE_ID,
      actor(OTHER_ID, [PermissionKey.ROLE_ADMIN]),
    );

    expect(tx.quotes.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: QUOTE_ID,
          quote_status: QuoteStatus.DRAFT,
        },
      }),
    );
  });

  it('recusa proposta pertencente a outro parceiro', async () => {
    const { service, quoteEvents } = await build({
      updateCount: 0,
      quote: {
        quote_status: QuoteStatus.DRAFT,
        current_sales_agent_id: OTHER_ID,
      },
    });

    await expect(
      service.submitDraftForClientReview(QUOTE_ID, actor()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(quoteEvents.createWithinTransaction).not.toHaveBeenCalled();
  });

  it('recusa uma nova submissão quando a proposta já saiu de draft', async () => {
    const { service, quoteEvents } = await build({
      updateCount: 0,
      quote: {
        quote_status: QuoteStatus.CLIENT_REVIEW,
        current_sales_agent_id: OWNER_ID,
      },
    });

    await expect(
      service.submitDraftForClientReview(QUOTE_ID, actor()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(quoteEvents.createWithinTransaction).not.toHaveBeenCalled();
  });

  it('retorna not found quando a proposta não existe', async () => {
    const { service } = await build({ updateCount: 0, quote: null });

    await expect(
      service.submitDraftForClientReview(QUOTE_ID, actor()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
