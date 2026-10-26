import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import type { DraftFinancialPreview } from '../../simulations/simulations.service';
import { SimulationsService } from '../../simulations/simulations.service';
import { UpdateDraftSimulationDto } from '../dto/update-draft-simulation.dto';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteDraftSimulationService } from './quote-draft-simulation.service';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';
const QUOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIMULATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PARTY_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const actor = {
  sub: USER_ID,
  email: 'parceiro@trigodourado.com',
  role: 'ROLE_CONSULTANT',
  permissions: [PermissionKey.QUOTE_CREATE, PermissionKey.ROLE_CONSULTANT],
};

const dto: UpdateDraftSimulationDto = {
  productId: PRODUCT_ID,
  amount: 8000,
  installments: 12,
  firstInstallmentDate: '2026-12-10',
};

const preview = {
  product: { id: PRODUCT_ID, product_name: 'CRÉDITO PESSOAL' },
  amount: 8000,
  installments: 12,
  interestRate: 0.0339,
  tacRate: 0.03,
  firstInstallmentDate: new Date('2026-12-10T00:00:00.000Z'),
  installmentAmount: 780.5,
  simulationResult: {
    payment_amount: 780.5,
    total_amount_owed: 9366,
    schedule: [],
  },
  insurance: {
    premium: 240,
    cabureQuoteId: 'cabure-quote-2',
    productCode: 'credito-pessoal-21',
    installmentAmount: 805.7,
    simulationResult: {
      payment_amount: 805.7,
      total_amount_owed: 9668.4,
      schedule: [],
    },
  },
} as unknown as DraftFinancialPreview;

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    quote_status: QuoteStatus.DRAFT,
    current_sales_agent_id: USER_ID,
    simulation_id: SIMULATION_ID,
    birth_date: new Date('1990-05-20T00:00:00.000Z'),
    party_id: PARTY_ID,
    ...overrides,
  };
}

type UpdateManyArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

function firstUpdateManyArgs(tx: { quotes: { updateMany: jest.Mock } }) {
  return (
    tx.quotes.updateMany.mock.calls as unknown as [UpdateManyArgs][]
  )[0][0];
}

function build(options?: {
  quote?: Record<string, unknown> | null;
  preview?: DraftFinancialPreview | Error;
  updatedCount?: number;
}) {
  const tx = {
    quotes: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options?.updatedCount ?? 1 }),
    },
    simulations: { update: jest.fn().mockResolvedValue({}) },
    quote_draft_steps: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    quotes: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options && 'quote' in options ? options.quote : quoteRow(),
        ),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
  const previewFinancialForDraft = jest.fn(() =>
    options?.preview instanceof Error
      ? Promise.reject(options.preview)
      : Promise.resolve(options?.preview ?? preview),
  );
  const simulations = {
    previewFinancialForDraft,
  } as unknown as SimulationsService;

  return {
    service: new QuoteDraftSimulationService(prisma, simulations),
    prisma,
    tx,
    previewFinancialForDraft,
  };
}

