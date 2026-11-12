import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
import { BureauService } from '../bureau/bureau.service';
import {
  CreditRiskBands,
  CreditRiskConfigService,
  DEFAULT_CREDIT_RISK_BANDS,
} from '../bureau/credit-risk-config.service';
import { CreditRiskBand } from '../bureau/enums/credit-risk-band.enum';
import { CabureService } from '../cabure/cabure.service';
import { CelcoinSimulationService } from '../celcoin/celcoin-simulation.service';
import { CelcoinSimulationResult } from '../celcoin/interfaces/celcoin-simulation.interface';
import { EligibilityService } from '../eligibility/eligibility.service';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { SimulateDto } from './dto/simulate.dto';
import { SimulationStatus } from './enums/simulation-status.enum';
import { SimulationsService } from './simulations.service';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';
const OTHER_USER_ID = '369b0843-0aa8-40ab-af66-8304909930a6';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const PARTY_ID = '22222222-2222-4222-8222-222222222222';
const SIMULATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const celcoinResult: CelcoinSimulationResult = {
  payment_amount: 612.34,
  total_amount_owed: 6123.4,
  iof_amount: 123.45,
  schedule: [],
};

const actor = {
  sub: USER_ID,
  email: 'parceiro@trigodourado.com',
  role: 'ROLE_CONSULTANT',
  permissions: [PermissionKey.QUOTE_CREATE, PermissionKey.ROLE_CONSULTANT],
};

const otherActor = {
  ...actor,
  sub: OTHER_USER_ID,
};

const product = {
  id: PRODUCT_ID,
  product_name: 'CRÉDITO PESSOAL',
  min_installment_count: 2,
  max_installment_count: 12,
  min_interest_rate: 0.02,
  max_interest_rate: 0.0339,
  max_tac_rate: 0.03,
  min_tac_amount: 0,
  enabled: true,
};

function futureDueDate(day = 10): string {
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  for (let offset = 1; offset <= 45; offset += 1) {
    const candidate = new Date(date.getTime() + offset * 24 * 60 * 60 * 1000);
    if (candidate.getUTCDate() === day) {
      return candidate.toISOString().slice(0, 10);
    }
  }
  return date.toISOString().slice(0, 10);
}

function dto(overrides: Partial<SimulateDto> = {}): SimulateDto {
  return {
    name: 'Maria Souza',
    document: '529.982.247-25',
    birthDate: '1990-05-20',
    email: 'maria@email.com',
    telephone: '(11) 98765-4321',
    productId: PRODUCT_ID,
    amount: 5000,
    installments: 10,
    firstInstallmentDate: futureDueDate(),
    ...overrides,
  };
}

function simulationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SIMULATION_ID,
    finance_product_id: PRODUCT_ID,
    client_name: 'Maria Souza',
    document: '52998224725',
    birth_date: new Date('1990-05-20T00:00:00.000Z'),
    email: 'maria@email.com',
    telephone: '11987654321',
    finance_amount: 5000,
    interest_rate: 0.0339,
    installment_numbers: 10,
    first_installment_date: new Date(`${futureDueDate()}T00:00:00.000Z`),
    installment_amount: celcoinResult.payment_amount,
    simulation_result: celcoinResult,
    insurance_premium: null as number | null,
    installment_amount_with_insurance: null as number | null,
    serasa_score: null as number | null,
    created_at: new Date('2026-08-26T12:00:00.000Z'),
    status: SimulationStatus.AVAILABLE,
    ...overrides,
  };
}

