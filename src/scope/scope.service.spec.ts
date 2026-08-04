import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ScopeService, ScopeViewer } from './scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey } from '../auth/permissions/permission-keys';

const VIEWER_ID = '11111111-1111-1111-1111-111111111111';
const SUBORDINATE_ID = '22222222-2222-2222-2222-222222222222';
const CONTRACT_ID = '33333333-3333-3333-3333-333333333333';

/** Árvore com o próprio viewer mais um subordinado. */
const TREE = [{ id: VIEWER_ID }, { id: SUBORDINATE_ID }];

/**
 * `$queryRaw` é mockado como um todo: a CTE recursiva de `expandUserSubtree`
 * vira string opaca no mock, então o que estes specs cobrem é a lógica de
 * decisão em TypeScript — os três estados do fragmento de scope, os bypasses de
 * permissão e os curtos-circuitos que evitam ir ao banco. A recursão e o guard
 * contra self-reference só se provam contra Postgres de verdade.
 */
function createPrismaMock(tree: { id: string }[] = TREE) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(tree),
    contracts: { findFirst: jest.fn().mockResolvedValue(null) },
    form_approvals: { findFirst: jest.fn().mockResolvedValue(null) },
    quote_approvals: { findFirst: jest.fn().mockResolvedValue(null) },
    quotes: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

