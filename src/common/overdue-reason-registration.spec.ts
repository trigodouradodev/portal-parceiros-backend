import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivitiesController } from '../activities/activities.controller';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityCollectionGuard } from '../activities/activity-collection.guard';
import { ContractPendingActionsService } from '../activities/pending-actions/contract-pending-actions.service';
import { RegisterInteractionDto } from '../activities/dto/register-interaction.dto';
import { FollowUpController } from '../follow-up/follow-up.controller';
import { FollowUpService } from '../follow-up/follow-up.service';
import { CreateFollowUpDto } from '../follow-up/dto/create-follow-up.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope/scope.service';
import { PeopleScopeService } from '../scope/people-scope.service';
import { OverdueReason } from './overdue-reason.enum';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const INSTANT = new Date('2026-11-10T14:00:00Z');
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

// Só o PostgreSQL é substituído: controllers, serviços, validações, guardas,
// mappers e criação do Follow-up automático percorrem o código real.
async function build(taskType: 'contact' | 'visit' = 'contact') {
  const tx = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join(' ');
        if (sql.includes('FOR UPDATE OF c'))
          return Promise.resolve([{ id: CONTRACT_ID }]);
        if (sql.includes('FOR UPDATE OF i')) return Promise.resolve([]);
        if (sql.includes('FOR UPDATE OF at'))
          return Promise.resolve([
            {
              id: TASK_ID,
              installment_id: 'installment-1',
              installment_number: 3,
              contract_id: CONTRACT_ID,
              task_type: taskType,
              status: 'pending',
              assigned_to: USER_ID,
              expire_date: '2026-11-10',
              was_postponed: false,
              was_rescheduled: false,
              reschedule_count: 0,
            },
          ]);
        if (sql.includes('WITH execution_clock'))
          return Promise.resolve([
            {
              evaluated_at: INSTANT,
              reference_date: '2026-11-10',
              contract_status: 'disbursed',
              uses_celcoin_integration: true,
              current_assigned_to: USER_ID,
              has_activity_gate_permission: true,
              has_open_pending_action: false,
              client_is_deceased: false,
              has_living_guarantor: true,
              reference_installment_id: 'installment-1',
              reference_due_date: '2026-11-03',
              days_overdue: 7,
              overdue_installment_count: 2,
              collection_blocked: false,
              follow_up_completed: false,
              last_result: null,
              last_channel: null,
              last_execution_date: null,
              last_days_overdue: null,
              promise_date: null,
            },
          ]);
        if (sql.includes('activity_ruler_stages'))
          return Promise.resolve([{ id: TASK_ID }]);
        if (sql.includes('INSERT INTO activity_interactions')) {
          const columns = sql
            .match(/INSERT INTO activity_interactions\s*\(([^)]+)\)/)![1]
            .split(',')
            .map((column) => column.trim());
          return Promise.resolve([
            {
              id: 'interaction-1',
              ...Object.fromEntries(
                columns.map((column, index) => [column, values[index]]),
              ),
            },
          ]);
        }
        if (
          sql.includes(
            'SELECT to_jsonb(a) AS snapshot FROM contract_pending_actions',
          )
        )
          return Promise.resolve([]);
        if (sql.includes('SELECT value FROM system_configs'))
          return Promise.resolve([{ value: '3' }]);
        if (sql.includes('INSERT INTO contract_pending_actions'))
          return Promise.resolve([
            {
              snapshot: {
                id: 'action-1',
                contract_id: CONTRACT_ID,
                type: 'renegotiation',
                status: 'open',
              },
            },
          ]);
        if (sql.includes('::date BETWEEN'))
          return Promise.resolve([{ ok: true }]);
        throw new Error(`Query inesperada: ${sql}`);
      },
    ),
    $executeRaw: jest.fn().mockResolvedValue(1),
    installment_followups: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'followup-1', ...data }),
      ),
    },
    geolocations: { create: jest.fn() },
  };
  const prisma = {
    contracts: { findUnique: jest.fn().mockResolvedValue({ id: CONTRACT_ID }) },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const module = await Test.createTestingModule({
    controllers: [ActivitiesController, FollowUpController],
    providers: [
      ActivitiesService,
      FollowUpService,
      ActivityCollectionGuard,
      ContractPendingActionsService,
      ScopeService,
      PeopleScopeService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return {
    activity: module.get(ActivitiesController),
    followup: module.get(FollowUpController),
    tx,
    prisma,
  };
}

async function interaction(
  app: Awaited<ReturnType<typeof build>>,
  body: Record<string, unknown>,
) {
  const dto: unknown = await pipe.transform(body, {
    type: 'body',
    metatype: RegisterInteractionDto,
  });
  return app.activity.registerInteraction(
    USER_ID,
    TASK_ID,
    dto as RegisterInteractionDto,
  );
}

async function followup(
  app: Awaited<ReturnType<typeof build>>,
  body: Record<string, unknown>,
) {
  const dto: unknown = await pipe.transform(
    { contractId: CONTRACT_ID, ...body },
    { type: 'body', metatype: CreateFollowUpDto },
  );
  return app.followup.create(USER_ID, dto as CreateFollowUpDto);
}

describe.each(['contact', 'visit'] as const)(
  'Sem previsão em tarefa de %s',
  (taskType) => {
    const base = {
      channel: taskType === 'visit' ? 'visit' : 'call',
      recipientType: 'guarantor',
      result: 'no_forecast',
    };

    it.each(Object.values(OverdueReason))(
      'persiste %s na interação e no Follow-up da mesma transação',
      async (reason) => {
        const app = await build(taskType);
        const result = await interaction(app, {
          ...base,
          overdueReason: reason,
        });
        expect(result.interaction.overdueReason).toBe(reason);
        expect(result.interaction.result).toBe('no_forecast');
        expect(result.pendingAction).toBeUndefined();
        expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(app.tx.installment_followups.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            overdue_reason: reason,
            expected_result: 'no_forecast',
            party: 'guarantor',
          }) as unknown,
        });
        // O único execute é a conclusão da tarefa, inclusive nas categorias
        // Contrato não cedido e Vítima de golpe/fraude.
        expect(app.tx.$executeRaw).toHaveBeenCalledTimes(1);
        const insert = app.tx.$queryRaw.mock.calls.find(([strings]) =>
          strings.join(' ').includes('INSERT INTO activity_interactions'),
        )!;
        expect(insert.slice(-4)[0]).toBe(2);
      },
    );

    it.each([
      undefined,
      null,
      '',
      ' ',
      'unknown',
      'death',
      'Endividamento',
      1,
      ['other'],
      {},
    ])(
      'recusa motivo inválido (%j) antes de concluir a tarefa',
      async (reason) => {
        const app = await build(taskType);
        await expect(
          interaction(app, { ...base, overdueReason: reason }),
        ).rejects.toThrow(BadRequestException);
        expect(app.tx.$executeRaw).not.toHaveBeenCalled();
        expect(app.tx.installment_followups.create).not.toHaveBeenCalled();
      },
    );

    it('recusa motivo em outro resultado', async () => {
      const app = await build(taskType);
      await expect(
        interaction(app, {
          ...base,
          result: 'other',
          observation: 'Observação',
          overdueReason: 'other',
        }),
      ).rejects.toThrow('overdue_reason_not_allowed');
      expect(app.tx.$executeRaw).not.toHaveBeenCalled();
    });
  },
);

