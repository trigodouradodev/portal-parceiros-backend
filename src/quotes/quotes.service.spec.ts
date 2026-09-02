import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
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
const SIMULATION_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const PARTY_ID = '66666666-6666-4666-8666-666666666666';

const simulation = {
  id: SIMULATION_ID,
  party_id: PARTY_ID,
  finance_product_id: PRODUCT_ID,
  client_name: 'Maria Souza',
  document: '52998224725',
  birth_date: new Date('1990-05-20T00:00:00.000Z'),
  email: 'maria@email.com',
  telephone: '11987654321',
  finance_amount: 5000,
  interest_rate: 0.0339,
  installment_numbers: 10,
  first_installment_date: new Date('2026-09-10T00:00:00.000Z'),
  installment_amount: 612.34,
  simulation_result: {
    payment_amount: 612.34,
    total_amount_owed: 6123.4,
    schedule: [],
  } as Record<string, unknown> | null,
  finance_products: { product_name: 'GIRO' },
};

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
  simulation?: typeof simulation | null;
  existingDraft?: { id: string } | null;
  canCreateQuote?: boolean;
  createError?: Error & { code?: string };
}

async function build(options: BuildOptions = {}) {
  const createQuote = jest.fn(
    (input: {
      data: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<{ id: string; created_at: Date }> => {
      void input;
      if (options.createError) return Promise.reject(options.createError);
      return Promise.resolve({
        id: QUOTE_ID,
        created_at: new Date('2026-09-02T12:00:00.000Z'),
      });
    },
  );
  const tx = {
    simulations: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.simulation === undefined ? simulation : options.simulation,
        ),
    },
    quotes: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.updateCount ?? 1 }),
      findUnique: jest.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'simulation_id' in args.where
            ? (options.existingDraft ?? null)
            : (options.quote ?? null),
        ),
      ),
      create: createQuote,
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
  const quoteActivityPermissions = {
    getPermissions: jest.fn().mockResolvedValue({
      canSimulateQuote: true,
      canCreateQuote: options.canCreateQuote ?? true,
    }),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuotesService,
      { provide: PrismaService, useValue: prisma },
      { provide: QuoteEventsService, useValue: quoteEvents },
      {
        provide: QuoteActivityPermissionsService,
        useValue: quoteActivityPermissions,
      },
    ],
  }).compile();

  return {
    service: module.get(QuotesService),
    prisma,
    quoteEvents,
    quoteActivityPermissions,
    createQuote,
    tx,
  };
}

describe('QuotesService.createDraftFromSimulation', () => {
  it('cria o draft com o snapshot da simulação e registra o evento', async () => {
    const { service, tx, quoteEvents, quoteActivityPermissions, createQuote } =
      await build();

    await expect(
      service.createDraftFromSimulation(SIMULATION_ID, actor()),
    ).resolves.toEqual({
      id: QUOTE_ID,
      simulationId: SIMULATION_ID,
      status: QuoteStatus.DRAFT,
      createdAt: '2026-09-02T12:00:00.000Z',
      name: 'Maria Souza',
      document: '52998224725',
      birthDate: '1990-05-20',
      email: 'maria@email.com',
      telephone: '11987654321',
      productId: PRODUCT_ID,
      productName: 'GIRO',
      interestRate: 0.0339,
      financeAmount: 5000,
      installmentNumbers: 10,
      firstInstallmentDate: '2026-09-10',
      installmentAmount: 612.34,
      totalAmountOwed: 6123.4,
    });

    expect(quoteActivityPermissions.getPermissions).toHaveBeenCalledWith({
      userId: OWNER_ID,
      permissions: [PermissionKey.QUOTE_CREATE],
    });
    expect(tx.simulations.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SIMULATION_ID, user_id: OWNER_ID },
      }),
    );
    expect(createQuote).toHaveBeenCalledTimes(1);
    const createInput = createQuote.mock.calls[0][0];
    expect(createInput.data).toMatchObject({
      simulation_id: SIMULATION_ID,
      party_id: PARTY_ID,
      current_sales_agent_id: OWNER_ID,
      quote_status: QuoteStatus.DRAFT,
      document: '52998224725',
      client_name: 'Maria Souza',
      birth_date: simulation.birth_date,
      email: 'maria@email.com',
      telephone: '11987654321',
      finance_product_id: PRODUCT_ID,
      finance_amount: 5000,
      interest_rate: 0.0339,
      installment_numbers: 10,
      first_installment_date: simulation.first_installment_date,
      simulation_result: simulation.simulation_result,
      debts: [],
      loans: [],
    });
    expect(createInput.data.client_address).toEqual(expect.any(Object));
    expect(createInput.select).toEqual({ id: true, created_at: true });
    expect(quoteEvents.createWithinTransaction).toHaveBeenCalledWith(tx, {
      quoteId: QUOTE_ID,
      actorUserId: OWNER_ID,
      type: QuoteEventType.DRAFT_CREATED,
      metadata: { simulationId: SIMULATION_ID },
    });
  });

  it('bloqueia a criação quando ações de cobrança impedem propostas', async () => {
    const { service, prisma } = await build({ canCreateQuote: false });

    await expect(
      service.createDraftFromSimulation(SIMULATION_ID, actor()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('não revela simulação inexistente ou pertencente a outro parceiro', async () => {
    const { service, tx, quoteEvents } = await build({ simulation: null });

    await expect(
      service.createDraftFromSimulation(SIMULATION_ID, actor()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.quotes.create).not.toHaveBeenCalled();
    expect(quoteEvents.createWithinTransaction).not.toHaveBeenCalled();
  });

  it('recusa simulação que já originou uma proposta', async () => {
    const { service, tx, quoteEvents } = await build({
      existingDraft: { id: QUOTE_ID },
    });

    await expect(
      service.createDraftFromSimulation(SIMULATION_ID, actor()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.quotes.create).not.toHaveBeenCalled();
    expect(quoteEvents.createWithinTransaction).not.toHaveBeenCalled();
  });

  it('converte corrida na constraint única em conflito', async () => {
    const { service, quoteEvents } = await build({
      createError: Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      }),
    });

    await expect(
      service.createDraftFromSimulation(SIMULATION_ID, actor()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(quoteEvents.createWithinTransaction).not.toHaveBeenCalled();
  });

  it('permite converter simulação legada sem payload Celcoin', async () => {
    const { service, createQuote } = await build({
      simulation: { ...simulation, simulation_result: null },
    });

    const result = await service.createDraftFromSimulation(
      SIMULATION_ID,
      actor(),
    );

    expect(result).not.toHaveProperty('totalAmountOwed');
    const createInput = createQuote.mock.calls[0][0];
    expect(createInput.data).not.toHaveProperty('simulation_result');
  });
});

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
