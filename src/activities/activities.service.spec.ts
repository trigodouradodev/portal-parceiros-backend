import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { FollowUpService } from '../follow-up/follow-up.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { Prisma } from '@prisma/client';
import {
  ActivityChannel,
  ActivityInteractionResult,
  ActivityRecipientType,
  ActivityTaskStatus,
  ActivityTaskType,
} from './enums/activity.enums';
import { RegisterInteractionDto } from './dto/register-interaction.dto';
import { LockedTaskRow } from './interfaces/activity-row.interface';

const TASK_ID = 'task-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const SUBORDINATE_USER_ID = 'subordinate-1';

function lockedTask(overrides: Partial<LockedTaskRow> = {}): LockedTaskRow {
  return {
    id: TASK_ID,
    installment_id: 'installment-1',
    installment_number: 3,
    contract_id: 'contract-1',
    task_type: ActivityTaskType.CONTACT,
    status: ActivityTaskStatus.PENDING,
    assigned_to: USER_ID,
    was_postponed: false,
    was_rescheduled: false,
    reschedule_count: 0,
    ...overrides,
  };
}

const ACTION_ROW = {
  id: TASK_ID,
  installment_id: 'installment-1',
  contract_id: 'contract-1',
  segment_code: 'S1',
  task_type: ActivityTaskType.CONTACT,
  status: ActivityTaskStatus.PENDING,
  expire_date: new Date('2026-07-31T00:00:00Z'),
  was_postponed: true,
  was_rescheduled: false,
  reschedule_count: 0,
};

const INTERACTION_ROW = {
  id: 'interaction-1',
  task_id: TASK_ID,
  installment_id: 'installment-1',
  contract_id: 'contract-1',
  task_type: ActivityTaskType.CONTACT,
  channel: ActivityChannel.CALL,
  recipient_type: ActivityRecipientType.CLIENT,
  recipient_contact_id: null,
  result: ActivityInteractionResult.NO_RESPONSE,
  promise_date: null,
  observation: null,
  user_id: USER_ID,
  created_at: new Date('2026-07-30T12:00:00Z'),
};

interface TxOptions {
  /** Linha devolvida pelo SELECT ... FOR UPDATE. `null` simula tarefa inexistente. */
  task?: LockedTaskRow | null;
  /**
   * Simula o resultado de `assertIsActiveTask` (AUREA-319: checa segmento, não
   * mais o id exato). `TASK_ID` simula "a tarefa pertence ao segmento ativo do
   * usuário" (query devolve 1 linha); qualquer outro valor, incluindo `null`,
   * simula "não pertence"/"sem tarefa ativa" (query devolve vazio).
   */
  activeTaskId?: string | null;
  /** Resposta do Postgres para as checagens de janela de data. */
  windowOk?: boolean;
}

/**
 * `$queryRaw` do tx é roteado pelo conteúdo do SQL, não pela ordem das chamadas
 * — os comandos disparam de 2 a 5 queries e a ordem muda por caminho.
 *
 * O que estes specs cobrem é a lógica de decisão em TypeScript: a cadeia de
 * guards, as validações de canal/resultado e a ordem em que elas rodam. O
 * `FOR UPDATE`, a ordenação por prioridade da fila e as janelas de data (que
 * chegam como booleano pronto do Postgres) não são exercitados de verdade aqui.
 */
function createTx(options: TxOptions = {}) {
  const {
    task = lockedTask(),
    activeTaskId = TASK_ID,
    windowOk = true,
  } = options;

  return {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('FOR UPDATE')) {
        return Promise.resolve(task ? [task] : []);
      }
      if (sql.includes('activity_ruler_stages')) {
        // assertIsActiveTask agora verifica pertencimento ao segmento ativo
        // (retorna alguma linha) em vez de comparar contra um id específico.
        return Promise.resolve(
          activeTaskId === TASK_ID ? [{ id: TASK_ID }] : [],
        );
      }
      if (sql.includes('BETWEEN CURRENT_DATE')) {
        return Promise.resolve([{ ok: windowOk }]);
      }
      if (sql.includes('UPDATE activity_tasks')) {
        return Promise.resolve([ACTION_ROW]);
      }
      if (sql.includes('INSERT INTO activity_interactions')) {
        return Promise.resolve([INTERACTION_ROW]);
      }
      throw new Error(`query não mapeada no mock: ${sql}`);
    }),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

