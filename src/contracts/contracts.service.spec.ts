import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsQueryDto } from './dto/contracts-query.dto';
import { ContractsService } from './contracts.service';

const USER_ID = '269b0843-0aa8-40ab-af66-8304909930a6';

const ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  contract_number: 'CT-000123',
  client_name: 'João da Silva',
  company_name: 'Empresa ABC',
  consultant_name: 'Maria Souza',
  product_name: 'CRÉDITO PESSOAL',
  disbursed_amount: '10000',
  projected_amount: '12450',
  outstanding_balance: '7300.50',
  total_installments: 12,
  disbursement_date: new Date('2026-01-10T00:00:00Z'),
  next_due_date: new Date('2026-09-10T00:00:00Z'),
};

interface BuildOptions {
  total?: number;
  rows?: unknown[];
}

async function buildService(options: BuildOptions = {}) {
  const total = options.total ?? 1;
  const prisma = {
    $queryRaw: jest.fn(() => {
      const call = prisma.$queryRaw.mock.calls.length;
      return Promise.resolve(
        call === 1 ? [{ total: BigInt(total) }] : (options.rows ?? [ROW]),
      );
    }),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [ContractsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get(ContractsService), prisma };
}

describe('ContractsService.getContracts', () => {
  it('mapeia os dados solicitados da listagem de contratos', async () => {
    const { service } = await buildService();

    await expect(service.getContracts(USER_ID)).resolves.toEqual({
      items: [
        {
          id: ROW.id,
          contractNumber: 'CT-000123',
          clientName: 'João da Silva',
          companyName: 'Empresa ABC',
          consultantName: 'Maria Souza',
          productName: 'CRÉDITO PESSOAL',
          disbursedAmount: 10000,
          projectedAmount: 12450,
          outstandingBalance: 7300.5,
          totalInstallments: 12,
          disbursementDate: ROW.disbursement_date,
          nextDueDate: ROW.next_due_date,
        },
      ],
      pagination: {
        page: 1,
        limit: 30,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
      },
    });
  });

  it('não busca itens quando o usuário não possui contratos vinculados', async () => {
    const { service, prisma } = await buildService({ total: 0 });

    await expect(
      service.getContracts(USER_ID, {
        page: 2,
        limit: 10,
      } as ContractsQueryDto),
    ).resolves.toEqual({
      items: [],
      pagination: {
        page: 2,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('filtra pelo vínculo direto de consultor ou agente de cobrança', async () => {
    const { service, prisma } = await buildService();
    await service.getContracts(USER_ID);

    const [strings, userId] = prisma.$queryRaw.mock.calls[1] as [
      TemplateStringsArray,
      string,
    ];
    const sql = strings.join(' ');

    expect(sql).toContain('c.consultant_id =');
    expect(sql).toContain('c.current_collection_agent_id =');
    expect(sql).toContain('MIN(i.due_date) FILTER');
    expect(userId).toBe(USER_ID);
    expect(sql).not.toContain('WITH RECURSIVE');
  });

  it('aplica os filtros de texto, produto, período, atraso e renegociação', async () => {
    const { service, prisma } = await buildService();
    await service.getContracts(USER_ID, {
      page: 1,
      limit: 30,
      search: 'João',
      products: ['11111111-1111-4111-8111-111111111111'],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      onlyDelinquency: true,
      onlyRenegotiated: true,
    } as ContractsQueryDto);

    const [strings] = prisma.$queryRaw.mock.calls[1] as [TemplateStringsArray];
    const sql = strings.join(' ');

    expect(sql).toContain('cl.name ILIKE');
    expect(sql).toContain('c.contract_number ILIKE');
    expect(sql).toContain('product_quote.finance_product_id = ANY');
    expect(sql).toContain('c.disbursement_date >=');
    expect(sql).toContain('c.disbursement_date <=');
    expect(sql).toContain('overdue_installment.due_date < CURRENT_DATE');
    expect(sql).toContain('FROM public.renegotiations r');
  });

  it('rejeita período cuja data inicial é posterior à final', async () => {
    const { service, prisma } = await buildService();

    await expect(
      service.getContracts(USER_ID, {
        page: 1,
        limit: 30,
        startDate: '2026-02-01',
        endDate: '2026-01-31',
      } as ContractsQueryDto),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
