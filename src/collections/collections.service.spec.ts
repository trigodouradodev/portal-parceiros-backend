import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CollectionsService } from './collections.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { ResponsibleType } from './interfaces/responsible.interface';

const VIEWER = { userId: 'user-1', permissions: [] };
const CONTRACT_ID = '11111111-1111-1111-1111-111111111111';

/** Fragmento devolvido pelo ScopeService para o ownership direto. */
const DIRECT_SCOPE = Prisma.sql`
  (c.consultant_id = 'user-1' OR c.current_collection_agent_id = 'user-1')
`;

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
  scopeClause?: Prisma.Sql;
  total?: number;
  rows?: Record<string, unknown>[];
  canDirectlyViewContract?: boolean;
  contract?: Record<string, unknown> | null;
  installment?: Record<string, unknown> | null;
  lastDueDate?: Date | null;
  followUps?: Record<string, unknown>[];
  statusHistory?: Record<string, unknown>[];
}

/** Linha do `contracts.findUnique` de `getDetail`, com todos os joins novos. */
function contractDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    contract_number: 'CT-001',
    status: 'disbursed',
    total_amount: '2000.00',
    total_with_iof: '2150.00',
    iof_amount: '150.00',
    total_installments: 9,
    disbursement_date: new Date('2026-06-26T00:00:00Z'),
    clients: {
      name: 'Maria Souza',
      tax_id: '12345678909',
      phone: '11987654321',
      email: 'maria@email.com',
      addresses: [
        {
          street: 'R. das Flores',
          number: '123',
          complement: null,
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          zip_code: '01001000',
        },
      ],
    },
    companies: { name: 'CELCOIN' },
    quotes: {
      tac_amount: '50.00',
      guarantor: null,
      finance_products: { product_name: 'CRÉDITO PESSOAL' },
      trigo_users_quotes_current_sales_agent_idTotrigo_users: {
        full_name: 'Vendedor Um',
      },
    },
    trigo_users_contracts_current_collection_agent_idTotrigo_users: null,
    trigo_users_contracts_consultant_idTotrigo_users: {
      id: 'consultor-1',
      full_name: 'Consultor Dois',
    },
    ...overrides,
  };
}

/** Linha do `installments.findFirst` de `getDetail`. */
function detailInstallmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'installment-1',
    installment_number: 3,
    due_date: new Date('2026-07-01T00:00:00Z'),
    total_amount: '406.52',
    pending_amount: '406.52',
    status: 'not_paid',
    ...overrides,
  };
}

