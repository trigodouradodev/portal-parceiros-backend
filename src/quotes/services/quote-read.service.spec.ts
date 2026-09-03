import { NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { QuoteAttachmentType } from '../enums/quote-documentation.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteReadService } from './quote-read.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const QUOTE_ID = '33333333-3333-4333-8333-333333333333';
const SIMULATION_ID = '44444444-4444-4444-8444-444444444444';

const createdAt = new Date('2026-09-01T10:00:00.000Z');
const updatedAt = new Date('2026-09-02T11:00:00.000Z');

function actor(
  sub = OWNER_ID,
  permissions: string[] = [PermissionKey.QUOTE_CREATE],
): JwtPayload {
  return { sub, email: 'user@aurea.test', role: null, permissions };
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    simulation_id: SIMULATION_ID,
    quote_status: QuoteStatus.DRAFT,
    client_name: 'Maria Souza',
    document: '52998224725',
    finance_product_id: '55555555-5555-4555-8555-555555555555',
    finance_amount: '5000.00',
    current_sales_agent_id: OWNER_ID,
    created_at: createdAt,
    updated_at: updatedAt,
    finance_products: { product_name: 'PESSOAL' },
    trigo_users_quotes_current_sales_agent_idTotrigo_users: {
      full_name: 'Consultor Áurea',
    },
    quote_draft_steps: [
      { step: QuoteDraftStep.REGISTRATION },
      { step: 'legacy_unknown_step' },
    ],
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...listRow(),
    party_id: '66666666-6666-4666-8666-666666666666',
    birth_date: new Date('1990-05-20T00:00:00.000Z'),
    email: 'maria@email.com',
    telephone: '11987654321',
    interest_rate: '0.115',
    installment_numbers: 10,
    first_installment_date: new Date('2026-09-10T00:00:00.000Z'),
    simulation_result: { payment_amount: 815.97, total_amount_owed: 8159.7 },
    is_renegotiation: false,
    gender: 'female',
    secondary_document: '123456789',
    profession: 'Comerciante',
    economic_activity_categories: ['self_employed_or_informal'],
    economic_activity_other: null,
    marital_status: 'single',
    spouse_document: null,
    children_count: 1,
    household_members: 3,
    housing_status: 'rented',
    residence_duration: '2_to_5_years',
    government_programs: ['none'],
    owns_vehicle: true,
    vehicle_financed: false,
    credit_purpose: 'inventory_purchase',
    business_document: null,
    activity_duration: '3_to_5_years',
    personal_income: '4500.00',
    income_source: 'own_business',
    has_multiple_income_sources: true,
    secondary_income: '800.00',
    available_income_proof: 'bank_statement',
    client_address: {
      zipCode: '01001000',
      streetName: 'Praça da Sé',
      streetNumber: '100',
      streetComplement: '',
      streetDistrict: 'Sé',
      city: 'São Paulo',
      state: 'SP',
      referencePoint: 'Próximo ao metrô',
    },
    geolocation: {
      latitude: -23.55052,
      longitude: -46.633308,
      precision: '15m',
    },
    customer_relationship_duration: '1_to_3_years',
    customer_relationship_origin: 'previous_customer',
    customer_relationship_other: null,
    referrer_document: null,
    partner_assessment: 'recommend',
    informal_debt_signs: false,
    financial_urgency_signs: false,
    observations: 'Cliente conhecido.',
    guarantor: {
      name: 'João Souza',
      document: '39053344705',
      birthDate: '1988-03-15',
      email: 'joao@email.com',
      telephone: '+5511987654321',
      address: {
        zipCode: '01001000',
        streetName: 'Praça da Sé',
        streetNumber: '200',
        streetComplement: '',
        streetDistrict: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      },
      relationship: 'sibling',
    },
    debts: [
      { category: 'housing_or_rent', amount: 900, observations: 'Aluguel' },
    ],
    loans: [
      {
        category: 'credit_card',
        amount: 250,
        observations: 'Cartão principal',
        frequency: 'monthly',
        institution: 'nubank',
      },
    ],
    document_attachment: [
      {
        id: 'attachment-1',
        filename: 'rg.pdf',
        mimetype: 'application/pdf',
        size: 1000,
        s3Key: 'quotes/key/rg.pdf',
        createdAt: '2026-09-02T10:00:00.000Z',
        createdBy: OWNER_ID,
      },
    ],
    proof_of_residence_attachment: [],
    activity_photos_attachment: [],
    proof_of_income_attachment: [],
    simulations: { installment_amount: '815.97' },
    ...overrides,
  };
}

