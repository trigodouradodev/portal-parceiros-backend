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
};

interface BuildOptions {
  scopeClause?: Prisma.Sql | null;
  snapshot?: unknown[];
}

function createPrismaMock(options: BuildOptions) {
  return {
    $queryRaw: jest.fn(() => Promise.resolve(options.snapshot ?? [SNAPSHOT])),
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
  it('agrega os seis KPIs de carteira da view analítica', async () => {
    const { service } = await buildService();

    await expect(service.getSummary(VIEWER)).resolves.toEqual({
      active: { outstandingAmount: 184250.75, contracts: 42 },
      delinquency: { rate: 12.34, amount: 22731.15, contracts: 8 },
      renegotiatedOutstandingAmount: 34500.5,
    });
  });

  it('devolve resumo zerado e não consulta a view sem árvore de escopo', async () => {
    const { service, prisma } = await buildService({ scopeClause: null });
    const result = await service.getSummary(VIEWER);

    expect(result).toEqual({
      active: { outstandingAmount: 0, contracts: 0 },
      delinquency: { rate: 0, amount: 0, contracts: 0 },
      renegotiatedOutstandingAmount: 0,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('usa INSTALLMENT_VIEW_ALL para decidir visão global', async () => {
    const { service, scope } = await buildService();
    await service.getSummary(VIEWER);

    expect(scope.buildContractScopeSql).toHaveBeenCalledWith(VIEWER, [
      'INSTALLMENT_VIEW_ALL',
    ]);
  });

  it('consulta somente a view necessária aos KPIs mantidos', async () => {
    const { service, prisma } = await buildService();
    await service.getSummary(VIEWER);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join(' ')).toContain('analytics.vw_fato_parcela');
  });
});