function build(options: BuildOptions = {}) {
  const {
    scopeClause = DIRECT_SCOPE,
    total = 1,
    rows = [overdueRow()],
    canDirectlyViewContract = true,
    contract = null,
    installment = null,
    lastDueDate = null,
    followUps = [],
    statusHistory = [],
  } = options;

  let queryCall = 0;
  const prisma = {
    // 1ª query: COUNT para a paginação. 2ª: a página em si.
    $queryRaw: jest.fn(() => {
      queryCall += 1;
      return Promise.resolve(queryCall === 1 ? [{ total }] : rows);
    }),
    contracts: { findUnique: jest.fn().mockResolvedValue(contract) },
    installments: {
      findFirst: jest.fn().mockResolvedValue(installment),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _max: { due_date: lastDueDate } }),
    },
    installment_followups: { findMany: jest.fn().mockResolvedValue(followUps) },
    contract_status_history: {
      findMany: jest.fn().mockResolvedValue(statusHistory),
    },
  };
  const scope = {
    buildDirectContractScopeSql: jest.fn().mockReturnValue(scopeClause),
    canDirectlyViewContract: jest
      .fn()
      .mockResolvedValue(canDirectlyViewContract),
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

  it('pede ao ScopeService o ownership direto do usuário', async () => {
    const { service, scope } = await buildService({ total: 0 });
    await call(service);
    expect(scope.buildDirectContractScopeSql).toHaveBeenCalledWith('user-1');
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
    const { service, prisma } = await buildService({
      canDirectlyViewContract: false,
    });

    await expect(service.getDetail(VIEWER, CONTRACT_ID, 3)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.contracts.findUnique).not.toHaveBeenCalled();
  });

  it('404 quando o contrato não existe, mesmo com acesso liberado', async () => {
    const { service } = await buildService({ canDirectlyViewContract: true });

    await expect(service.getDetail(VIEWER, CONTRACT_ID, 3)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('valida o vínculo direto pelo usuário autenticado', async () => {
    const { service, scope } = await buildService({
      canDirectlyViewContract: false,
    });
    await expect(service.getDetail(VIEWER, CONTRACT_ID, 3)).rejects.toThrow(
      NotFoundException,
    );

    expect(scope.canDirectlyViewContract).toHaveBeenCalledWith(
      CONTRACT_ID,
      'user-1',
    );
  });
});

describe('getDetail — campos expandidos do contrato (AUREA-346)', () => {
  it('mapeia status, produto, empresa, IOF/TAC, e-mail e consultor da proposta', async () => {
    const { service } = await buildService({
      contract: contractDetailRow(),
      installment: detailInstallmentRow(),
    });

    const detail = await service.getDetail(VIEWER, CONTRACT_ID, 3);

    expect(detail.contract).toMatchObject({
      status: 'disbursed',
      productName: 'CRÉDITO PESSOAL',
      companyName: 'CELCOIN',
      totalWithIof: 2150,
      iofAmount: 150,
      tacAmount: 50,
      originationConsultantName: 'Vendedor Um',
    });
    expect(detail.client.email).toBe('maria@email.com');
  });

  it('omite os campos financeiros da proposta quando o contrato não tem quote vinculada', async () => {
    const { service } = await buildService({
      contract: contractDetailRow({ quotes: null }),
      installment: detailInstallmentRow(),
    });

    const detail = await service.getDetail(VIEWER, CONTRACT_ID, 3);

    expect(detail.contract.productName).toBeUndefined();
    expect(detail.contract.tacAmount).toBeUndefined();
    expect(detail.contract.originationConsultantName).toBeUndefined();
    expect(detail.guarantor).toBeNull();
  });

  it('mapeia o avalista a partir de quotes.guarantor', async () => {
    const { service } = await buildService({
      contract: contractDetailRow({
        quotes: {
          tac_amount: '50.00',
          guarantor: { name: 'João Avalista', document: '987.654.321-00' },
          finance_products: { product_name: 'CRÉDITO PESSOAL' },
          trigo_users_quotes_current_sales_agent_idTotrigo_users: {
            full_name: 'Vendedor Um',
          },
        },
      }),
      installment: detailInstallmentRow(),
    });

    const detail = await service.getDetail(VIEWER, CONTRACT_ID, 3);

    expect(detail.guarantor).toEqual({
      name: 'João Avalista',
      taxId: '98765432100',
      phone: undefined,
      email: undefined,
      address: undefined,
    });
  });

  it('null quando o avalista da quote está vazio (sem nome nem documento)', async () => {
    const { service } = await buildService({
      contract: contractDetailRow({
        quotes: {
          tac_amount: '50.00',
          guarantor: { telephone: '11987654321' },
          finance_products: { product_name: 'CRÉDITO PESSOAL' },
          trigo_users_quotes_current_sales_agent_idTotrigo_users: {
            full_name: 'Vendedor Um',
          },
        },
      }),
      installment: detailInstallmentRow(),
    });

    const detail = await service.getDetail(VIEWER, CONTRACT_ID, 3);

    expect(detail.guarantor).toBeNull();
  });

  it('mapeia o histórico de mudanças de status', async () => {
    const { service } = await buildService({
      contract: contractDetailRow(),
      installment: detailInstallmentRow(),
      statusHistory: [
        {
          id: 'hist-2',
          old_status: 'active',
          new_status: 'disbursed',
          reason: null,
          created_at: new Date('2026-06-27T10:00:00Z'),
          trigo_users: { full_name: 'Sistema Webhook' },
        },
        {
          id: 'hist-1',
          old_status: 'pending',
          new_status: 'active',
          reason: 'Aprovação concluída',
          created_at: new Date('2026-06-26T09:00:00Z'),
          trigo_users: { full_name: 'Maria Souza' },
        },
      ],
    });

    const detail = await service.getDetail(VIEWER, CONTRACT_ID, 3);

    expect(detail.statusHistory).toEqual([
      {
        id: 'hist-2',
        oldStatus: 'active',
        newStatus: 'disbursed',
        reason: undefined,
        changedByName: 'Sistema Webhook',
        createdAt: new Date('2026-06-27T10:00:00Z'),
      },
      {
        id: 'hist-1',
        oldStatus: 'pending',
        newStatus: 'active',
        reason: 'Aprovação concluída',
        changedByName: 'Maria Souza',
        createdAt: new Date('2026-06-26T09:00:00Z'),
      },
    ]);
  });

  it('lista vazia quando não há histórico de status', async () => {
    const { service } = await buildService({
      contract: contractDetailRow(),
      installment: detailInstallmentRow(),
    });

    const detail = await service.getDetail(VIEWER, CONTRACT_ID, 3);

    expect(detail.statusHistory).toEqual([]);
  });
});