describe('QuoteDraftSimulationService.update (AUREA-701)', () => {
  it('recalcula com a data de nascimento da proposta e persiste tudo na mesma transação', async () => {
    const { service, tx, previewFinancialForDraft, prisma } = build();

    const result = await service.update(QUOTE_ID, dto, actor);

    expect(previewFinancialForDraft).toHaveBeenCalledWith(actor, {
      productId: PRODUCT_ID,
      amount: 8000,
      installments: 12,
      firstInstallmentDate: '2026-12-10',
      birthDate: new Date('1990-05-20T00:00:00.000Z'),
    });
    expect(
      (prisma as unknown as { $transaction: jest.Mock }).$transaction,
    ).toHaveBeenCalledTimes(1);

    const quoteUpdate = firstUpdateManyArgs(tx);
    expect(quoteUpdate.where).toMatchObject({
      id: QUOTE_ID,
      quote_status: QuoteStatus.DRAFT,
      current_sales_agent_id: USER_ID,
    });
    expect(quoteUpdate.data).toMatchObject({
      finance_product_id: PRODUCT_ID,
      finance_amount: 8000,
      installment_numbers: 12,
      interest_rate: 0.0339,
      tac_amount: 0.03,
      insurance_premium: 240,
      cabure_quote_id: 'cabure-quote-2',
      installment_amount_with_insurance: 805.7,
      insurance_product_code: 'credito-pessoal-21',
      simulation_result: expect.objectContaining({
        installment_amount: 780.5,
        total_amount_owed: 9366,
      }) as unknown,
      simulation_result_with_insurance: expect.objectContaining({
        installment_amount: 805.7,
      }) as unknown,
    });

    expect(tx.simulations.update).toHaveBeenCalledWith({
      where: { id: SIMULATION_ID },
      data: expect.objectContaining({
        finance_amount: 8000,
        installment_amount: 780.5,
        cabure_quote_id: 'cabure-quote-2',
        installment_amount_with_insurance: 805.7,
      }) as unknown,
    });

    expect(result).toMatchObject({
      id: QUOTE_ID,
      simulationId: SIMULATION_ID,
      financeAmount: 8000,
      installmentNumbers: 12,
      firstInstallmentDate: '2026-12-10',
      installmentAmount: 780.5,
      installmentAmountWithInsurance: 805.7,
      insurancePremium: 240,
      productName: 'CRÉDITO PESSOAL',
    });
  });

  it('não altera os dados do cliente: grava só campos comerciais na proposta e na simulação', async () => {
    const { service, tx } = build();

    await service.update(QUOTE_ID, dto, actor);

    const commercialFields = [
      'finance_product_id',
      'finance_amount',
      'installment_amount',
      'installment_numbers',
      'first_installment_date',
      'interest_rate',
      'tac_amount',
      'simulation_result',
      'insurance_premium',
      'cabure_quote_id',
      'installment_amount_with_insurance',
      'simulation_result_with_insurance',
      'insurance_product_code',
      'updated_at',
    ];
    const clientFields = [
      'client_name',
      'document',
      'birth_date',
      'email',
      'telephone',
      'party_id',
      'client_address',
    ];
    const quoteData = Object.keys(firstUpdateManyArgs(tx).data);
    const simulationData = Object.keys(
      (
        tx.simulations.update.mock.calls as unknown as [
          { data: Record<string, unknown> },
        ][]
      )[0][0].data,
    );

    for (const written of [quoteData, simulationData]) {
      for (const field of written) expect(commercialFields).toContain(field);
      for (const field of clientFields) expect(written).not.toContain(field);
    }
  });

  it('atualiza a cotação de seguro da proposta (cabure_insurance_proposals) e volta a "quoted"', async () => {
    const { service, tx } = build();

    await service.update(QUOTE_ID, dto, actor);

    const call = tx.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = call[0].join(' ');
    expect(sql).toContain('public.cabure_insurance_proposals');
    expect(sql).toContain('ON CONFLICT (quote_id) DO UPDATE');
    expect(sql).toContain('updated_at = now()');
    expect(call).toContain('cabure-quote-2');
    expect(call).toContain(240);
  });

  it('invalida os passos Financeiro e Documentação', async () => {
    const { service, tx } = build();

    await service.update(QUOTE_ID, dto, actor);

    expect(tx.quote_draft_steps.deleteMany).toHaveBeenCalledWith({
      where: {
        quote_id: QUOTE_ID,
        step: { in: ['financial', 'documentation'] },
      },
    });
  });

  it('cliente inelegível ao seguro: nada é gravado', async () => {
    const { service, tx, prisma } = build({
      preview: new BadRequestException({ code: 'INSURANCE_INELIGIBLE' }),
    });

    await expect(service.update(QUOTE_ID, dto, actor)).rejects.toMatchObject({
      response: { code: 'INSURANCE_INELIGIBLE' },
    });
    expect(
      (prisma as unknown as { $transaction: jest.Mock }).$transaction,
    ).not.toHaveBeenCalled();
    expect(tx.quotes.updateMany).not.toHaveBeenCalled();
  });

  it('Celcoin ou Caburé fora do ar: nada é gravado', async () => {
    const { service, tx, prisma } = build({
      preview: new ServiceUnavailableException(),
    });

    await expect(service.update(QUOTE_ID, dto, actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(
      (prisma as unknown as { $transaction: jest.Mock }).$transaction,
    ).not.toHaveBeenCalled();
    expect(tx.simulations.update).not.toHaveBeenCalled();
  });

  it('proposta inexistente devolve 404 sem recotar', async () => {
    const { service, previewFinancialForDraft } = build({ quote: null });

    await expect(service.update(QUOTE_ID, dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(previewFinancialForDraft).not.toHaveBeenCalled();
  });

  it('proposta de outro parceiro devolve 403 sem recotar', async () => {
    const { service, previewFinancialForDraft } = build({
      quote: quoteRow({ current_sales_agent_id: 'outro-parceiro' }),
    });

    await expect(service.update(QUOTE_ID, dto, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(previewFinancialForDraft).not.toHaveBeenCalled();
  });

  it('ROLE_ADMIN altera proposta de outro parceiro e o update não filtra por responsável', async () => {
    const admin = {
      ...actor,
      permissions: [PermissionKey.ROLE_ADMIN],
    };
    const { service, tx } = build({
      quote: quoteRow({ current_sales_agent_id: 'outro-parceiro' }),
    });

    await service.update(QUOTE_ID, dto, admin);

    const { where } = firstUpdateManyArgs(tx);
    expect(where).not.toHaveProperty('current_sales_agent_id');
  });

  it.each([QuoteStatus.CLIENT_REVIEW, QuoteStatus.KYC_ANALYSIS])(
    'proposta em %s não pode ser alterada (409)',
    async (status) => {
      const { service, previewFinancialForDraft } = build({
        quote: quoteRow({ quote_status: status }),
      });

      await expect(service.update(QUOTE_ID, dto, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(previewFinancialForDraft).not.toHaveBeenCalled();
    },
  );

  it('proposta sem simulação vinculada ou sem data de nascimento é recusada (400)', async () => {
    for (const override of [{ simulation_id: null }, { birth_date: null }]) {
      const { service } = build({ quote: quoteRow(override) });
      await expect(service.update(QUOTE_ID, dto, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('corrida com o envio: se a proposta saiu de rascunho durante as cotações, devolve 409', async () => {
    const { service, tx } = build({ updatedCount: 0 });

    await expect(service.update(QUOTE_ID, dto, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.simulations.update).not.toHaveBeenCalled();
    expect(tx.quote_draft_steps.deleteMany).not.toHaveBeenCalled();
  });
});