describe.each(['estruturado', 'legado'] as const)(
  'Sem previsão em Follow-up %s',
  (model) => {
    const base =
      model === 'estruturado'
        ? {
            followUpType: 'message',
            party: 'client',
            expectedResult: 'no_forecast',
          }
        : { status: 'no_forecast' };

    it.each(Object.values(OverdueReason))(
      'salva %s como classificação, sem exigir observação adicional',
      async (reason) => {
        const app = await build();
        await followup(app, { ...base, overdueReason: reason });
        expect(app.tx.installment_followups.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            overdue_reason: reason,
            note: null,
            status:
              model === 'estruturado' ? 'whatsapp_message' : 'no_forecast',
          }) as unknown,
        });
        expect(app.tx.$executeRaw).not.toHaveBeenCalled();
        expect(app.tx.$queryRaw).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, null, '', ' ', 'unknown', 'death', 1, ['other'], {}])(
      'recusa motivo inválido (%j) sem gravar',
      async (reason) => {
        const app = await build();
        await expect(
          followup(app, { ...base, overdueReason: reason }),
        ).rejects.toThrow(BadRequestException);
        expect(app.tx.installment_followups.create).not.toHaveBeenCalled();
        expect(app.prisma.$transaction).not.toHaveBeenCalled();
      },
    );
  },
);