async function build(
  tree?: { id: string }[],
): Promise<{ service: ScopeService; prisma: PrismaMock }> {
  const prisma = createPrismaMock(tree);
  const module: TestingModule = await Test.createTestingModule({
    providers: [ScopeService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get(ScopeService), prisma };
}

function viewer(permissions: string[] = []): ScopeViewer {
  return { userId: VIEWER_ID, permissions };
}

describe('expandUserSubtree', () => {
  it('devolve vazio e nem toca no banco quando a entrada é vazia', async () => {
    const { service, prisma } = await build();
    await expect(service.expandUserSubtree([])).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('achata as linhas da CTE em uma lista de ids', async () => {
    const { service } = await build();
    await expect(service.expandUserSubtree([VIEWER_ID])).resolves.toEqual([
      VIEWER_ID,
      SUBORDINATE_ID,
    ]);
  });

  it('usa o client da transação quando recebe um tx', async () => {
    const { service, prisma } = await build();
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: VIEWER_ID }]) };

    await service.expandUserSubtree(
      [VIEWER_ID],
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('getViewerScopeIds', () => {
  it('expõe consultantIds e collectionAgentIds como aliases da mesma árvore', async () => {
    // Pós-consolidação o ownership guarda trigo_users.id direto, então os três
    // campos são o mesmo conjunto — os dois últimos existem por compatibilidade.
    const { service } = await build();
    const scope = await service.getViewerScopeIds(VIEWER_ID);

    expect(scope.userIds).toEqual([VIEWER_ID, SUBORDINATE_ID]);
    expect(scope.consultantIds).toEqual(scope.userIds);
    expect(scope.collectionAgentIds).toEqual(scope.userIds);
  });
});

describe('resolvers de filtro em cascata', () => {
  it('resolveManagerFilter devolve null para entrada vazia, sinalizando "sem filtro"', async () => {
    const { service, prisma } = await build();
    await expect(service.resolveManagerFilter([])).resolves.toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('resolveManagerFilter expande a subárvore dos gestores nos dois campos', async () => {
    const { service } = await build();
    await expect(service.resolveManagerFilter([VIEWER_ID])).resolves.toEqual({
      consultantIds: [VIEWER_ID, SUBORDINATE_ID],
      collectionAgentIds: [VIEWER_ID, SUBORDINATE_ID],
    });
  });

  it('resolveConsultantFilter e resolveCollectionAgentFilter expandem a subárvore', async () => {
    const { service } = await build();
    await expect(service.resolveConsultantFilter([VIEWER_ID])).resolves.toEqual(
      [VIEWER_ID, SUBORDINATE_ID],
    );
    await expect(
      service.resolveCollectionAgentFilter([VIEWER_ID]),
    ).resolves.toEqual([VIEWER_ID, SUBORDINATE_ID]);
  });
});

describe('buildContractScopeSql', () => {
  it('devolve TRUE para ROLE_ADMIN, sem resolver a árvore', async () => {
    const { service, prisma } = await build();
    const sql = await service.buildContractScopeSql(
      viewer([PermissionKey.ROLE_ADMIN]),
    );

    expect(sql?.sql).toBe('TRUE');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('devolve TRUE quando o viewer tem alguma das permissões de visão global informadas', async () => {
    const { service } = await build();
    const sql = await service.buildContractScopeSql(
      viewer([PermissionKey.INSTALLMENT_VIEW_ALL]),
      [PermissionKey.INSTALLMENT_VIEW_ALL],
    );
    expect(sql?.sql).toBe('TRUE');
  });

  it('ignora permissão de visão global que o caller não declarou', async () => {
    // Ter INSTALLMENT_VIEW_ALL não dá visão global num caller que só aceita
    // CONTRACT_VIEW_ALL — o conjunto é decidido por quem chama.
    const { service } = await build();
    const sql = await service.buildContractScopeSql(
      viewer([PermissionKey.INSTALLMENT_VIEW_ALL]),
      [PermissionKey.CONTRACT_VIEW_ALL],
    );
    expect(sql?.sql).not.toBe('TRUE');
  });

  it('devolve null quando o viewer não tem árvore', async () => {
    // Contrato com o caller: null significa "renderize vazio sem ir ao banco",
    // e é diferente de um fragmento que não casa com nada.
    const { service } = await build([]);
    await expect(service.buildContractScopeSql(viewer())).resolves.toBeNull();
  });

  it('filtra pelas duas colunas de ownership com os ids da árvore', async () => {
    const { service } = await build();
    const sql = await service.buildContractScopeSql(viewer());

    expect(sql?.sql).toContain('c.consultant_id');
    expect(sql?.sql).toContain('c.current_collection_agent_id');
    expect(sql?.values).toEqual([
      [VIEWER_ID, SUBORDINATE_ID],
      [VIEWER_ID, SUBORDINATE_ID],
    ]);
  });

  it('respeita o alias informado pelo caller', async () => {
    const { service } = await build();
    const sql = await service.buildContractScopeSql(viewer(), [], 'ct');

    expect(sql?.sql).toContain('ct.consultant_id');
    expect(sql?.sql).toContain('ct.current_collection_agent_id');
  });
});

describe('canViewContract', () => {
  it('libera sem viewer — fail-open para callers internos sistêmicos', async () => {
    const { service, prisma } = await build();
    await expect(service.canViewContract(CONTRACT_ID)).resolves.toBe(true);
    expect(prisma.contracts.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['ROLE_ADMIN', PermissionKey.ROLE_ADMIN],
    ['CONTRACT_VIEW_ALL', PermissionKey.CONTRACT_VIEW_ALL],
  ])('libera com %s sem consultar o contrato', async (_label, permission) => {
    const { service, prisma } = await build();
    await expect(
      service.canViewContract(CONTRACT_ID, viewer([permission])),
    ).resolves.toBe(true);
    expect(prisma.contracts.findFirst).not.toHaveBeenCalled();
  });

  it('libera com uma permissão de visão global informada pelo caller', async () => {
    const { service } = await build();
    await expect(
      service.canViewContract(
        CONTRACT_ID,
        viewer([PermissionKey.INSTALLMENT_VIEW_ALL]),
        [PermissionKey.INSTALLMENT_VIEW_ALL],
      ),
    ).resolves.toBe(true);
  });

  it('nega quem não tem árvore, sem consultar o contrato', async () => {
    const { service, prisma } = await build([]);
    await expect(service.canViewContract(CONTRACT_ID, viewer())).resolves.toBe(
      false,
    );
    expect(prisma.contracts.findFirst).not.toHaveBeenCalled();
  });

  it('libera quando o contrato está na árvore do viewer', async () => {
    const { service, prisma } = await build();
    prisma.contracts.findFirst.mockResolvedValue({ id: CONTRACT_ID });

    await expect(service.canViewContract(CONTRACT_ID, viewer())).resolves.toBe(
      true,
    );
  });

  it('nega quando o contrato não está na árvore — ou simplesmente não existe', async () => {
    // O service não distingue os dois casos de propósito; quem chama decide
    // entre 404 e 403 (recomendado tratar igual, para não revelar existência).
    const { service } = await build();
    await expect(service.canViewContract(CONTRACT_ID, viewer())).resolves.toBe(
      false,
    );
  });

  it('busca pelas duas colunas de ownership', async () => {
    const { service, prisma } = await build();
    await service.canViewContract(CONTRACT_ID, viewer());

    const [args] = prisma.contracts.findFirst.mock.calls[0] as [
      { where: Prisma.contractsWhereInput },
    ];
    const where = args.where;
    expect(where.id).toBe(CONTRACT_ID);
    expect(where.OR).toEqual([
      { consultant_id: { in: [VIEWER_ID, SUBORDINATE_ID] } },
      { current_collection_agent_id: { in: [VIEWER_ID, SUBORDINATE_ID] } },
    ]);
  });
});

describe('gates de aprovação', () => {
  const APPROVAL_ID = '44444444-4444-4444-4444-444444444444';

  /**
   * Os quatro gates seguem a mesma forma: fail-open sem viewer, bypass por
   * permissão de visão global, e senão um EXISTS na árvore do viewer. Mudam só
   * a tabela consultada e quais permissões dão o bypass.
   *
   * O método é passado como seletor, e não como nome indexado, para o tipo
   * sobreviver ao `describe.each`.
   */
  type GateMethod = (id: string, viewer?: ScopeViewer) => Promise<boolean>;
  type GateTable = 'form_approvals' | 'quote_approvals' | 'quotes';
  type GateCase = [
    name: string,
    pick: (service: ScopeService) => GateMethod,
    table: GateTable,
    bypassPermissions: PermissionKey[],
  ];

  const GATE_CASES: GateCase[] = [
    [
      'canAccessFormApproval',
      (service) => (id, v) => service.canAccessFormApproval(id, v),
      'form_approvals',
      [
        PermissionKey.ROLE_ADMIN,
        PermissionKey.QUOTE_VIEW_ALL,
        PermissionKey.QUOTE_APPROVER,
      ],
    ],
    [
      'canAccessQuoteApproval',
      (service) => (id, v) => service.canAccessQuoteApproval(id, v),
      'quote_approvals',
      [
        PermissionKey.ROLE_ADMIN,
        PermissionKey.QUOTE_VIEW_ALL,
        PermissionKey.QUOTE_APPROVER,
      ],
    ],
    [
      'canAccessFormResponseApprovals',
      (service) => (id, v) => service.canAccessFormResponseApprovals(id, v),
      'form_approvals',
      [PermissionKey.ROLE_ADMIN, PermissionKey.QUOTE_VIEW_ALL],
    ],
    [
      'canAccessQuote',
      (service) => (id, v) => service.canAccessQuote(id, v),
      'quotes',
      [PermissionKey.ROLE_ADMIN, PermissionKey.QUOTE_VIEW_ALL],
    ],
  ];

  describe.each(GATE_CASES)('%s', (_name, pick, table, bypassPermissions) => {
    it('libera sem viewer', async () => {
      const { service, prisma } = await build();

      await expect(pick(service)(APPROVAL_ID)).resolves.toBe(true);
      expect(prisma[table].findFirst).not.toHaveBeenCalled();
    });

    it.each(bypassPermissions)('libera com %s', async (permission) => {
      const { service, prisma } = await build();

      await expect(
        pick(service)(APPROVAL_ID, viewer([permission])),
      ).resolves.toBe(true);
      expect(prisma[table].findFirst).not.toHaveBeenCalled();
    });

    it('nega quem não tem árvore', async () => {
      const { service, prisma } = await build([]);

      await expect(pick(service)(APPROVAL_ID, viewer())).resolves.toBe(false);
      expect(prisma[table].findFirst).not.toHaveBeenCalled();
    });

    it('libera quando a linha está na árvore do viewer', async () => {
      const { service, prisma } = await build();
      prisma[table].findFirst.mockResolvedValue({ id: APPROVAL_ID });

      await expect(pick(service)(APPROVAL_ID, viewer())).resolves.toBe(true);
    });

    it('nega quando a linha não está na árvore', async () => {
      const { service } = await build();

      await expect(pick(service)(APPROVAL_ID, viewer())).resolves.toBe(false);
    });
  });
});