function buildService(options?: {
  canSimulateQuote?: boolean;
  product?: typeof product | null;
  inserted?: Record<string, unknown>;
  updated?: Record<string, unknown> | null;
  editableState?: 'available' | 'converted' | 'missing';
  celcoinResult?: CelcoinSimulationResult;
  eligible?: boolean;
  cabureQuote?: { id: string; premium: number } | Error;
  serasaScore?: number | null;
  bands?: CreditRiskBands | null;
  /** Cliente com contrato desembolsado ou quitado (renovação). Padrão: cliente novo. */
  returningClient?: boolean | Error;
  /** Consultor marcado como exclusivo em `trigo_users`. Padrão: exclusivo. */
  exclusiveConsultant?: boolean | Error;
}) {
  const findUser = jest.fn(() =>
    options?.exclusiveConsultant instanceof Error
      ? Promise.reject(options.exclusiveConsultant)
      : Promise.resolve([
          { is_exclusive: options?.exclusiveConsultant !== false },
        ]),
  );
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes('FROM public.consultant_finance_products')) {
      if (options && 'product' in options) {
        return options.product ? [options.product] : [];
      }
      return [product];
    }
    if (sql.includes('AS converted')) {
      if (options?.editableState === 'missing') return [];
      return [
        {
          id: SIMULATION_ID,
          document: '52998224725',
          converted: options?.editableState === 'converted',
        },
      ];
    }
    if (sql.includes('FROM public.trigo_users')) {
      return findUser();
    }
    if (sql.includes('INSERT INTO public.simulations')) {
      return [options?.inserted ?? simulationRow({ id: 'sim-1' })];
    }
    if (sql.includes('UPDATE public.simulations')) {
      if (options && 'updated' in options) {
        return options.updated ? [options.updated] : [];
      }
      return [simulationRow()];
    }
    return [];
  });

  const prisma = {
    $queryRaw: queryRaw,
    $transaction: jest.fn((callback: (tx: PrismaService) => Promise<unknown>) =>
      callback(prisma),
    ),
  } as unknown as PrismaService;
  const getPermissions = jest.fn().mockResolvedValue({
    canSimulateQuote: options?.canSimulateQuote ?? true,
    canCreateQuote: true,
  });
  const quoteActivityPermissions = {
    getPermissions,
  } as unknown as QuoteActivityPermissionsService;
  const resolveForSimulation = jest.fn().mockResolvedValue(PARTY_ID);
  const hasDisbursedContract = jest.fn(() =>
    options?.returningClient instanceof Error
      ? Promise.reject(options.returningClient)
      : Promise.resolve(options?.returningClient === true),
  );
  const partiesService = {
    resolveForSimulation,
    hasDisbursedContract,
  } as unknown as PartiesService;
  const simulateRequestedAmount = jest
    .fn()
    .mockResolvedValue(options?.celcoinResult ?? celcoinResult);
  const celcoinSimulation = {
    simulateRequestedAmount,
  } as unknown as CelcoinSimulationService;
  const evaluateEligibility = jest.fn().mockReturnValue({
    eligible: options?.eligible ?? true,
    name: 'Maria Souza',
    document: '52998224725',
    birthDate: '1990-05-20',
  });
  const eligibilityService = {
    evaluate: evaluateEligibility,
  } as unknown as EligibilityService;
  // Por padrão a Caburé "falha" (mesmo princípio de resiliência do domínio:
  // testes que não são sobre seguro não devem precisar mockar isso) — só os
  // testes de seguro passam `cabureQuote` explicitamente.
  const quote = jest.fn().mockImplementation(() => {
    if (options?.cabureQuote instanceof Error) {
      return Promise.reject(options.cabureQuote);
    }
    if (options?.cabureQuote) {
      return Promise.resolve(options.cabureQuote);
    }
    return Promise.reject(new Error('Caburé indisponível (padrão de teste)'));
  });
  const cabureService = { quote } as unknown as CabureService;
  const lookupSerasaScore = jest
    .fn()
    .mockResolvedValue(options?.serasaScore ?? null);
  const bureauService = { lookupSerasaScore } as unknown as BureauService;
  const getBands = jest
    .fn()
    .mockResolvedValue(
      options && 'bands' in options ? options.bands : DEFAULT_CREDIT_RISK_BANDS,
    );
  const creditRiskConfig = { getBands } as unknown as CreditRiskConfigService;

  return {
    service: new SimulationsService(
      prisma,
      quoteActivityPermissions,
      partiesService,
      celcoinSimulation,
      eligibilityService,
      cabureService,
      bureauService,
      creditRiskConfig,
    ),
    lookupSerasaScore,
    queryRaw,
    quoteActivityPermissions,
    getPermissions,
    partiesService,
    resolveForSimulation,
    hasDisbursedContract,
    findUser,
    simulateRequestedAmount,
    evaluateEligibility,
    cabureQuote: quote,
  };
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

type SqlCall = [TemplateStringsArray, ...unknown[]];

/** Chamadas SQL do serviço, sem a leitura da marca de consultor exclusivo. */
function sqlCalls(queryRaw: jest.Mock): SqlCall[] {
  return (queryRaw.mock.calls as SqlCall[]).filter(
    (call) => !call[0].join(' ').includes('FROM public.trigo_users'),
  );
}

