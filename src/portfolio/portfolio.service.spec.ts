import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { PortfolioService } from './portfolio.service';

const VIEWER = { userId: 'user-1', permissions: [] };
const SCOPE_TRUE = Prisma.sql`TRUE`;

const SNAPSHOT = {
  portfolio_active_amount: '184250.75',
  active_contracts: 42n,
  delinquency_amount: '22731.15',
  delinquent_contracts: 8n,
  renegotiated_outstanding_amount: '34500.50',
  scheduled_current_month_amount: '97000',
};

const ORIGINATION = {
  month: '2026-08',
  origination_amount: '250000',
  origination_contracts: 14n,
  new_clients: 6n,
  renewed_clients: 5n,
  reactive_clients: 3n,
  average_interest_rate: '0.1125',
};

const RECEIPTS = {
  current_month_amount: '83000',
  advance_amount: '4200',
  late_amount: '8500',
};

const SETTLED = { settled_contracts: 4n };

interface BuildOptions {
  scopeClause?: Prisma.Sql | null;
  snapshot?: unknown[];
  origination?: unknown[];
  receipts?: unknown[];
  settled?: unknown[];
}

function createPrismaMock(options: BuildOptions) {
  return {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('portfolio_active_amount')) {
        return Promise.resolve(options.snapshot ?? [SNAPSHOT]);
      }
      if (sql.includes('origination_amount')) {
        return Promise.resolve(options.origination ?? [ORIGINATION]);
      }
      if (sql.includes('current_month_amount')) {
        return Promise.resolve(options.receipts ?? [RECEIPTS]);
      }
      if (sql.includes('settled_contracts')) {
        return Promise.resolve(options.settled ?? [SETTLED]);
      }
      throw new Error(`query não mapeada no mock: ${sql}`);
    }),
  };
}

async function buildService(options: BuildOptions = {}) {
  const prisma = createPrismaMock(options);
  const scope = {
    buildContractScopeSql: jest
      .fn()
      .mockResolvedValue(
        options.scopeClause === undefined ? SCOPE_TRUE : options.scopeClause,
      ),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PortfolioService,
      { provide: PrismaService, useValue: prisma },
      { provide: ScopeService, useValue: scope },
    ],
  }).compile();
  return { service: module.get(PortfolioService), prisma, scope };
}

describe('PortfolioService.getSummary', () => {
  it('agrega as quatro fontes analíticas e converte taxa para percentual', async () => {
    const { service } = await buildService();

    await expect(service.getSummary(VIEWER)).resolves.toEqual({
      month: '2026-08',
      active: { outstandingAmount: 184250.75, contracts: 42 },
      delinquency: { rate: 12.34, amount: 22731.15, contracts: 8 },
      renegotiatedOutstandingAmount: 34500.5,
      origination: {
        amount: 250000,
        contracts: 14,
        newClients: 6,
        renewedClients: 5,
        reactiveClients: 3,
      },
      settledContracts: 4,
      receipts: {
        currentMonthAmount: 83000,
        scheduledCurrentMonthAmount: 97000,
        advanceAmount: 4200,
        lateAmount: 8500,
      },
      averageRemainingNominalPerContract: 4386.92,
      averageInterestRate: 11.25,
    });
  });

  it('devolve resumo zerado e não consulta as views sem árvore de escopo', async () => {
    const { service, prisma } = await buildService({ scopeClause: null });
    const result = await service.getSummary(VIEWER);

    expect(result).toMatchObject({
      active: { outstandingAmount: 0, contracts: 0 },
      delinquency: { rate: 0, amount: 0, contracts: 0 },
      averageInterestRate: null,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('mantém taxa nula quando não houve originação no mês', async () => {
    const { service } = await buildService({
      origination: [{ ...ORIGINATION, average_interest_rate: null }],
    });

    await expect(service.getSummary(VIEWER)).resolves.toMatchObject({
      averageInterestRate: null,
    });
  });

  it('usa INSTALLMENT_VIEW_ALL para decidir visão global', async () => {
    const { service, scope } = await buildService();
    await service.getSummary(VIEWER);

    expect(scope.buildContractScopeSql).toHaveBeenCalledWith(VIEWER, [
      'INSTALLMENT_VIEW_ALL',
    ]);
  });

  it('conta quitados pela data do último pagamento, e não por qualquer pagamento', async () => {
    const { service, prisma } = await buildService();
    await service.getSummary(VIEWER);

    const settledQuery = prisma.$queryRaw.mock.calls
      .map((call: unknown[]) => (call[0] as TemplateStringsArray).join(' '))
      .find((sql: string) => sql.includes('settled_contracts'));

    expect(settledQuery).toContain('MAX(i.payment_date) AS last_payment_date');
    expect(settledQuery).toContain('last_payment.last_payment_date >=');
  });
});
