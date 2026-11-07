import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContractPendingActionsService } from './contract-pending-actions.service';
import {
  ActivityInteractionResult,
  ActivityRecipientType,
} from '../enums/activity.enums';

const clock = {
  evaluated_at: new Date('2026-11-05T12:00:00Z'),
  reference_date: '2026-11-05',
};
const previous = {
  id: 'existing',
  type: 'renegotiation',
  status: 'open',
  due_at: '2026-11-10T12:00:00Z',
  observation: 'Anterior',
};
const input = {
  contractId: 'contract-1',
  interactionId: 'interaction-1',
  userId: 'user-1',
  result: ActivityInteractionResult.RENEGOTIATION,
  recipientType: ActivityRecipientType.CLIENT,
  observation: 'Cliente pediu negociação',
  expectedAgreementDate: '2026-11-10',
};

function setup(
  options: {
    existing?: boolean;
    expired?: boolean;
    config?: string;
    failEvent?: boolean;
    actionType?: 'renegotiation' | 'death_registration';
  } = {},
) {
  const query = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (
      sql.includes('SELECT to_jsonb(a)') &&
      sql.includes('expected_agreement_date <')
    )
      return Promise.resolve(
        options.expired ? [{ snapshot: { ...previous, id: 'expired' } }] : [],
      );
    if (sql.includes('SELECT to_jsonb(a)'))
      return Promise.resolve(options.existing ? [{ snapshot: previous }] : []);
    if (sql.includes('FROM system_configs'))
      return Promise.resolve([{ value: options.config ?? '10' }]);
    if (
      sql.includes('UPDATE contract_pending_actions') &&
      sql.includes("status = 'expired'")
    )
      return Promise.resolve([
        { snapshot: { ...previous, id: 'expired', status: 'expired' } },
      ]);
    if (sql.includes('UPDATE contract_pending_actions'))
      return Promise.resolve([
        { snapshot: { ...previous, observation: input.observation } },
      ]);
    if (sql.includes('INSERT INTO contract_pending_actions'))
      return Promise.resolve([
        {
          snapshot: {
            ...previous,
            id: 'created',
            type: options.actionType ?? previous.type,
            observation: input.observation,
          },
        },
      ]);
    throw new Error('unexpected_query');
  });
  const execute = jest.fn((strings: TemplateStringsArray) => {
    if (
      options.failEvent &&
      strings.join(' ').includes('INSERT INTO contract_pending_action_events')
    )
      throw new Error('event_failed');
    return Promise.resolve(1);
  });
  return {
    service: new ContractPendingActionsService(),
    tx: {
      $queryRaw: query,
      $executeRaw: execute,
    } as unknown as Prisma.TransactionClient,
    query,
    execute,
  };
}

