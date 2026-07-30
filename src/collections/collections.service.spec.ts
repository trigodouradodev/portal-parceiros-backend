import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CollectionsService } from './collections.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { ResponsibleType } from './interfaces/responsible.interface';

const VIEWER = { userId: 'user-1', permissions: [] };
const CONTRACT_ID = '11111111-1111-1111-1111-111111111111';

/** Fragmento devolvido pelo ScopeService quando o viewer enxerga tudo. */
const SCOPE_TRUE = Prisma.sql`TRUE`;

function overdueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'installment-1',
    contract_id: CONTRACT_ID,
    installment_number: 3,
    due_date: new Date('2026-07-01T00:00:00Z'),
    pending_amount: '1250.50',
    total_amount: '1500.00',
    status: 'not_paid',
    days_overdue: 29,
    contract_number: 'CT-001',
    total_installments: 12,
    client_name: 'João Silva',
    client_tax_id: '12345678909',
    client_phone: '11987654321',
    addr_street: 'R. das Flores',
    addr_number: '123',
    addr_complement: 'apto 4',
    addr_neighborhood: 'Centro',
    addr_city: 'São Paulo',
    addr_state: 'SP',
    addr_zip_code: '01001000',
    consultant_id: 'consultor-1',
    consultant_name: 'Maria Souza',
    collection_agent_id: 'agente-1',
    collection_agent_name: 'Roger Santos',
    company_name: 'Trigo Dourado',
    task_id: 'task-1',
    task_segment_code: 'S1',
    task_stage_badge_label: 'Atrasado',
    task_task_type: 'call',
    task_status: 'pending',
    task_created_at: new Date('2026-07-28T09:00:00Z'),
    task_completed_at: null,
    ...overrides,
  };
}

function upcomingRow(overrides: Record<string, unknown> = {}) {
  const { task_id, days_overdue, ...base } = overdueRow();
  void task_id;
  void days_overdue;
  return {
    ...base,
    days_until_due: 5,
    followup_count: 2,
    latest_followup_status: 'promise_to_pay',
    ...overrides,
  };
}

interface BuildOptions {
  /** null simula viewer sem árvore de hierarquia. */
  scopeClause?: Prisma.Sql | null;
  total?: number;
  rows?: Record<string, unknown>[];
  canViewContract?: boolean;
}

function build(options: BuildOptions = {}) {
  const {
    scopeClause = SCOPE_TRUE,
    total = 1,
    rows = [overdueRow()],
    canViewContract = true,
  } = options;

  let queryCall = 0;
  const prisma = {
    // 1ª query: COUNT para a paginação. 2ª: a página em si.
    $queryRaw: jest.fn(() => {
      queryCall += 1;
      return Promise.resolve(queryCall === 1 ? [{ total }] : rows);
    }),
    contracts: { findUnique: jest.fn().mockResolvedValue(null) },
    installments: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const scope = {
    buildContractScopeSql: jest.fn().mockResolvedValue(scopeClause),
    canViewContract: jest.fn().mockResolvedValue(canViewContract),
  };

  return { prisma, scope };
}

async function buildService(options: BuildOptions = {}) {
  const { prisma, scope } = build(options);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CollectionsService,
      { provide: PrismaService, useValue: prisma },
      { provide: ScopeService, useValue: scope },
    ],
  }).compile();
  return { service: module.get(CollectionsService), prisma, scope };
}

