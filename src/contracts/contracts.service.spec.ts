import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionsService } from '../collections/collections.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsQueryDto } from './dto/contracts-query.dto';
import { ContractsService } from './contracts.service';

const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';

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
  next_installment_id: '22222222-2222-2222-2222-222222222222',
  next_due_date: new Date('2026-09-10T00:00:00Z'),
};

interface BuildOptions {
  total?: number;
  rows?: unknown[];
}

interface QueryRawMock {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  mock: { calls: [TemplateStringsArray, ...unknown[]][] };
}

function query(overrides: Partial<ContractsQueryDto> = {}): ContractsQueryDto {
  return Object.assign(new ContractsQueryDto(), overrides);
}

async function buildService(options: BuildOptions = {}) {
  const total = options.total ?? 1;
  let callCount = 0;
  const queryRaw = jest.fn(() => {
    callCount += 1;
    return Promise.resolve(
      callCount === 1 ? [{ total: BigInt(total) }] : (options.rows ?? [ROW]),
    );
  }) as unknown as QueryRawMock;
  const prisma = { $queryRaw: queryRaw };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ContractsService,
      { provide: PrismaService, useValue: prisma },
      { provide: CollectionsService, useValue: { getDetail: jest.fn() } },
    ],
  }).compile();
  return { service: module.get(ContractsService), prisma };
}

interface DetailBuildOptions {
  openInstallmentNumber?: number | null;
  lastInstallmentNumber?: number | null;
}

/**
 * Setup independente pra getContractDetail: o $queryRaw aqui é roteado por
 * conteúdo do SQL (não por ordem de chamada, diferente do buildService acima),
 * já que o método dispara 1 ou 2 queries distintas dependendo do contrato ter
 * parcela em aberto ou não.
 */
async function buildDetailService(options: DetailBuildOptions = {}) {
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes("'not_paid', 'partially_paid'")) {
      const n = options.openInstallmentNumber;
      return Promise.resolve(n == null ? [] : [{ installment_number: n }]);
    }
    if (sql.includes('ORDER BY installment_number DESC')) {
      const n = options.lastInstallmentNumber;
      return Promise.resolve(n == null ? [] : [{ installment_number: n }]);
    }
    throw new Error(`query não mapeada no mock: ${sql}`);
  });
  const getDetail = jest
    .fn()
    .mockResolvedValue({ contract: { id: CONTRACT_ID } });
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ContractsService,
      { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      { provide: CollectionsService, useValue: { getDetail } },
    ],
  }).compile();
  return { service: module.get(ContractsService), getDetail };
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
          nextInstallmentId: ROW.next_installment_id,
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
      service.getContracts(
        USER_ID,
        query({
          page: 2,
          limit: 10,
        }),
      ),
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

  it('executa somente total e página para a listagem vinculada ao usuário', async () => {
    const { service, prisma } = await buildService();
    await service.getContracts(USER_ID);

    expect(prisma.$queryRaw.mock.calls).toHaveLength(2);
  });

  it('aceita filtros combinados de listagem', async () => {
    const { service, prisma } = await buildService();
    await service.getContracts(
      USER_ID,
      query({
        page: 1,
        limit: 30,
        search: 'João',
        products: ['11111111-1111-4111-8111-111111111111'],
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        onlyActive: true,
        onlyDelinquency: true,
        onlyRenegotiated: true,
      }),
    );

    expect(prisma.$queryRaw.mock.calls).toHaveLength(2);
  });

  it('rejeita período cuja data inicial é posterior à final', async () => {
    const { service, prisma } = await buildService();

    await expect(
      service.getContracts(
        USER_ID,
        query({
          page: 1,
          limit: 30,
          startDate: '2026-02-01',
          endDate: '2026-01-31',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('ContractsService.getContractDetail', () => {
  const VIEWER = { userId: USER_ID, permissions: [] };

  it('usa a parcela em aberto mais próxima do vencimento quando existir', async () => {
    const { service, getDetail } = await buildDetailService({
      openInstallmentNumber: 4,
    });

    await service.getContractDetail(VIEWER, CONTRACT_ID);

    expect(getDetail).toHaveBeenCalledWith(VIEWER, CONTRACT_ID, 4);
  });

  it('cai pra última parcela quando não há nenhuma em aberto (contrato pago)', async () => {
    const { service, getDetail } = await buildDetailService({
      openInstallmentNumber: null,
      lastInstallmentNumber: 12,
    });

    await service.getContractDetail(VIEWER, CONTRACT_ID);

    expect(getDetail).toHaveBeenCalledWith(VIEWER, CONTRACT_ID, 12);
  });

  it('404 quando o contrato não tem nenhuma parcela', async () => {
    const { service, getDetail } = await buildDetailService({
      openInstallmentNumber: null,
      lastInstallmentNumber: null,
    });

    await expect(
      service.getContractDetail(VIEWER, CONTRACT_ID),
    ).rejects.toThrow(NotFoundException);
    expect(getDetail).not.toHaveBeenCalled();
  });
});
