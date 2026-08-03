import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioService } from './portfolio.service';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';

const SNAPSHOT = {
  portfolio_active_amount: '184250.75',
  active_contracts: 42n,
  delinquency_amount: '22731.15',
  delinquent_contracts: 8n,
  renegotiated_outstanding_amount: '34500.50',
};

async function buildService(snapshot: unknown[] = [SNAPSHOT]) {
  const prisma = { $queryRaw: jest.fn(() => Promise.resolve(snapshot)) };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PortfolioService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { service: module.get(PortfolioService), prisma };
}

describe('PortfolioService.getSummary', () => {
  it('agrega os seis KPIs de carteira da view analítica', async () => {
    const { service } = await buildService();

    await expect(service.getSummary(USER_ID)).resolves.toEqual({
      active: { outstandingAmount: 184250.75, contracts: 42 },
      delinquency: { rate: 12.34, amount: 22731.15, contracts: 8 },
      renegotiatedOutstandingAmount: 34500.5,
    });
  });

  it('devolve zeros quando o usuário não possui contratos vinculados', async () => {
    const { service } = await buildService([]);

    await expect(service.getSummary(USER_ID)).resolves.toEqual({
      active: { outstandingAmount: 0, contracts: 0 },
      delinquency: { rate: 0, amount: 0, contracts: 0 },
      renegotiatedOutstandingAmount: 0,
    });
  });

  it('restringe a consulta ao vínculo direto como consultor ou agente', async () => {
    const { service, prisma } = await buildService();
    await service.getSummary(USER_ID);

    const [strings, userId] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    const sql = strings.join(' ');

    expect(sql).toContain('analytics.vw_fato_parcela');
    expect(sql).toContain('c.consultant_id =');
    expect(sql).toContain('c.current_collection_agent_id =');
    expect(userId).toBe(USER_ID);
    expect(sql).not.toContain('WITH RECURSIVE');
  });
});