type Tx = ReturnType<typeof createTx>;

async function build(options: TxOptions = {}): Promise<{
  service: ActivitiesService;
  tx: Tx;
  followUpService: { createWithinTransaction: jest.Mock };
}> {
  const tx = createTx(options);
  const followUpService = { createWithinTransaction: jest.fn() };
  const prisma = {
    $transaction: jest.fn((fn: (client: Tx) => unknown) => fn(tx)),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ActivitiesService,
      { provide: PrismaService, useValue: prisma },
      { provide: ScopeService, useValue: {} },
      { provide: FollowUpService, useValue: followUpService },
    ],
  }).compile();
  return { service: module.get(ActivitiesService), tx, followUpService };
}

async function buildQueue(
  scopeClause: Prisma.Sql | null,
  scopeUserIds = [USER_ID, SUBORDINATE_USER_ID],
) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    trigo_users: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const scope = {
    buildContractScopeSql: jest.fn().mockResolvedValue(scopeClause),
    getViewerScopeIds: jest.fn().mockResolvedValue({ userIds: scopeUserIds }),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ActivitiesService,
      { provide: PrismaService, useValue: prisma },
      { provide: ScopeService, useValue: scope },
      { provide: FollowUpService, useValue: {} },
    ],
  }).compile();
  return { service: module.get(ActivitiesService), prisma, scope };
}

async function buildInstallmentAccess(canView: boolean) {
  const prisma = {
    installments: {
      findUnique: jest.fn().mockResolvedValue({ contract_id: 'contract-1' }),
    },
  };
  const scope = { canViewContract: jest.fn().mockResolvedValue(canView) };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ActivitiesService,
      { provide: PrismaService, useValue: prisma },
      { provide: ScopeService, useValue: scope },
      { provide: FollowUpService, useValue: {} },
    ],
  }).compile();
  return { service: module.get(ActivitiesService), prisma, scope };
}

describe('getInstallmentDetail — escopo', () => {
  const viewer = {
    userId: USER_ID,
    permissions: [PermissionKey.INSTALLMENT_VIEW],
  };

  it('usa o escopo hierárquico e preserva 404 fora dele', async () => {
    const { service, scope } = await buildInstallmentAccess(false);

    await expect(
      service.getInstallmentDetail('installment-1', viewer),
    ).rejects.toThrow(NotFoundException);

    expect(scope.canViewContract).toHaveBeenCalledWith('contract-1', viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
      PermissionKey.ROLE_BACKOFFICE,
    ]);
  });
});

