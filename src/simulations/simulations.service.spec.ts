import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
import { CelcoinSimulationService } from '../celcoin/celcoin-simulation.service';
import { CelcoinSimulationResult } from '../celcoin/interfaces/celcoin-simulation.interface';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSimulationDto } from './dto/create-simulation.dto';
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

function dto(
  overrides: Partial<CreateSimulationDto> = {},
): CreateSimulationDto {
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
}) {
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
          converted: options?.editableState === 'converted',
        },
      ];
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
  const quoteActivityPermissions = {
    getPermissions: jest.fn().mockResolvedValue({
      canSimulateQuote: options?.canSimulateQuote ?? true,
      canCreateQuote: true,
    }),
  } as unknown as QuoteActivityPermissionsService;
  const resolveForSimulation = jest.fn().mockResolvedValue(PARTY_ID);
  const partiesService = {
    resolveForSimulation,
  } as unknown as PartiesService;
  const simulateRequestedAmount = jest
    .fn()
    .mockResolvedValue(options?.celcoinResult ?? celcoinResult);
  const celcoinSimulation = {
    simulateRequestedAmount,
  } as unknown as CelcoinSimulationService;

  return {
    service: new SimulationsService(
      prisma,
      quoteActivityPermissions,
      partiesService,
      celcoinSimulation,
    ),
    queryRaw,
    quoteActivityPermissions,
    partiesService,
    resolveForSimulation,
    simulateRequestedAmount,
  };
}

describe('SimulationsService.createSimulation', () => {
  it('persiste a simulação do parceiro e devolve o snapshot em inglês', async () => {
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService();

    const result = await service.createSimulation(actor, dto());

    expect(result.name).toBe('Maria Souza');
    expect(result.document).toBe('52998224725');
    expect(result.productName).toBe('CRÉDITO PESSOAL');
    expect(result.productId).toBe(PRODUCT_ID);
    expect(result.interestRate).toBe(0.0339);
    expect(result.amount).toBe(5000);
    expect(result.installments).toBe(10);
    expect(result.firstInstallmentDate).toBe(futureDueDate());
    expect(result.installmentAmount).toBe(celcoinResult.payment_amount);
    expect(result.totalAmountOwed).toBe(celcoinResult.total_amount_owed);
    expect(result).not.toHaveProperty('simulationResult');
    expect(result.createdAt).toBe('2026-08-26T12:00:00.000Z');
    expect(result.status).toBe(SimulationStatus.AVAILABLE);

    const insertSql = queryRaw.mock.calls[1][0].join(' ');
    expect(insertSql).toContain('INSERT INTO public.simulations');
    expect(insertSql).toContain('party_id');
    expect(insertSql).toContain('simulation_result');
    expect(simulateRequestedAmount).toHaveBeenCalledWith({
      requestedAmount: 5000,
      interestRate: 0.0339,
      installments: 10,
      firstPaymentDate: futureDueDate(),
    });
    expect(queryRaw.mock.calls[1]).toContain(JSON.stringify(celcoinResult));
    expect(resolveForSimulation).toHaveBeenCalledWith(
      {
        name: 'Maria Souza',
        document: '52998224725',
        email: 'maria@email.com',
        telephone: '11987654321',
      },
      expect.anything(),
    );
  });

  it('bloqueia quando a fila de cobrança impede simular', async () => {
    const { service } = buildService({ canSimulateQuote: false });

    await expect(service.createSimulation(actor, dto())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejeita produto que não está vinculado ao parceiro', async () => {
    const { service } = buildService({ product: null });

    await expect(service.createSimulation(actor, dto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('não persiste pessoa ou simulação quando a Celcoin falha', async () => {
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService();
    simulateRequestedAmount.mockRejectedValueOnce(
      new ServiceUnavailableException('Celcoin indisponível'),
    );

    await expect(service.createSimulation(actor, dto())).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
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
      service.createSimulation(
        actor,
        dto({ firstInstallmentDate: invalidDay.toISOString().slice(0, 10) }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SimulationsService.updateSimulation', () => {
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
        celcoinResult: updatedCelcoinResult,
        updated: simulationRow({
          client_name: 'Maria Souza Silva',
          finance_amount: 8000,
          installment_numbers: 12,
          installment_amount: updatedCelcoinResult.payment_amount,
          simulation_result: updatedCelcoinResult,
        }),
      });

    const result = await service.updateSimulation(
      actor,
      SIMULATION_ID,
      payload,
    );

    expect(result.id).toBe(SIMULATION_ID);
    expect(result.name).toBe('Maria Souza Silva');
    expect(result.amount).toBe(8000);
    expect(result.installments).toBe(12);
    expect(result.installmentAmount).toBe(updatedCelcoinResult.payment_amount);
    expect(result.totalAmountOwed).toBe(updatedCelcoinResult.total_amount_owed);
    expect(result).not.toHaveProperty('simulationResult');
    expect(result.createdAt).toBe('2026-08-26T12:00:00.000Z');

    const updateCall = queryRaw.mock.calls[2];
    const updateSql = updateCall[0].join(' ');
    expect(updateSql).toContain('UPDATE public.simulations');
    expect(updateSql).toContain('WHERE s.id =');
    expect(updateSql).toContain('AND s.user_id =');
    expect(updateSql).toContain('party_id =');
    expect(updateSql).toContain('simulation_result =');
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
    });
    expect(resolveForSimulation).toHaveBeenCalledWith(
      expect.objectContaining({ document: '52998224725' }),
      expect.anything(),
    );
  });

  it('devolve 404 quando a simulação não é do parceiro autenticado', async () => {
    const { service } = buildService({ editableState: 'missing' });

    await expect(
      service.updateSimulation(otherActor, SIMULATION_ID, dto()),
    ).rejects.toThrow(NotFoundException);
  });

  it('bloqueia edição quando a simulação já originou uma quote', async () => {
    const { service, queryRaw, resolveForSimulation, simulateRequestedAmount } =
      buildService({
        editableState: 'converted',
      });

    await expect(
      service.updateSimulation(actor, SIMULATION_ID, dto()),
    ).rejects.toThrow(ConflictException);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(resolveForSimulation).not.toHaveBeenCalled();
    expect(simulateRequestedAmount).not.toHaveBeenCalled();
  });

  it('fecha a corrida se a quote for criada durante a atualização', async () => {
    const { service } = buildService({ updated: null });

    await expect(
      service.updateSimulation(actor, SIMULATION_ID, dto()),
    ).rejects.toThrow(ConflictException);
  });

  it('bloqueia o PATCH quando a fila de cobrança impede simular', async () => {
    const { service, queryRaw } = buildService({ canSimulateQuote: false });

    await expect(
      service.updateSimulation(actor, SIMULATION_ID, dto()),
    ).rejects.toThrow(ForbiddenException);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('SimulationsService.listSimulations', () => {
  function listService(rows: Record<string, unknown>[] = []) {
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
    return {
      service: new SimulationsService(
        prisma,
        quoteActivityPermissions,
        partiesService,
        celcoinSimulation,
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

  it('não expõe o JSON cru e omite o total em simulação legada', async () => {
    const { service } = listService([
      simulationRow({
        product_name: 'CRÉDITO PESSOAL',
        simulation_result: null,
      }),
    ]);

    const [result] = await service.listSimulations(USER_ID);

    expect(result).not.toHaveProperty('simulationResult');
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