describe('SimulationsService.simulate', () => {
  it('avalia a elegibilidade e cria uma simulação quando não recebe UUID', async () => {
    const { service, evaluateEligibility, queryRaw } = buildService();

    const result = await service.simulate(actor, dto());

    expect(evaluateEligibility).toHaveBeenCalledWith(dto());
    expect(result.eligible).toBe(true);
    expect(result.simulation).toMatchObject({
      id: 'sim-1',
      document: '52998224725',
      installmentAmount: celcoinResult.payment_amount,
    });
    expect(
      queryRaw.mock.calls.some((call) =>
        call[0].join(' ').includes('INSERT INTO public.simulations'),
      ),
    ).toBe(true);
  });

  it('atualiza a simulação existente quando recebe UUID', async () => {
    const { service, queryRaw } = buildService();

    const result = await service.simulate(actor, {
      ...dto({ amount: 8000, installments: 12 }),
      simulationId: SIMULATION_ID,
    });

    expect(result.eligible).toBe(true);
    expect(result.simulation?.id).toBe(SIMULATION_ID);
    expect(
      queryRaw.mock.calls.some((call) =>
        call[0].join(' ').includes('UPDATE public.simulations'),
      ),
    ).toBe(true);
    expect(
      queryRaw.mock.calls.some((call) =>
        call[0].join(' ').includes('INSERT INTO public.simulations'),
      ),
    ).toBe(false);
  });

  it.each([0, 0.07])(
    'usa e persiste a TAC do produto, ignorando uma TAC enviada pelo cliente: %s',
    async (tacRate) => {
      const { service, queryRaw, simulateRequestedAmount } = buildService({
        product: { ...product, max_tac_rate: tacRate },
      });
      await service.simulate(actor, Object.assign(dto(), { tacRate: 99 }));
      expect(simulateRequestedAmount).toHaveBeenCalledWith(
        expect.objectContaining({ tacRate }),
      );
      const insertCall = queryRaw.mock.calls.find((call) =>
        call[0].join(' ').includes('INSERT INTO public.simulations'),
      )!;
      expect(insertCall[0].join(' ')).toContain('tac_amount');
      expect(insertCall).toContain(tacRate);
    },
  );

  it('aplica o piso da TAC do produto: manda à Celcoin e grava a taxa exata e o piso', async () => {
    const { service, queryRaw, simulateRequestedAmount } = buildService({
      product: { ...product, max_tac_rate: 0.065, min_tac_amount: 100 },
    });
    await service.simulate(actor, dto());

    expect(simulateRequestedAmount).toHaveBeenCalledWith(
      expect.objectContaining({ tacRate: 0.065, tacMinAmount: 100 }),
    );
    const insertCall = queryRaw.mock.calls.find((call) =>
      call[0].join(' ').includes('INSERT INTO public.simulations'),
    )!;
    const insertSql = insertCall[0].join(' ');
    // `tac_amount` (2 casas) é legado: a taxa exata vai também em `tac_rate`
    expect(insertSql).toContain('tac_rate');
    expect(insertSql).toContain('tac_min_amount');
    expect(insertCall.filter((value) => value === 0.065)).toHaveLength(2);
    expect(insertCall).toContain(100);
  });

  it('não chama a Celcoin nem persiste quando o cliente é inelegível', async () => {
    const {
      service,
      queryRaw,
      getPermissions,
      resolveForSimulation,
      simulateRequestedAmount,
    } = buildService({ eligible: false });

    await expect(service.simulate(actor, dto())).resolves.toEqual({
      eligible: false,
      simulation: null,
    });
    expect(getPermissions).not.toHaveBeenCalled();
    expect(simulateRequestedAmount).not.toHaveBeenCalled();
    expect(resolveForSimulation).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('SimulationsService.simulate — criação', () => {
  it('persiste a simulação do parceiro e devolve o snapshot em inglês', async () => {
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService();

    const result = await service.simulate(actor, dto());
    const simulation = result.simulation!;

    expect(simulation.name).toBe('Maria Souza');
    expect(simulation.document).toBe('52998224725');
    expect(simulation.productName).toBe('CRÉDITO PESSOAL');
    expect(simulation.productId).toBe(PRODUCT_ID);
    expect(simulation).not.toHaveProperty('interestRate');
    expect(simulation.amount).toBe(5000);
    expect(simulation.installments).toBe(10);
    expect(simulation.firstInstallmentDate).toBe(futureDueDate());
    expect(simulation.installmentAmount).toBe(celcoinResult.payment_amount);
    expect(simulation).not.toHaveProperty('totalAmountOwed');
    expect(simulation).not.toHaveProperty('simulationResult');
    expect(simulation.createdAt).toBe('2026-08-26T12:00:00.000Z');
    expect(simulation.status).toBe(SimulationStatus.AVAILABLE);

    const insertSql = sqlCalls(queryRaw)[1][0].join(' ');
    expect(insertSql).toContain('INSERT INTO public.simulations');
    expect(insertSql).toContain('party_id');
    expect(insertSql).toContain('simulation_result');
    expect(insertSql).toContain('tac_amount');
    expect(sqlCalls(queryRaw)[1]).toContain(product.max_tac_rate);
    expect(simulateRequestedAmount).toHaveBeenCalledWith({
      requestedAmount: 5000,
      interestRate: 0.0339,
      installments: 10,
      firstPaymentDate: futureDueDate(),
      tacRate: product.max_tac_rate,
      tacMinAmount: 0,
    });
    expect(sqlCalls(queryRaw)[1]).toContain(JSON.stringify(celcoinResult));
    expect(sqlCalls(queryRaw)[1]).toContain('+5511987654321');
    expect(resolveForSimulation).toHaveBeenCalledWith(
      {
        name: 'Maria Souza',
        document: '52998224725',
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        email: 'maria@email.com',
        telephone: '+5511987654321',
      },
      expect.anything(),
    );
  });

  it('cota o seguro na Caburé e roda a Celcoin de novo com insurance_amount', async () => {
    const cabureQuote = {
      id: 'cabure-quote-1',
      premium: 189.9,
      productCode: 'credito-pessoal-21',
    };
    const insuranceResult: CelcoinSimulationResult = {
      payment_amount: 641.12,
      total_amount_owed: 6411.2,
    };
    const {
      service,
      queryRaw,
      simulateRequestedAmount,
      cabureQuote: quoteMock,
    } = buildService({
      cabureQuote,
      inserted: simulationRow({
        id: 'sim-1',
        insurance_premium: 189.9,
        installment_amount_with_insurance: 641.12,
      }),
    });
    simulateRequestedAmount
      .mockResolvedValueOnce(celcoinResult)
      .mockResolvedValueOnce(insuranceResult);

    const result = await service.simulate(actor, dto());

    expect(result.simulation).toMatchObject({
      insurancePremium: 189.9,
      installmentAmountWithInsurance: 641.12,
    });
    expect(quoteMock).toHaveBeenCalledWith(5000, 10);
    expect(simulateRequestedAmount).toHaveBeenCalledTimes(2);
    expect(simulateRequestedAmount).toHaveBeenNthCalledWith(2, {
      requestedAmount: 5000,
      interestRate: 0.0339,
      installments: 10,
      firstPaymentDate: futureDueDate(),
      tacRate: product.max_tac_rate,
      tacMinAmount: 0,
      insuranceAmount: 189.9,
    });

    const insertCall = sqlCalls(queryRaw)[1];
    const insertSql = insertCall[0].join(' ');
    expect(insertSql).toContain('insurance_premium');
    expect(insertSql).toContain('installment_amount_with_insurance');
    expect(insertSql).toContain('simulation_result_with_insurance');
    expect(insertCall).toContain(189.9);
    expect(insertCall).toContain('cabure-quote-1');
    expect(insertCall).toContain(641.12);
    expect(insertCall).toContain(JSON.stringify(insuranceResult));
    expect(insertSql).toContain('insurance_product_code');
    expect(insertCall).toContain('credito-pessoal-21');
  });

  it('mantém a simulação de crédito quando a Caburé falha ao cotar o seguro', async () => {
    const { service, queryRaw, simulateRequestedAmount } = buildService({
      cabureQuote: new Error('Caburé fora do ar'),
    });

    const result = await service.simulate(actor, dto());

    expect(result.eligible).toBe(true);
    expect(simulateRequestedAmount).toHaveBeenCalledTimes(1);
    const insertCall = sqlCalls(queryRaw)[1];
    expect(insertCall).toContain(null);
  });

  it('não cota seguro quando o cliente não é elegível pela idade', async () => {
    const {
      service,
      cabureQuote: quoteMock,
      simulateRequestedAmount,
    } = buildService();

    // 100 anos hoje: reprovado tanto na elegibilidade de crédito (18-120)
    // quanto, mais especificamente, na de seguro (18-70 no fim da vigência)
    // — usamos uma idade dentro da faixa de crédito (ex.: 75) pra isolar
    // que é a regra do SEGURO que está barrando, não a de crédito.
    const birthYear = new Date().getUTCFullYear() - 75;
    const result = await service.simulate(
      actor,
      dto({ birthDate: `${birthYear}-01-01` }),
    );

    expect(result.simulation).not.toHaveProperty('insurancePremium');
    expect(result.simulation).not.toHaveProperty(
      'installmentAmountWithInsurance',
    );
    expect(quoteMock).not.toHaveBeenCalled();
    expect(simulateRequestedAmount).toHaveBeenCalledTimes(1);
  });

  it('bloqueia quando a fila de cobrança impede simular', async () => {
    const { service } = buildService({ canSimulateQuote: false });

    await expect(service.simulate(actor, dto())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejeita produto que não está vinculado ao parceiro', async () => {
    const { service } = buildService({ product: null });

    await expect(service.simulate(actor, dto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('não persiste pessoa ou simulação quando a Celcoin falha', async () => {
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService();
    simulateRequestedAmount.mockRejectedValueOnce(
      new ServiceUnavailableException('Celcoin indisponível'),
    );

    await expect(service.simulate(actor, dto())).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(sqlCalls(queryRaw)).toHaveLength(1);
    expect(resolveForSimulation).not.toHaveBeenCalled();
  });

  it('rejeita vencimento fora dos dias 5/10/15/20', async () => {
    const { service } = buildService();
    const today = new Date();
    const tomorrow = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + 1,
      ),
    );
    const day = tomorrow.getUTCDate();
    const invalidDay = [5, 10, 15, 20].includes(day)
      ? new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
      : tomorrow;

    await expect(
      service.simulate(
        actor,
        dto({ firstInstallmentDate: invalidDay.toISOString().slice(0, 10) }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SimulationsService.simulate — atualização', () => {
  it('usa a nova parcela Celcoin e atualiza só a linha do parceiro autenticado', async () => {
    const payload = dto({
      name: 'Maria Souza Silva',
      amount: 8000,
      installments: 12,
    });
    const updatedCelcoinResult: CelcoinSimulationResult = {
      ...celcoinResult,
      payment_amount: 801.23,
      total_amount_owed: 9614.76,
    };
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService({
        product: { ...product, max_tac_rate: 0.07 },
        celcoinResult: updatedCelcoinResult,
        updated: simulationRow({
          client_name: 'Maria Souza Silva',
          finance_amount: 8000,
          installment_numbers: 12,
          installment_amount: updatedCelcoinResult.payment_amount,
          simulation_result: updatedCelcoinResult,
        }),
      });

    const result = await service.simulate(actor, {
      ...payload,
      simulationId: SIMULATION_ID,
    });
    const simulation = result.simulation!;

    expect(simulation.id).toBe(SIMULATION_ID);
    expect(simulation.name).toBe('Maria Souza Silva');
    expect(simulation.amount).toBe(8000);
    expect(simulation.installments).toBe(12);
    expect(simulation.installmentAmount).toBe(
      updatedCelcoinResult.payment_amount,
    );
    expect(simulation).not.toHaveProperty('interestRate');
    expect(simulation).not.toHaveProperty('totalAmountOwed');
    expect(simulation).not.toHaveProperty('simulationResult');
    expect(simulation.createdAt).toBe('2026-08-26T12:00:00.000Z');

    const updateCall = sqlCalls(queryRaw)[2];
    const updateSql = updateCall[0].join(' ');
    expect(updateSql).toContain('UPDATE public.simulations');
    expect(updateSql).toContain('WHERE s.id =');
    expect(updateSql).toContain('AND s.user_id =');
    expect(updateSql).toContain('party_id =');
    expect(updateSql).toContain('simulation_result =');
    expect(updateSql).toContain('tac_amount =');
    expect(updateCall).toContain(0.07);
    expect(updateSql).toContain('updated_at = NOW()');
    expect(updateSql).toContain('NOT EXISTS');
    expect(updateCall).toContain(updatedCelcoinResult.payment_amount);
    expect(updateCall).toContain(JSON.stringify(updatedCelcoinResult));
    expect(updateCall).toContain(SIMULATION_ID);
    expect(updateCall).toContain(USER_ID);
    expect(updateCall).toContain(PARTY_ID);
    expect(simulateRequestedAmount).toHaveBeenCalledWith({
      requestedAmount: 8000,
      interestRate: 0.0339,
      installments: 12,
      firstPaymentDate: futureDueDate(),
      tacRate: 0.07,
      tacMinAmount: 0,
    });
    expect(resolveForSimulation).toHaveBeenCalledWith(
      expect.objectContaining({
        document: '52998224725',
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
      }),
      expect.anything(),
    );
  });

  it('devolve 404 quando a simulação não é do parceiro autenticado', async () => {
    const { service } = buildService({ editableState: 'missing' });

    await expect(
      service.simulate(otherActor, {
        ...dto(),
        simulationId: SIMULATION_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('bloqueia a troca de CPF em uma simulação existente', async () => {
    const { service, resolveForSimulation, simulateRequestedAmount } =
      buildService();

    await expect(
      service.simulate(actor, {
        ...dto({ document: '11144477735' }),
        simulationId: SIMULATION_ID,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'O CPF não pode ser alterado em uma simulação existente.',
      ),
    );

    expect(resolveForSimulation).not.toHaveBeenCalled();
    expect(simulateRequestedAmount).not.toHaveBeenCalled();
  });

  it('bloqueia edição quando a simulação já originou uma quote', async () => {
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService({
        editableState: 'converted',
      });

    await expect(
      service.simulate(actor, { ...dto(), simulationId: SIMULATION_ID }),
    ).rejects.toThrow(ConflictException);

    expect(sqlCalls(queryRaw)).toHaveLength(1);
    expect(resolveForSimulation).not.toHaveBeenCalled();
    expect(simulateRequestedAmount).not.toHaveBeenCalled();
  });

  it('fecha a corrida se a quote for criada durante a atualização', async () => {
    const { service } = buildService({ updated: null });

    await expect(
      service.simulate(actor, { ...dto(), simulationId: SIMULATION_ID }),
    ).rejects.toThrow(ConflictException);
  });

  it('bloqueia a atualização quando a fila de cobrança impede simular', async () => {
    const { service, queryRaw } = buildService({ canSimulateQuote: false });

    await expect(
      service.simulate(actor, { ...dto(), simulationId: SIMULATION_ID }),
    ).rejects.toThrow(ForbiddenException);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('SimulationsService.previewFinancialForDraft', () => {
  const cabureQuote = {
    id: 'cabure-quote-1',
    premium: 189.9,
    productCode: 'credito-pessoal-21',
  };
  const insuranceResult: CelcoinSimulationResult = {
    payment_amount: 641.12,
    total_amount_owed: 6411.2,
  };

  function input(overrides: { birthDate?: Date; installments?: number } = {}) {
    return {
      productId: PRODUCT_ID,
      amount: 5000,
      installments: overrides.installments ?? 10,
      firstInstallmentDate: futureDueDate(),
      birthDate: overrides.birthDate ?? new Date('1990-05-20T00:00:00.000Z'),
    };
  }

  it('devolve a cotação com o seguro quando o cliente é elegível', async () => {
    const {
      service,
      simulateRequestedAmount,
      cabureQuote: quoteMock,
    } = buildService({ cabureQuote });
    simulateRequestedAmount
      .mockResolvedValueOnce(celcoinResult)
      .mockResolvedValueOnce(insuranceResult);

    const preview = await service.previewFinancialForDraft(actor, input());

    expect(preview).toMatchObject({
      amount: 5000,
      installments: 10,
      installmentAmount: 612.34,
      tacRate: product.max_tac_rate,
      insurance: {
        premium: 189.9,
        cabureQuoteId: 'cabure-quote-1',
        productCode: 'credito-pessoal-21',
        installmentAmount: 641.12,
      },
    });
    expect(preview.product.id).toBe(PRODUCT_ID);
    expect(quoteMock).toHaveBeenCalledWith(5000, 10);
  });

  it('proposta no mesmo produto recalcula com a TAC dela, não com a vigente do produto', async () => {
    const { service, simulateRequestedAmount } = buildService({
      cabureQuote,
      product: { ...product, max_tac_rate: 0.065, min_tac_amount: 100 },
    });
    simulateRequestedAmount
      .mockResolvedValueOnce(celcoinResult)
      .mockResolvedValueOnce(insuranceResult);

    const preview = await service.previewFinancialForDraft(actor, {
      ...input(),
      ownTac: { rate: 0.03, minAmount: 0 },
    });

    expect(preview).toMatchObject({ tacRate: 0.03, tacMinAmount: 0 });
    expect(simulateRequestedAmount).toHaveBeenCalledTimes(2);
    for (const [call] of simulateRequestedAmount.mock.calls) {
      expect(call).toMatchObject({ tacRate: 0.03, tacMinAmount: 0 });
    }
  });

  it('barra o cliente inelegível ao seguro com código e motivo, sem seguir sem seguro', async () => {
    const { service, cabureQuote: quoteMock } = buildService({ cabureQuote });
    const birthYear = new Date().getUTCFullYear() - 75;

    await expect(
      service.previewFinancialForDraft(
        actor,
        input({ birthDate: new Date(`${birthYear}-01-01T00:00:00.000Z`) }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'INSURANCE_INELIGIBLE',
        reason: 'MAX_AGE_AT_CONTRACT_END',
      },
    });
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('responde 503 quando o cliente é elegível mas a Caburé não cotou', async () => {
    const { service } = buildService({
      cabureQuote: new Error('Caburé fora do ar'),
    });

    await expect(
      service.previewFinancialForDraft(actor, input()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('bloqueia quando a fila de cobrança impede simular', async () => {
    const { service, simulateRequestedAmount } = buildService({
      canSimulateQuote: false,
      cabureQuote,
    });

    await expect(
      service.previewFinancialForDraft(actor, input()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(simulateRequestedAmount).not.toHaveBeenCalled();
  });

  it('rejeita produto fora da faixa de prazo do produto', async () => {
    const { service } = buildService({ cabureQuote });

    await expect(
      service.previewFinancialForDraft(actor, input({ installments: 30 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não grava nada: só consulta', async () => {
    const { service, queryRaw, simulateRequestedAmount } = buildService({
      cabureQuote,
    });
    simulateRequestedAmount
      .mockResolvedValueOnce(celcoinResult)
      .mockResolvedValueOnce(insuranceResult);

    await service.previewFinancialForDraft(actor, input());

    const sqls = queryRaw.mock.calls.map(([strings]) => strings.join(' '));
    expect(sqls.some((sql) => /INSERT|UPDATE/.test(sql))).toBe(false);
  });
});

describe('SimulationsService.listSimulations', () => {
  function listService(
    rows: Record<string, unknown>[] = [],
    bands: CreditRiskBands | null = DEFAULT_CREDIT_RISK_BANDS,
  ) {
    const queryRaw = jest.fn().mockResolvedValue(rows);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const quoteActivityPermissions = {
      getPermissions: jest.fn(),
    } as unknown as QuoteActivityPermissionsService;
    const partiesService = {
      resolveForSimulation: jest.fn(),
    } as unknown as PartiesService;
    const celcoinSimulation = {
      simulateRequestedAmount: jest.fn(),
    } as unknown as CelcoinSimulationService;
    const eligibilityService = {
      evaluate: jest.fn(),
    } as unknown as EligibilityService;
    const cabureService = {
      quote: jest.fn(),
    } as unknown as CabureService;
    const bureauService = {
      lookupSerasaScore: jest.fn(),
    } as unknown as BureauService;
    const creditRiskConfig = {
      getBands: jest.fn().mockResolvedValue(bands),
    } as unknown as CreditRiskConfigService;
    return {
      service: new SimulationsService(
        prisma,
        quoteActivityPermissions,
        partiesService,
        celcoinSimulation,
        eligibilityService,
        cabureService,
        bureauService,
        creditRiskConfig,
      ),
      queryRaw,
    };
  }

  function whereSql(queryRaw: jest.Mock): Prisma.Sql {
    const [, , , where] = queryRaw.mock.calls[0] as [
      unknown,
      string,
      string,
      Prisma.Sql,
    ];
    return where;
  }

  it('na listagem classifica pela faixa atual e não expõe o score', async () => {
    const rows = [
      simulationRow({ id: 'a', serasa_score: 300 }),
      simulationRow({ id: 'b', serasa_score: 750 }),
      simulationRow({ id: 'c', serasa_score: null }),
      simulationRow({ id: 'd', serasa_score: 450 }),
    ].map((row) => ({ ...row, product_name: 'CRÉDITO PESSOAL' }));
    const { service } = listService(rows);

    const list = await service.listSimulations(USER_ID);

    expect(list.map((item) => item.creditRiskBand)).toEqual([
      CreditRiskBand.INELIGIBLE,
      CreditRiskBand.LOW,
      undefined,
      CreditRiskBand.HIGH,
    ]);
    expect(JSON.stringify(list)).not.toContain('serasa');
  });

  it('lista só as simulações do usuário autenticado, mais recente primeiro', async () => {
    const { service, queryRaw } = listService();

    await service.listSimulations(USER_ID);

    const [strings] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = strings.join(' ');
    expect(sql).toContain('FROM public.simulations s');
    expect(sql).toContain('WHERE');
    expect(sql).toContain('ORDER BY s.created_at DESC');

    const where = whereSql(queryRaw);
    expect(where.strings.join(' ')).toContain('s.user_id =');
    expect(where.values).toContain(USER_ID);
    expect(where.strings.join(' ')).not.toContain('ILIKE');
    expect(where.strings.join(' ')).not.toContain('s.document LIKE');
  });

  it('não expõe o JSON cru, a taxa ou o total da simulação', async () => {
    const { service } = listService([
      simulationRow({
        product_name: 'CRÉDITO PESSOAL',
        simulation_result: null,
      }),
    ]);

    const [result] = await service.listSimulations(USER_ID);

    expect(result).not.toHaveProperty('simulationResult');
    expect(result).not.toHaveProperty('interestRate');
    expect(result).not.toHaveProperty('totalAmountOwed');
  });

  it('filtra nome com contains case-insensitive', async () => {
    const { service, queryRaw } = listService();

    await service.listSimulations(USER_ID, { name: 'maria' });

    const where = whereSql(queryRaw);
    expect(where.strings.join(' ')).toContain('s.client_name ILIKE');
    expect(where.values).toContain('%maria%');
  });

  it('ignora espaços no nome e não aplica filtro vazio', async () => {
    const { service, queryRaw } = listService();

    await service.listSimulations(USER_ID, { name: '   ' });

    const where = whereSql(queryRaw);
    expect(where.strings.join(' ')).not.toContain('ILIKE');
  });

  it('filtra CPF com ou sem máscara pelos dígitos', async () => {
    const { service, queryRaw } = listService();

    await service.listSimulations(USER_ID, { document: '529.982.247-25' });

    const where = whereSql(queryRaw);
    expect(where.strings.join(' ')).toContain('s.document LIKE');
    expect(where.values).toContain('%52998224725%');
    expect(where.values).not.toContain('%529.982.247-25%');
  });

  it('combina nome e CPF com AND no recorte do parceiro', async () => {
    const { service, queryRaw } = listService();

    await service.listSimulations(USER_ID, {
      name: 'Maria',
      document: '52998224725',
    });

    const where = whereSql(queryRaw);
    const text = where.strings.join(' ');
    expect(text).toContain('s.user_id =');
    expect(text).toContain('s.client_name ILIKE');
    expect(text).toContain('s.document LIKE');
    expect(text).toContain(' AND ');
    expect(where.values).toEqual(
      expect.arrayContaining([USER_ID, '%Maria%', '%52998224725%']),
    );
  });
});

describe('SimulationsService — risco de crédito (Serasa)', () => {
  it('consulta o Serasa com o CPF só em dígitos, grava o score e devolve só a faixa', async () => {
    const { service, queryRaw, lookupSerasaScore } = buildService({
      serasaScore: 450,
      inserted: simulationRow({ id: 'sim-1', serasa_score: 450 }),
    });

    const result = await service.simulate(actor, dto());
    const simulation = result.simulation!;

    expect(lookupSerasaScore).toHaveBeenCalledWith(
      '52998224725',
      `portal-parceiros:${USER_ID}`,
    );
    const insertCall = queryRaw.mock.calls.find((call) =>
      call[0].join(' ').includes('INSERT INTO public.simulations'),
    )!;
    expect(insertCall[0].join(' ')).toContain('serasa_score');
    expect(insertCall).toContain(450);
    expect(simulation.creditRiskBand).toBe(CreditRiskBand.HIGH);
    expect(simulation).not.toHaveProperty('serasaScore');
    expect(simulation).not.toHaveProperty('serasa_score');
    expect(JSON.stringify(simulation)).not.toContain('450');
  });

  it.each([
    [349, CreditRiskBand.INELIGIBLE],
    [350, CreditRiskBand.HIGH],
    [499, CreditRiskBand.HIGH],
    [500, CreditRiskBand.MEDIUM],
    [650, CreditRiskBand.MEDIUM],
    [651, CreditRiskBand.LOW],
  ])('score %i vira a faixa %s com as faixas padrão', async (score, band) => {
    const { service } = buildService({
      serasaScore: score,
      inserted: simulationRow({ id: 'sim-1', serasa_score: score }),
    });

    const result = await service.simulate(actor, dto());

    expect(result.simulation!.creditRiskBand).toBe(band);
  });

  it('usa as faixas configuradas em system_configs', async () => {
    const { service } = buildService({
      serasaScore: 520,
      bands: { ineligibleBelow: 450, highBelow: 550, lowAbove: 700 },
      inserted: simulationRow({ id: 'sim-1', serasa_score: 520 }),
    });

    const result = await service.simulate(actor, dto());

    expect(result.simulation!.creditRiskBand).toBe(CreditRiskBand.HIGH);
  });

  it('cria a simulação sem faixa quando o Serasa não traz score', async () => {
    const { service } = buildService({ serasaScore: null });

    const result = await service.simulate(actor, dto());

    expect(result.eligible).toBe(true);
    expect(result.simulation).not.toHaveProperty('creditRiskBand');
  });

  it('não mostra faixa quando a configuração das faixas é inválida', async () => {
    const { service } = buildService({
      serasaScore: 450,
      bands: null,
      inserted: simulationRow({ id: 'sim-1', serasa_score: 450 }),
    });

    const result = await service.simulate(actor, dto());

    expect(result.simulation).not.toHaveProperty('creditRiskBand');
  });

  it('consulta o Serasa só de cliente novo: confere o CPF só em dígitos', async () => {
    const { service, hasDisbursedContract } = buildService({
      serasaScore: 500,
    });

    await service.simulate(actor, dto());

    expect(hasDisbursedContract).toHaveBeenCalledWith('52998224725');
  });

  it('consulta o Serasa só de consultor exclusivo ativo: confere o usuário que simula', async () => {
    const { service, findUser, queryRaw } = buildService({
      serasaScore: 500,
    });

    await service.simulate(actor, dto());

    expect(findUser).toHaveBeenCalledTimes(1);
    const userQuery = queryRaw.mock.calls.find((call) =>
      call[0].join(' ').includes('FROM public.trigo_users'),
    )!;
    expect(userQuery).toContain(USER_ID);
  });

  it('não consulta o Serasa de quem não é consultor exclusivo e simula sem faixa', async () => {
    const { service, lookupSerasaScore, hasDisbursedContract, queryRaw } =
      buildService({
        exclusiveConsultant: false,
        serasaScore: 300,
        inserted: simulationRow({ id: 'sim-1', serasa_score: null }),
      });

    const result = await service.simulate(actor, dto());

    expect(result.eligible).toBe(true);
    expect(lookupSerasaScore).not.toHaveBeenCalled();
    expect(hasDisbursedContract).not.toHaveBeenCalled();
    expect(result.simulation).not.toHaveProperty('creditRiskBand');
    const insertCall = queryRaw.mock.calls.find((call) =>
      call[0].join(' ').includes('INSERT INTO public.simulations'),
    )!;
    expect(insertCall).not.toContain(300);
  });

  it('se não conseguir checar o consultor, não consulta e a simulação segue', async () => {
    const { service, lookupSerasaScore } = buildService({
      exclusiveConsultant: new Error('banco indisponível'),
      serasaScore: 300,
    });

    const result = await service.simulate(actor, dto());

    expect(result.eligible).toBe(true);
    expect(lookupSerasaScore).not.toHaveBeenCalled();
    expect(result.simulation).not.toHaveProperty('creditRiskBand');
  });

  it('não consulta o Serasa de cliente que renova contrato e simula sem faixa', async () => {
    const { service, lookupSerasaScore, queryRaw } = buildService({
      returningClient: true,
      serasaScore: 300,
      inserted: simulationRow({ id: 'sim-1', serasa_score: null }),
    });

    const result = await service.simulate(actor, dto());

    expect(result.eligible).toBe(true);
    expect(lookupSerasaScore).not.toHaveBeenCalled();
    expect(result.simulation).not.toHaveProperty('creditRiskBand');
    const insertCall = queryRaw.mock.calls.find((call) =>
      call[0].join(' ').includes('INSERT INTO public.simulations'),
    )!;
    expect(insertCall).not.toContain(300);
  });

  it('se não conseguir checar contrato anterior, não consulta e a simulação segue', async () => {
    const { service, lookupSerasaScore } = buildService({
      returningClient: new Error('banco indisponível'),
      serasaScore: 300,
    });

    const result = await service.simulate(actor, dto());

    expect(result.eligible).toBe(true);
    expect(lookupSerasaScore).not.toHaveBeenCalled();
    expect(result.simulation).not.toHaveProperty('creditRiskBand');
  });

  it('não consulta o Serasa quando o cliente é inelegível', async () => {
    const { service, lookupSerasaScore } = buildService({
      eligible: false,
      serasaScore: 450,
    });

    await service.simulate(actor, dto());

    expect(lookupSerasaScore).not.toHaveBeenCalled();
  });

  it('não consulta o Serasa quando a fila de cobrança impede simular', async () => {
    const { service, lookupSerasaScore } = buildService({
      canSimulateQuote: false,
      serasaScore: 450,
    });

    await expect(service.simulate(actor, dto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(lookupSerasaScore).not.toHaveBeenCalled();
  });

  it('na atualização mantém o score anterior quando a nova consulta falha', async () => {
    const { service, queryRaw } = buildService({ serasaScore: null });

    await service.simulate(actor, dto({ simulationId: SIMULATION_ID }));

    const updateSql = queryRaw.mock.calls
      .map((call) => call[0].join(' '))
      .find((sql) => sql.includes('UPDATE public.simulations'))!;
    expect(updateSql).toContain('serasa_score = COALESCE(');
    expect(updateSql).toContain('s.serasa_score)');
  });

  it.each([
    ['produto não vinculado ao parceiro', { product: null }, {}],
    ['prazo acima do máximo do produto', {}, { installments: 13 }],
    ['prazo abaixo do mínimo do produto', {}, { installments: 1 }],
    ['taxa de juros acima do máximo do produto', {}, { interestRate: 0.05 }],
    ['taxa de juros abaixo do mínimo do produto', {}, { interestRate: 0.01 }],
    [
      'data da 1ª parcela fora do permitido',
      {},
      { firstInstallmentDate: '2020-01-10' },
    ],
  ])(
    'simulação recusada por %s não gera custo: nem Serasa, nem Celcoin, nem Caburé',
    async (_name, options, overrides) => {
      const {
        service,
        lookupSerasaScore,
        simulateRequestedAmount,
        cabureQuote,
      } = buildService({ serasaScore: 450, ...options });

      await expect(
        service.simulate(actor, dto(overrides)),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(lookupSerasaScore).not.toHaveBeenCalled();
      expect(simulateRequestedAmount).not.toHaveBeenCalled();
      expect(cabureQuote).not.toHaveBeenCalled();
    },
  );

  it('simulação válida consulta o Serasa e a Celcoin (a validação antes não tira a consulta)', async () => {
    const { service, lookupSerasaScore, simulateRequestedAmount } =
      buildService({
        serasaScore: 450,
      });

    await service.simulate(actor, dto());

    expect(lookupSerasaScore).toHaveBeenCalledTimes(1);
    expect(simulateRequestedAmount).toHaveBeenCalled();
  });

  it('não consulta o Serasa ao recalcular a parte financeira de um rascunho', async () => {
    const { service, lookupSerasaScore } = buildService({
      cabureQuote: { id: 'cabure-quote-1', premium: 225 },
    });

    await service.previewFinancialForDraft(actor, {
      productId: PRODUCT_ID,
      amount: 5000,
      installments: 10,
      firstInstallmentDate: futureDueDate(),
      birthDate: new Date('1990-05-20T00:00:00.000Z'),
    });

    expect(lookupSerasaScore).not.toHaveBeenCalled();
  });
});