describe('getTodayQueue', () => {
  const viewer = {
    userId: USER_ID,
    permissions: [PermissionKey.INSTALLMENT_VIEW],
  };

  it('sem filtro retorna apenas a fila do próprio usuário', async () => {
    const { service, prisma, scope } = await buildQueue(Prisma.sql`TRUE`);

    await expect(service.getTodayQueue(viewer)).resolves.toMatchObject({
      active: null,
      counter: 0,
      locked: { pagination: { total: 0 } },
    });

    expect(scope.buildContractScopeSql).toHaveBeenCalledWith(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
      PermissionKey.ROLE_BACKOFFICE,
    ]);
    expect(scope.getViewerScopeIds).toHaveBeenCalledWith(USER_ID);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(6);
    expect(prisma.$queryRaw.mock.calls[0]).toContainEqual(
      expect.objectContaining({ values: [USER_ID, USER_ID] }),
    );
    for (const [, ...values] of prisma.$queryRaw.mock.calls.slice(1)) {
      expect(values).toContainEqual(
        expect.objectContaining({ values: [USER_ID] }),
      );
    }
  });

  it('devolve uma fila vazia sem consultar atividades quando não há escopo', async () => {
    const { service, prisma } = await buildQueue(null);

    await expect(service.getTodayQueue(viewer, 2, 10)).resolves.toEqual({
      active: null,
      counter: 0,
      segments: [],
      locked: {
        items: [],
        pagination: {
          page: 2,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      },
      scheduled: [],
      completedToday: [],
    });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('aceita filtrar por um subordinado e aplica o filtro a todas as listas', async () => {
    const { service, prisma, scope } = await buildQueue(Prisma.sql`TRUE`);

    await service.getTodayQueue(viewer, 1, 30, SUBORDINATE_USER_ID);

    expect(scope.getViewerScopeIds).toHaveBeenCalledWith(USER_ID);
    // Não há card ativo do viewer quando a fila foi filtrada para subordinado.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
    for (const [, ...values] of prisma.$queryRaw.mock.calls) {
      expect(values).toContainEqual(
        expect.objectContaining({ values: [SUBORDINATE_USER_ID] }),
      );
    }
  });

  it('rejeita filtro para usuário fora da hierarquia antes de consultar atividades', async () => {
    const { service, prisma } = await buildQueue(Prisma.sql`TRUE`);

    await expect(
      service.getTodayQueue(viewer, 1, 30, OTHER_USER_ID),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('getSubordinates', () => {
  const viewer = {
    userId: USER_ID,
    permissions: [PermissionKey.INSTALLMENT_VIEW],
  };

  it('devolve a subárvore sem incluir o próprio usuário', async () => {
    const { service, prisma } = await buildQueue(Prisma.sql`TRUE`);
    prisma.trigo_users.findMany.mockResolvedValue([
      { id: SUBORDINATE_USER_ID, full_name: 'Ana Subordinada' },
    ]);

    await expect(service.getSubordinates(viewer)).resolves.toEqual([
      { id: SUBORDINATE_USER_ID, name: 'Ana Subordinada' },
    ]);
    expect(prisma.trigo_users.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [SUBORDINATE_USER_ID] },
        is_deleted: false,
      },
      select: { id: true, full_name: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
  });

  it('não consulta usuários quando a hierarquia não tem subordinados', async () => {
    const { service, prisma } = await buildQueue(Prisma.sql`TRUE`, [USER_ID]);

    await expect(service.getSubordinates(viewer)).resolves.toEqual([]);
    expect(prisma.trigo_users.findMany).not.toHaveBeenCalled();
  });

  it('devolve parceiros habilitados no rollout para ROLE_ADMIN', async () => {
    const { service, prisma } = await buildQueue(Prisma.sql`TRUE`);
    prisma.trigo_users.findMany.mockResolvedValue([
      { id: SUBORDINATE_USER_ID, full_name: 'Ana do Rollout' },
    ]);

    await expect(
      service.getSubordinates({
        userId: USER_ID,
        permissions: [PermissionKey.ROLE_ADMIN],
      }),
    ).resolves.toEqual([{ id: SUBORDINATE_USER_ID, name: 'Ana do Rollout' }]);

    expect(prisma.trigo_users.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('fila de acompanhamento do rollout', () => {
  const observer = {
    userId: USER_ID,
    permissions: [PermissionKey.ROLE_BACKOFFICE],
  };

  it('não devolve atividades próprias para admin ou backoffice sem filtro', async () => {
    const { service, prisma, scope } = await buildQueue(Prisma.sql`TRUE`);

    await expect(service.getTodayQueue(observer)).resolves.toMatchObject({
      active: null,
      counter: 0,
      locked: { items: [] },
    });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(scope.buildContractScopeSql).not.toHaveBeenCalled();
  });

  it('aceita acompanhar um parceiro habilitado no rollout', async () => {
    const { service, prisma } = await buildQueue(Prisma.sql`TRUE`);
    prisma.trigo_users.findMany.mockResolvedValue([
      { id: SUBORDINATE_USER_ID, full_name: 'Ana do Rollout' },
    ]);

    await service.getTodayQueue(observer, 1, 30, SUBORDINATE_USER_ID);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
  });

  it('rejeita acompanhar quem não está habilitado no rollout', async () => {
    const { service, prisma } = await buildQueue(Prisma.sql`TRUE`);

    await expect(
      service.getTodayQueue(observer, 1, 30, OTHER_USER_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

function interactionDto(
  overrides: Partial<RegisterInteractionDto> = {},
): RegisterInteractionDto {
  return {
    channel: ActivityChannel.CALL,
    recipientType: ActivityRecipientType.CLIENT,
    result: ActivityInteractionResult.NO_RESPONSE,
    ...overrides,
  };
}

/**
 * Os três comandos compartilham o preâmbulo `loadActiveTaskForAction`, então a
 * cadeia de guards é verificada uma vez por comando, tabelada.
 */
describe.each([
  [
    'postpone',
    (service: ActivitiesService) => service.postpone(TASK_ID, USER_ID),
  ],
  [
    'reschedule',
    (service: ActivitiesService) =>
      service.reschedule(TASK_ID, USER_ID, { date: '2026-08-03' }),
  ],
  [
    'registerInteraction',
    (service: ActivitiesService) =>
      service.registerInteraction(TASK_ID, USER_ID, interactionDto()),
  ],
])('%s — cadeia de guards', (_name, run) => {
  it('404 quando a tarefa não existe', async () => {
    const { service } = await build({ task: null });
    await expect(run(service)).rejects.toThrow(NotFoundException);
  });

  it('409 quando a tarefa não está pendente', async () => {
    const { service } = await build({
      task: lockedTask({ status: ActivityTaskStatus.COMPLETED }),
    });
    await expect(run(service)).rejects.toThrow(ConflictException);
  });

  it('403 quando a tarefa é de outro usuário', async () => {
    const { service } = await build({
      task: lockedTask({ assigned_to: OTHER_USER_ID }),
    });
    await expect(run(service)).rejects.toThrow(ForbiddenException);
  });

  it('409 quando a tarefa não pertence ao segmento ativo do usuário', async () => {
    // AUREA-319: a trava é por segmento (não mais por id exato) — mas ainda é
    // do backend, não da tela.
    const { service } = await build({ activeTaskId: 'outra-task' });
    await expect(run(service)).rejects.toThrow(ConflictException);
  });

  it('409 quando o usuário não tem nenhuma tarefa ativa', async () => {
    const { service } = await build({ activeTaskId: null });
    await expect(run(service)).rejects.toThrow(ConflictException);
  });
});

describe('assertIsActiveTask — SQL final não deve aceitar tarefa postergada (AUREA-330)', () => {
  it('repete o filtro de expire_date do líder também no SELECT que valida a tarefa alvo', async () => {
    // Bug real (AUREA-330): a CTE `leader` já excluía tarefas postergadas
    // (expire_date no futuro) ao calcular o segmento ativo, mas o SELECT
    // final — que decide se a tarefa alvo pode ser executada — só checava
    // segment_code + status = 'pending', sem repetir `expire_date <=
    // CURRENT_DATE`. Resultado: uma tarefa que o usuário tinha acabado de
    // postergar (status continua 'pending') passava o guard se seu segmento
    // coincidisse com o do líder, permitindo registrar a ação via
    // ContractDetailPage mesmo aparecendo bloqueada na fila.
    const { service, tx } = await build();
    await service.postpone(TASK_ID, USER_ID);

    const guardCall = tx.$queryRaw.mock.calls.find(([strings]) =>
      strings.join(' ').includes('activity_ruler_stages'),
    );
    if (!guardCall) {
      throw new Error('Query de validação da tarefa ativa não foi executada');
    }

    const [strings] = guardCall;
    const sql = strings.join(' ');
    const [, afterLeaderJoin] = sql.split('JOIN leader');
    expect(afterLeaderJoin).toContain('expire_date <= CURRENT_DATE');
  });
});

describe('postpone', () => {
  it('posterga a tarefa e devolve a linha atualizada', async () => {
    const { service } = await build();
    const result = await service.postpone(TASK_ID, USER_ID);

    expect(result.id).toBe(TASK_ID);
    expect(result.wasPostponed).toBe(true);
  });

  it('409 quando a tarefa já foi postergada — é 1× por tarefa', async () => {
    const { service } = await build({
      task: lockedTask({ was_postponed: true }),
    });
    await expect(service.postpone(TASK_ID, USER_ID)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('reschedule', () => {
  const VISIT = lockedTask({ task_type: ActivityTaskType.VISIT });

  it('reagenda uma visita dentro da janela', async () => {
    const { service } = await build({ task: VISIT });
    await expect(
      service.reschedule(TASK_ID, USER_ID, { date: '2026-08-03' }),
    ).resolves.toMatchObject({ id: TASK_ID });
  });

  it('400 quando a tarefa não é de visita', async () => {
    const { service } = await build({
      task: lockedTask({ task_type: ActivityTaskType.CONTACT }),
    });
    await expect(
      service.reschedule(TASK_ID, USER_ID, { date: '2026-08-03' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('permite o segundo reagendamento da visita e incrementa o contador', async () => {
    const { service, tx } = await build({
      task: lockedTask({
        task_type: ActivityTaskType.VISIT,
        was_rescheduled: true,
        reschedule_count: 1,
      }),
    });
    await expect(
      service.reschedule(TASK_ID, USER_ID, { date: '2026-08-03' }),
    ).resolves.toMatchObject({ id: TASK_ID });

    const updateCall = tx.$queryRaw.mock.calls.find(
      ([strings]: [TemplateStringsArray]) =>
        strings.join(' ').includes('UPDATE activity_tasks'),
    );
    expect(updateCall![0].join(' ')).toContain(
      'reschedule_count = reschedule_count + 1',
    );
  });

  it('409 quando a visita já foi reagendada duas vezes', async () => {
    const { service } = await build({
      task: lockedTask({
        task_type: ActivityTaskType.VISIT,
        was_rescheduled: true,
        reschedule_count: 2,
      }),
    });
    await expect(
      service.reschedule(TASK_ID, USER_ID, { date: '2026-08-03' }),
    ).rejects.toThrow(ConflictException);
  });

  it('400 quando a data cai fora da janela aceita pelo banco', async () => {
    const { service } = await build({ task: VISIT, windowOk: false });
    await expect(
      service.reschedule(TASK_ID, USER_ID, { date: '2026-09-30' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita tipo inválido antes de consultar a janela de data', async () => {
    // Ordem importa: validar o tipo primeiro evita uma ida ao banco inútil.
    const { service, tx } = await build({
      task: lockedTask({ task_type: ActivityTaskType.CONTACT }),
    });

    await expect(
      service.reschedule(TASK_ID, USER_ID, { date: '2026-08-03' }),
    ).rejects.toThrow(BadRequestException);

    const consultouJanela = tx.$queryRaw.mock.calls.some(
      ([strings]: [TemplateStringsArray]) =>
        strings.join(' ').includes('BETWEEN CURRENT_DATE'),
    );
    expect(consultouJanela).toBe(false);
  });
});

describe('registerInteraction', () => {
  it('conclui a tarefa e grava a interação', async () => {
    const { service, tx, followUpService } = await build();
    const { interaction } = await service.registerInteraction(
      TASK_ID,
      USER_ID,
      interactionDto(),
    );

    expect(interaction.id).toBe('interaction-1');
    // A conclusão da tarefa é um $executeRaw separado do INSERT da interação.
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(followUpService.createWithinTransaction).toHaveBeenCalledWith(
      tx,
      USER_ID,
      expect.objectContaining({
        contractId: 'contract-1',
        installmentNumber: 3,
        followUpType: 'call',
        party: 'client',
        expectedResult: 'no_return',
      }) as unknown,
    );
  });

  it.each([
    [
      'sem previsão',
      lockedTask(),
      interactionDto({ result: ActivityInteractionResult.NO_FORECAST }),
      'no_forecast',
    ],
    [
      'visita sem localizar o destinatário',
      lockedTask({ task_type: ActivityTaskType.VISIT }),
      interactionDto({
        channel: ActivityChannel.VISIT,
        result: ActivityInteractionResult.NOT_LOCATED,
      }),
      'not_located',
    ],
    [
      'promessa de pagamento',
      lockedTask(),
      interactionDto({
        result: ActivityInteractionResult.PAYMENT_PROMISE,
        promiseDate: '2026-08-05',
      }),
      'will_pay_on_date',
    ],
  ])(
    'mapeia %s para o resultado do follow-up',
    async (_description, task, dto, expectedResult) => {
      const { service, followUpService } = await build({ task });

      await service.registerInteraction(TASK_ID, USER_ID, dto);

      expect(followUpService.createWithinTransaction).toHaveBeenCalledWith(
        expect.anything(),
        USER_ID,
        expect.objectContaining({ expectedResult }) as unknown,
      );
    },
  );

  describe('canal e resultado válidos por tipo de tarefa', () => {
    it('aceita whatsapp em tarefa de contato', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({ channel: ActivityChannel.WHATSAPP }),
        ),
      ).resolves.toBeDefined();
    });

    it('400 para canal de visita em tarefa de contato', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({ channel: ActivityChannel.VISIT }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 para canal de contato em tarefa de visita', async () => {
      const { service } = await build({
        task: lockedTask({ task_type: ActivityTaskType.VISIT }),
      });
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            channel: ActivityChannel.CALL,
            result: ActivityInteractionResult.NOT_LOCATED,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 para not_located em tarefa de contato — é resultado exclusivo de visita', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({ result: ActivityInteractionResult.NOT_LOCATED }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 para no_response em tarefa de visita — é resultado exclusivo de contato', async () => {
      const { service } = await build({
        task: lockedTask({ task_type: ActivityTaskType.VISIT }),
      });
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            channel: ActivityChannel.VISIT,
            result: ActivityInteractionResult.NO_RESPONSE,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('observação obrigatória em "outro"', () => {
    it('400 quando result=other vem sem observação', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({ result: ActivityInteractionResult.OTHER }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 quando a observação é só espaço em branco', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            result: ActivityInteractionResult.OTHER,
            observation: '   ',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita result=other com observação preenchida', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            result: ActivityInteractionResult.OTHER,
            observation: 'cliente mudou de endereço',
          }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('promessa de pagamento', () => {
    it('400 quando payment_promise vem sem data', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            result: ActivityInteractionResult.PAYMENT_PROMISE,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('400 quando a data da promessa cai fora da janela aceita pelo banco', async () => {
      const { service } = await build({ windowOk: false });
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            result: ActivityInteractionResult.PAYMENT_PROMISE,
            promiseDate: '2026-12-31',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita payment_promise com data dentro da janela', async () => {
      const { service } = await build();
      await expect(
        service.registerInteraction(
          TASK_ID,
          USER_ID,
          interactionDto({
            result: ActivityInteractionResult.PAYMENT_PROMISE,
            promiseDate: '2026-08-05',
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('não exige data nem consulta a janela para outros resultados', async () => {
      const { service, tx } = await build();
      await service.registerInteraction(TASK_ID, USER_ID, interactionDto());

      const consultouJanela = tx.$queryRaw.mock.calls.some(
        ([strings]: [TemplateStringsArray]) =>
          strings.join(' ').includes('BETWEEN CURRENT_DATE'),
      );
      expect(consultouJanela).toBe(false);
    });
  });

  describe('geolocalização', () => {
    it('grava e ecoa a coordenada quando latitude e longitude vêm juntas', async () => {
      const { service } = await build();
      const { interaction } = await service.registerInteraction(
        TASK_ID,
        USER_ID,
        interactionDto({ latitude: -23.56321, longitude: -46.65412 }),
      );

      expect(interaction.geolocation).toEqual({
        latitude: -23.56321,
        longitude: -46.65412,
      });
    });

    it('não grava geolocalização quando as coordenadas não vêm', async () => {
      const { service, tx } = await build();
      const { interaction } = await service.registerInteraction(
        TASK_ID,
        USER_ID,
        interactionDto(),
      );

      expect(interaction.geolocation).toBeUndefined();
      // Só o UPDATE de conclusão da tarefa, sem o INSERT em geolocations.
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('ignora coordenada pela metade — latitude sem longitude não grava nada', async () => {
      const { service, tx } = await build();
      const { interaction } = await service.registerInteraction(
        TASK_ID,
        USER_ID,
        interactionDto({ latitude: -23.56321 }),
      );

      expect(interaction.geolocation).toBeUndefined();
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
