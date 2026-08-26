import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSimulationDto } from './dto/create-simulation.dto';
import { calcInstallment, SimulationsService } from './simulations.service';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const actor = {
  sub: USER_ID,
  email: 'parceiro@trigodourado.com',
  role: 'ROLE_CONSULTANT',
  permissions: [PermissionKey.QUOTE_CREATE, PermissionKey.ROLE_CONSULTANT],
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

function buildService(options?: {
  canSimulateQuote?: boolean;
  product?: typeof product | null;
  inserted?: Record<string, unknown>;
}) {
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes('FROM public.consultant_finance_products')) {
      if (options && 'product' in options) {
        return options.product ? [options.product] : [];
      }
      return [product];
    }
    if (sql.includes('INSERT INTO public.simulations')) {
      return [
        options?.inserted ?? {
          id: 'sim-1',
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
          installment_amount: 598.42,
          simulation_result: null,
          created_at: new Date('2026-08-26T12:00:00.000Z'),
        },
      ];
    }
    return [];
  });

  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const quoteActivityPermissions = {
    getPermissions: jest.fn().mockResolvedValue({
      canSimulateQuote: options?.canSimulateQuote ?? true,
      canCreateQuote: true,
    }),
  } as unknown as QuoteActivityPermissionsService;

  return {
    service: new SimulationsService(prisma, quoteActivityPermissions),
    queryRaw,
    quoteActivityPermissions,
  };
}

describe('calcInstallment', () => {
  it('calcula Price com taxa decimal do produto', () => {
    expect(calcInstallment(5000, 10, 0.0339)).toBe(597.88);
  });

  it('divide o principal quando a taxa é zero', () => {
    expect(calcInstallment(5000, 10, 0)).toBe(500);
  });
});

describe('SimulationsService.createSimulation', () => {
  it('persiste a simulação do parceiro e devolve o snapshot em inglês', async () => {
    const { service, queryRaw } = buildService();

    const result = await service.createSimulation(actor, dto());

    expect(result.name).toBe('Maria Souza');
    expect(result.document).toBe('52998224725');
    expect(result.productName).toBe('CRÉDITO PESSOAL');
    expect(result.productId).toBe(PRODUCT_ID);
    expect(result.interestRate).toBe(0.0339);
    expect(result.amount).toBe(5000);
    expect(result.installments).toBe(10);
    expect(result.firstInstallmentDate).toBe(futureDueDate());
    expect(result.installmentAmount).toBe(598.42);
    expect(result.createdAt).toBe('2026-08-26T12:00:00.000Z');

    const insertSql = queryRaw.mock.calls[1][0].join(' ');
    expect(insertSql).toContain('INSERT INTO public.simulations');
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

describe('SimulationsService.listSimulations', () => {
  it('lista só as simulações do usuário autenticado, mais recente primeiro', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const quoteActivityPermissions = {
      getPermissions: jest.fn(),
    } as unknown as QuoteActivityPermissionsService;
    const service = new SimulationsService(prisma, quoteActivityPermissions);

    await service.listSimulations(USER_ID);

    const [strings, userId] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    const sql = strings.join(' ');
    expect(sql).toContain('FROM public.simulations s');
    expect(sql).toContain('WHERE s.user_id =');
    expect(sql).toContain('ORDER BY s.created_at DESC');
    expect(userId).toBe(USER_ID);
  });
});