it('o resultado esperado prevalece sobre o status legado no Follow-up', async () => {
  const app = await build();
  await expect(
    followup(app, {
      status: 'no_forecast',
      expectedResult: 'other',
      overdueReason: 'other',
    }),
  ).rejects.toThrow('overdue_reason_not_allowed');
  expect(app.tx.installment_followups.create).not.toHaveBeenCalled();
});

it('a falha ao gravar o Follow-up rejeita a transação da execução', async () => {
  const app = await build();
  app.tx.installment_followups.create.mockRejectedValueOnce(
    new Error('database write failed'),
  );
  await expect(
    interaction(app, {
      channel: 'call',
      recipientType: 'client',
      result: 'no_forecast',
      overdueReason: 'other',
    }),
  ).rejects.toThrow('database write failed');
  expect(app.prisma.$transaction).toHaveBeenCalledTimes(1);
});

describe.each(['contact', 'visit'] as const)(
  'Motivo do atraso em %s',
  (taskType) => {
    const results = [
      taskType === 'contact' ? 'no_response' : 'not_located',
      'payment_promise',
      'dispute',
      'renegotiation',
      'no_forecast',
    ];
    it.each(results)(
      'exige motivo para %s e preserva as datas',
      async (result) => {
        const app = await build(taskType);
        const body = {
          channel: taskType === 'visit' ? 'visit' : 'call',
          recipientType: 'client',
          result,
          ...(result === 'payment_promise'
            ? { promiseDate: '2026-11-15' }
            : {}),
          ...(result === 'renegotiation'
            ? { expectedAgreementDate: '2026-11-15' }
            : {}),
        };
        await expect(interaction(app, body)).rejects.toThrow(
          'overdue_reason_required',
        );
        expect(app.tx.installment_followups.create).not.toHaveBeenCalled();
        const saved = await interaction(app, {
          ...body,
          overdueReason: 'other',
        });
        expect(saved.interaction.overdueReason).toBe('other');
        expect(app.tx.installment_followups.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ overdue_reason: 'other' }) as unknown,
        });
      },
    );
  },
);
it.each([
  'will_pay_on_date',
  'no_return',
  'requested_extension',
  'dispute',
  'wants_renegotiation',
  'not_located',
])('Follow-up %s exige motivo', async (expectedResult) => {
  const app = await build();
  const body = {
    followUpType: 'call',
    party: 'client',
    expectedResult,
    paymentForecast: '2026-11-15',
  };
  await expect(followup(app, body)).rejects.toThrow('overdue_reason_required');
  await followup(app, { ...body, overdueReason: 'other' });
  expect(app.tx.installment_followups.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ overdue_reason: 'other' }) as unknown,
  });
});
it.each(['deceased', 'other'])(
  'Follow-up %s não exige motivo',
  async (expectedResult) => {
    const app = await build();
    await followup(app, {
      followUpType: 'call',
      party: 'client',
      expectedResult,
    });
    expect(app.tx.installment_followups.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ overdue_reason: null }) as unknown,
    });
  },
);