describe('ações pendentes abertas pelo resultado da tarefa', () => {
  it.each(['2026-11-06', '2026-11-15'])(
    'aceita a data prevista %s dentro da janela de negociação',
    (date) => {
      const { service } = setup();
      expect(
        service.validateExpectedAgreementDate(
          ActivityInteractionResult.RENEGOTIATION,
          date,
          clock.reference_date,
        ),
      ).toBe(date);
    },
  );

  it.each([
    undefined,
    '2026-11-05',
    '2026-11-16',
    '2026-02-30',
    '2026-11-10T12:00:00Z',
  ])('recusa previsão ausente ou fora da janela: %s', (date) => {
    const { service } = setup();
    expect(() =>
      service.validateExpectedAgreementDate(
        ActivityInteractionResult.RENEGOTIATION,
        date,
        clock.reference_date,
      ),
    ).toThrow(BadRequestException);
  });

  it('não aceita data de acordo em outros resultados', () => {
    const { service } = setup();
    expect(() =>
      service.validateExpectedAgreementDate(
        ActivityInteractionResult.DISPUTE,
        '2026-11-10',
        clock.reference_date,
      ),
    ).toThrow('expected_agreement_date_unexpected');
  });

  it('cria ação com origem portal, vínculo da interação e evento de criação', async () => {
    const { service, tx, query, execute } = setup();
    await expect(service.openForInteraction(tx, clock, input)).resolves.toEqual(
      { id: 'created', type: 'renegotiation' },
    );
    const insert = query.mock.calls.find(([strings]) =>
      strings.join(' ').includes('INSERT INTO contract_pending_actions'),
    )!;
    expect(insert[0].join(' ')).toContain("'portal'");
    expect(insert[0].join(' ')).toContain('due_at');
    const audit = execute.mock.calls.find(([strings]) =>
      strings.join(' ').includes('INSERT INTO contract_pending_action_events'),
    )!;
    expect(audit).toEqual(
      expect.arrayContaining(['created', 'user-1', 'interaction-1']),
    );
    const cancellation = execute.mock.calls.find(([strings]) =>
      strings.join(' ').includes('UPDATE activity_tasks'),
    )!;
    expect(cancellation[0].join(' ')).toContain("status = 'pending'");
  });

  it('atualizar ação existente preserva due_at e grava os dois snapshots', async () => {
    const { service, tx, query, execute } = setup({ existing: true });
    await service.openForInteraction(tx, clock, input);
    const update = query.mock.calls.find(([strings]) =>
      strings.join(' ').includes('UPDATE contract_pending_actions'),
    )!;
    expect(update[0].join(' ')).not.toContain('due_at');
    expect(
      query.mock.calls.some(([strings]) =>
        strings.join(' ').includes('FROM system_configs'),
      ),
    ).toBe(false);
    const audit = execute.mock.calls[0];
    expect(audit).toEqual(
      expect.arrayContaining(['updated', JSON.stringify(previous)]),
    );
  });

  it.each([
    [ActivityRecipientType.CLIENT, 'Óbito informado durante a cobrança.'],
    [
      ActivityRecipientType.GUARANTOR,
      'Óbito informado para o avalista. Óbito informado durante a cobrança.',
    ],
  ])(
    'abre indicação de óbito para o destinatário %s',
    async (recipientType, observation) => {
      const { service, tx, query, execute } = setup({
        actionType: 'death_registration',
      });
      await expect(
        service.openForInteraction(tx, clock, {
          ...input,
          result: ActivityInteractionResult.DECEASED,
          recipientType,
          observation: undefined,
          expectedAgreementDate: null,
        }),
      ).resolves.toEqual({ id: 'created', type: 'death_registration' });
      const insert = query.mock.calls.find(([strings]) =>
        strings.join(' ').includes('INSERT INTO contract_pending_actions'),
      )!;
      expect(insert).toEqual(
        expect.arrayContaining([
          'death_registration',
          'interaction-1',
          observation,
          null,
        ]),
      );
      const audit = execute.mock.calls.find(([strings]) =>
        strings
          .join(' ')
          .includes('INSERT INTO contract_pending_action_events'),
      )!;
      expect(audit).toEqual(
        expect.arrayContaining(['interaction-1', observation]),
      );
    },
  );

  it('expira a negociação antiga com evento próprio antes de criar uma nova', async () => {
    const { service, tx, execute } = setup({ expired: true });
    await service.openForInteraction(tx, clock, input);
    expect(execute.mock.calls[0]).toEqual(
      expect.arrayContaining(['expired', null]),
    );
    expect(execute.mock.calls[1]).toEqual(
      expect.arrayContaining(['created', 'interaction-1']),
    );
  });

  it.each(['0', '-1', 'invalid'])(
    'recusa configuração de prazo inválida: %s',
    async (config) => {
      const { service, tx, execute } = setup({ config });
      await expect(
        service.openForInteraction(tx, clock, input),
      ).rejects.toThrow(InternalServerErrorException);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('propaga falha no histórico para que a transação inteira seja revertida', async () => {
    const { service, tx, execute } = setup({ failEvent: true });
    await expect(service.openForInteraction(tx, clock, input)).rejects.toThrow(
      'event_failed',
    );
    expect(
      execute.mock.calls.some(([strings]) =>
        strings.join(' ').includes('UPDATE activity_tasks'),
      ),
    ).toBe(false);
  });

  it('resultado comum não abre ação nem faz consultas extras', async () => {
    const { service, tx, query, execute } = setup();
    await expect(
      service.openForInteraction(tx, clock, {
        ...input,
        result: ActivityInteractionResult.NO_RESPONSE,
        expectedAgreementDate: null,
      }),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