function build() {
  const prisma = {
    quotes: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const scope = {
    getViewerScopeIds: jest.fn().mockResolvedValue({
      userIds: [OWNER_ID, CHILD_ID],
      consultantIds: [OWNER_ID, CHILD_ID],
      collectionAgentIds: [OWNER_ID, CHILD_ID],
    }),
  };
  return {
    service: new QuoteReadService(
      prisma as unknown as PrismaService,
      scope as unknown as ScopeService,
    ),
    prisma,
    scope,
  };
}

describe('QuoteReadService.list', () => {
  it('lista com paginação, filtros e escopo hierárquico', async () => {
    const { service, prisma } = build();
    prisma.quotes.count.mockResolvedValueOnce(31);
    prisma.quotes.findMany.mockResolvedValueOnce([listRow()]);

    const result = await service.list(actor(), {
      page: 2,
      limit: 10,
      search: '529.982',
      status: QuoteStatus.DRAFT,
    });

    expect(prisma.quotes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          current_sales_agent_id: { in: [OWNER_ID, CHILD_ID] },
          OR: [
            { client_name: { contains: '529.982', mode: 'insensitive' } },
            { document: { contains: '529982' } },
          ],
          quote_status: QuoteStatus.DRAFT,
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 31,
      totalPages: 4,
      hasNextPage: true,
    });
    expect(result.items[0]).toMatchObject({
      id: QUOTE_ID,
      simulationId: SIMULATION_ID,
      status: QuoteStatus.DRAFT,
      name: 'Maria Souza',
      financeAmount: 5000,
      consultant: { id: OWNER_ID, name: 'Consultor Áurea' },
      completedSteps: [QuoteDraftStep.REGISTRATION],
      canEdit: true,
    });
  });

  it('busca textual somente pelo nome quando não há dígitos', async () => {
    const { service, prisma } = build();

    await service.list(actor(), { page: 1, limit: 30, search: 'Maria' });

    const [findArgs] = prisma.quotes.findMany.mock.calls[0] as unknown as [
      { where: { OR: unknown[] } },
    ];
    expect(findArgs.where.OR).toEqual([
      { client_name: { contains: 'Maria', mode: 'insensitive' } },
    ]);
  });

  it('não expande hierarquia para visão global', async () => {
    const { service, prisma, scope } = build();

    await service.list(actor(OWNER_ID, [PermissionKey.QUOTE_VIEW_ALL]), {
      page: 1,
      limit: 30,
    });

    expect(scope.getViewerScopeIds).not.toHaveBeenCalled();
    expect(prisma.quotes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('retorna página vazia sem consultar quotes quando o escopo está vazio', async () => {
    const { service, prisma, scope } = build();
    scope.getViewerScopeIds.mockResolvedValueOnce({
      userIds: [],
      consultantIds: [],
      collectionAgentIds: [],
    });

    await expect(
      service.list(actor(), { page: 3, limit: 20 }),
    ).resolves.toEqual({
      items: [],
      pagination: {
        page: 3,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
      },
    });
    expect(prisma.quotes.count).not.toHaveBeenCalled();
    expect(prisma.quotes.findMany).not.toHaveBeenCalled();
  });
});

describe('QuoteReadService.findById', () => {
  it('devolve o snapshot completo necessário para reconstruir o wizard', async () => {
    const { service, prisma } = build();
    prisma.quotes.findFirst.mockResolvedValueOnce(detailRow());

    const result = await service.findById(QUOTE_ID, actor());

    expect(prisma.quotes.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: QUOTE_ID,
          current_sales_agent_id: { in: [OWNER_ID, CHILD_ID] },
        },
      }),
    );
    expect(result).toMatchObject({
      id: QUOTE_ID,
      birthDate: '1990-05-20',
      installmentAmount: 815.97,
      totalAmountOwed: 8159.7,
      registration: {
        gender: 'female',
        economicActivityCategories: ['self_employed_or_informal'],
      },
      income: {
        declaredMonthlyIncome: 4500,
        secondaryIncome: 800,
      },
      address: {
        zipCode: '01001000',
        state: 'SP',
        geolocation: {
          latitude: -23.55052,
          longitude: -46.633308,
          precision: '15m',
        },
      },
      partnerOpinion: { opinion: 'Cliente conhecido.' },
      guarantor: { name: 'João Souza', relationship: 'sibling' },
      financial: {
        expenses: [
          { category: 'housing_or_rent', amount: 900, description: 'Aluguel' },
        ],
        loans: [
          {
            installmentAmount: 250,
            frequency: 'monthly',
            institution: 'nubank',
            category: 'credit_card',
            description: 'Cartão principal',
          },
        ],
      },
      documentation: {
        identificationDocuments: [
          expect.objectContaining({
            id: 'attachment-1',
            attachmentType: QuoteAttachmentType.IDENTIFICATION_DOCUMENT,
          }),
        ],
      },
    });
  });

  it('não permite editar uma proposta de subordinado nem fora de draft', async () => {
    const { service, prisma } = build();
    prisma.quotes.findFirst
      .mockResolvedValueOnce(detailRow({ current_sales_agent_id: CHILD_ID }))
      .mockResolvedValueOnce(detailRow({ quote_status: 'client_review' }));

    await expect(service.findById(QUOTE_ID, actor())).resolves.toMatchObject({
      canEdit: false,
    });
    await expect(service.findById(QUOTE_ID, actor())).resolves.toMatchObject({
      canEdit: false,
    });
  });

  it('retorna 404 para proposta inexistente ou fora do escopo', async () => {
    const { service } = build();

    await expect(service.findById(QUOTE_ID, actor())).rejects.toThrow(
      NotFoundException,
    );
  });
});