describe.each([
  ['getOverdue', 'overdue' as const],
  ['getPreventive', 'preventive' as const],
])('%s — scope e paginação', (_name, kind) => {
  const call = (service: CollectionsService, page?: number, limit?: number) =>
    kind === 'overdue'
      ? service.getOverdue(VIEWER, page, limit)
      : service.getPreventive(VIEWER, page, limit);

  const rowFor = () => (kind === 'overdue' ? overdueRow() : upcomingRow());

  it('devolve página vazia sem ir ao banco quando o viewer não tem árvore', async () => {
    const { service, prisma } = await buildService({ scopeClause: null });
    const result = await call(service);

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('ecoa page e limit pedidos mesmo na página vazia', async () => {
    const { service } = await buildService({ scopeClause: null });
    const result = await call(service, 3, 50);

    expect(result.pagination).toMatchObject({ page: 3, limit: 50 });
  });

  it('não busca a página quando o total é zero', async () => {
    const { service, prisma } = await buildService({ total: 0 });
    const result = await call(service);

    expect(result.items).toEqual([]);
    // Só o COUNT rodou.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('calcula totalPages arredondando para cima', async () => {
    const { service } = await buildService({ total: 61, rows: [rowFor()] });
    const result = await call(service, 1, 30);

    expect(result.pagination.totalPages).toBe(3);
  });

  it('marca hasNextPage enquanto não é a última página', async () => {
    const { service } = await buildService({ total: 61, rows: [rowFor()] });
    await expect(call(service, 2, 30)).resolves.toMatchObject({
      pagination: { hasNextPage: true },
    });
  });

  it('desmarca hasNextPage na última página', async () => {
    const { service } = await buildService({ total: 61, rows: [rowFor()] });
    await expect(call(service, 3, 30)).resolves.toMatchObject({
      pagination: { hasNextPage: false },
    });
  });

  it('usa página 1 e limite 30 por padrão', async () => {
    const { service } = await buildService({ total: 5, rows: [rowFor()] });
    await expect(call(service)).resolves.toMatchObject({
      pagination: { page: 1, limit: 30 },
    });
  });

  it('exige INSTALLMENT_VIEW_ALL como permissão de visão global', async () => {
    const { service, scope } = await buildService({ total: 0 });
    await call(service);

    const [, viewAll] = scope.buildContractScopeSql.mock.calls[0] as [
      unknown,
      string[],
    ];
    expect(viewAll).toEqual(['INSTALLMENT_VIEW_ALL']);
  });
});

describe('getOverdue — mapeamento do item', () => {
  it('monta parcela, contrato, cliente, tarefa e responsável', async () => {
    const { service } = await buildService();
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.installment).toEqual({
      id: 'installment-1',
      number: 3,
      label: '3/12',
      dueDate: new Date('2026-07-01T00:00:00Z'),
      daysOverdue: 29,
      pendingAmount: 1250.5,
      totalAmount: 1500,
      status: 'not_paid',
    });
    expect(item.contract).toEqual({
      id: CONTRACT_ID,
      number: 'CT-001',
      totalInstallments: 12,
      companyName: 'Trigo Dourado',
    });
    expect(item.client.address).toEqual({
      street: 'R. das Flores',
      number: '123',
      complement: 'apto 4',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    });
  });

  it('omite o endereço quando não há logradouro', async () => {
    const { service } = await buildService({
      rows: [overdueRow({ addr_street: null })],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.client.address).toBeUndefined();
  });

  it('cai para vazio nos campos opcionais do endereço', async () => {
    const { service } = await buildService({
      rows: [
        overdueRow({
          addr_number: null,
          addr_complement: null,
          addr_state: null,
          addr_zip_code: null,
        }),
      ],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.client.address).toMatchObject({
      number: '',
      complement: undefined,
      state: undefined,
      zipCode: '',
    });
  });

  it('devolve tarefa nula quando a parcela não tem nenhuma', async () => {
    const { service } = await buildService({
      rows: [overdueRow({ task_id: null })],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.task).toBeNull();
  });

  it('cai para vazio nos campos opcionais da tarefa', async () => {
    const { service } = await buildService({
      rows: [
        overdueRow({
          task_segment_code: null,
          task_stage_badge_label: null,
          task_task_type: null,
          task_status: null,
        }),
      ],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.task).toMatchObject({
      segmentCode: '',
      segmentBadgeLabel: '',
      taskType: '',
      status: '',
      completedAt: undefined,
    });
  });
});

describe('responsável pela cobrança', () => {
  it('prefere o agente de cobrança quando o contrato tem os dois', async () => {
    const { service } = await buildService();
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.responsible).toEqual({
      id: 'agente-1',
      name: 'Roger Santos',
      type: ResponsibleType.COLLECTION_AGENT,
    });
  });

  it('cai para o consultor quando não há agente de cobrança', async () => {
    const { service } = await buildService({
      rows: [
        overdueRow({ collection_agent_id: null, collection_agent_name: null }),
      ],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.responsible).toEqual({
      id: 'consultor-1',
      name: 'Maria Souza',
      type: ResponsibleType.CONSULTANT,
    });
  });

  it('devolve undefined quando o contrato não tem nenhum dos dois', async () => {
    const { service } = await buildService({
      rows: [
        overdueRow({
          consultant_id: null,
          consultant_name: null,
          collection_agent_id: null,
          collection_agent_name: null,
        }),
      ],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.responsible).toBeUndefined();
  });

  it('cai para nome vazio quando o responsável não tem nome', async () => {
    const { service } = await buildService({
      rows: [overdueRow({ collection_agent_name: null })],
    });
    const [item] = (await service.getOverdue(VIEWER)).items;

    expect(item.responsible?.name).toBe('');
  });
});

describe('getPreventive — mapeamento do item', () => {
  it('traz dias até vencer e o resumo de follow-up no lugar da tarefa', async () => {
    const { service } = await buildService({ rows: [upcomingRow()] });
    const [item] = (await service.getPreventive(VIEWER)).items;

    expect(item.installment.daysUntilDue).toBe(5);
    expect(item.followup).toEqual({
      count: 2,
      latestStatus: 'promise_to_pay',
    });
  });

  it('zera a contagem e omite o status quando não há follow-up', async () => {
    const { service } = await buildService({
      rows: [
        upcomingRow({ followup_count: null, latest_followup_status: null }),
      ],
    });
    const [item] = (await service.getPreventive(VIEWER)).items;

    expect(item.followup).toEqual({ count: 0, latestStatus: undefined });
  });
});

describe('getDetail — gating de acesso', () => {
  it('404 quando o viewer não pode ver o contrato', async () => {
    // Fora do escopo e inexistente respondem igual, para não revelar existência.
    const { service, prisma } = await buildService({ canViewContract: false });

    await expect(service.getDetail(VIEWER, CONTRACT_ID, 3)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.contracts.findUnique).not.toHaveBeenCalled();
  });

  it('404 quando o contrato não existe, mesmo com acesso liberado', async () => {
    const { service } = await buildService({ canViewContract: true });

    await expect(service.getDetail(VIEWER, CONTRACT_ID, 3)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('exige INSTALLMENT_VIEW_ALL como permissão de visão global', async () => {
    const { service, scope } = await buildService({ canViewContract: false });
    await expect(service.getDetail(VIEWER, CONTRACT_ID, 3)).rejects.toThrow(
      NotFoundException,
    );

    const [, , viewAll] = scope.canViewContract.mock.calls[0] as [
      unknown,
      unknown,
      string[],
    ];
    expect(viewAll).toEqual(['INSTALLMENT_VIEW_ALL']);
  });
});
