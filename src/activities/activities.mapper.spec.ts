import { Prisma } from '@prisma/client';
import {
  mapAddress,
  mapCard,
  mapGuarantor,
  mapInteraction,
  mapTaskAction,
} from './activities.mapper';
import {
  InteractionRow,
  QueueRow,
  RawAddress,
  TaskActionRow,
} from './interfaces/activity-row.interface';

function interactionRow(
  overrides: Partial<InteractionRow> = {},
): InteractionRow {
  return {
    id: 'interaction-1',
    task_id: 'task-1',
    installment_id: 'installment-1',
    contract_id: 'contract-1',
    task_type: 'call',
    channel: 'phone',
    recipient_type: 'client',
    recipient_contact_id: 'contact-1',
    result: 'promise_to_pay',
    promise_date: new Date('2026-08-10T00:00:00Z'),
    observation: 'cliente pediu prazo',
    user_id: 'user-1',
    created_at: new Date('2026-07-30T12:00:00Z'),
    ...overrides,
  };
}

function queueRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    task_id: 'task-1',
    segment_code: 'S1',
    task_type: 'call',
    status: 'pending',
    is_active: true,
    assigned_to_id: 'user-1',
    assigned_to_name: 'Maria Souza',
    expire_date: new Date('2026-08-01T00:00:00Z'),
    was_postponed: false,
    was_rescheduled: false,
    reschedule_count: 0,
    priority: 3,
    tone: 'firm',
    installment_id: 'installment-1',
    installment_number: 2,
    due_date: new Date('2026-07-25T00:00:00Z'),
    days_overdue: 5,
    pending_amount: '1250.50',
    total_amount: '1500.00',
    contract_id: 'contract-1',
    contract_number: 'CT-001',
    total_installments: 12,
    company_name: 'Trigo Dourado',
    client_name: 'João Silva',
    client_tax_id: '12345678909',
    client_phone: '11987654321',
    last_result: 'no_answer',
    last_channel: 'phone',
    last_created_at: new Date('2026-07-28T09:00:00Z'),
    ...overrides,
  };
}

function addressRow(overrides: Partial<RawAddress> = {}): RawAddress {
  return {
    street: 'R. das Flores',
    number: '123',
    complement: 'apto 4',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zip_code: '01001000',
    ...overrides,
  };
}

describe('mapInteraction', () => {
  it('converte a linha do INSERT no DTO de resposta', () => {
    expect(mapInteraction(interactionRow())).toEqual({
      id: 'interaction-1',
      taskId: 'task-1',
      installmentId: 'installment-1',
      contractId: 'contract-1',
      taskType: 'call',
      channel: 'phone',
      recipientType: 'client',
      recipientContactId: 'contact-1',
      result: 'promise_to_pay',
      promiseDate: new Date('2026-08-10T00:00:00Z'),
      observation: 'cliente pediu prazo',
      userId: 'user-1',
      createdAt: new Date('2026-07-30T12:00:00Z'),
    });
  });

  it('traduz os nulos do banco para undefined, que somem do JSON', () => {
    const result = mapInteraction(
      interactionRow({
        recipient_contact_id: null,
        promise_date: null,
        observation: null,
      }),
    );

    expect(result.recipientContactId).toBeUndefined();
    expect(result.promiseDate).toBeUndefined();
    expect(result.observation).toBeUndefined();
  });
});

describe('mapTaskAction', () => {
  it('converte a linha da ação de tarefa', () => {
    const row: TaskActionRow = {
      id: 'task-1',
      installment_id: 'installment-1',
      contract_id: 'contract-1',
      segment_code: 'S1',
      task_type: 'call',
      status: 'postponed',
      expire_date: new Date('2026-08-02T00:00:00Z'),
      was_postponed: true,
      was_rescheduled: false,
      reschedule_count: 0,
    };

    expect(mapTaskAction(row)).toEqual({
      id: 'task-1',
      installmentId: 'installment-1',
      contractId: 'contract-1',
      segmentCode: 'S1',
      taskType: 'call',
      status: 'postponed',
      expireDate: new Date('2026-08-02T00:00:00Z'),
      wasPostponed: true,
      wasRescheduled: false,
      rescheduleCount: 0,
    });
  });
});

describe('mapCard', () => {
  it('monta o card completo da fila', () => {
    const card = mapCard(queueRow(), 1);

    expect(card.position).toBe(1);
    expect(card.taskId).toBe('task-1');
    expect(card.assignedTo).toEqual({ id: 'user-1', name: 'Maria Souza' });
    expect(card.client).toEqual({
      name: 'João Silva',
      taxId: '12345678909',
      phone: '11987654321',
    });
    expect(card.contract).toEqual({
      id: 'contract-1',
      number: 'CT-001',
      totalInstallments: 12,
      companyName: 'Trigo Dourado',
    });
    expect(card.lastInteraction).toEqual({
      result: 'no_answer',
      channel: 'phone',
      createdAt: new Date('2026-07-28T09:00:00Z'),
    });
  });

  it('monta o rótulo da parcela como número/total', () => {
    expect(mapCard(queueRow(), 1).installment.label).toBe('2/12');
  });

  it('coage os valores monetários vindos como string do Postgres', () => {
    const card = mapCard(queueRow(), 1);
    expect(card.installment.pendingAmount).toBe(1250.5);
    expect(card.installment.totalAmount).toBe(1500);
  });

  it('coage Decimal do Prisma', () => {
    const card = mapCard(
      queueRow({ pending_amount: new Prisma.Decimal('980.25') }),
      1,
    );
    expect(card.installment.pendingAmount).toBe(980.25);
  });

  it('ainda espelha amountOverdue em pendingAmount — o cálculo de juros não existe no portal', () => {
    // Documenta o TODO(RN-023): quando o valor corrigido entrar, este teste
    // deve falhar e ser reescrito, em vez de a divergência passar batida.
    const card = mapCard(queueRow(), 1);
    expect(card.installment.amountOverdue).toBe(card.installment.pendingAmount);
  });

  it('devolve assignedTo nulo quando a tarefa não tem responsável', () => {
    const card = mapCard(
      queueRow({ assigned_to_id: null, assigned_to_name: null }),
      1,
    );
    expect(card.assignedTo).toBeNull();
  });

  it('cai para nome vazio quando há responsável sem nome', () => {
    const card = mapCard(queueRow({ assigned_to_name: null }), 1);
    expect(card.assignedTo).toEqual({ id: 'user-1', name: '' });
  });

  it('devolve lastInteraction nula quando a tarefa nunca foi tocada', () => {
    const card = mapCard(
      queueRow({
        last_result: null,
        last_channel: null,
        last_created_at: null,
      }),
      1,
    );
    expect(card.lastInteraction).toBeNull();
  });

  it('cai para canal vazio quando há interação sem canal registrado', () => {
    const card = mapCard(queueRow({ last_channel: null }), 1);
    expect(card.lastInteraction?.channel).toBe('');
  });

  it('cai para os defaults quando prioridade, tom e total de parcelas vêm nulos', () => {
    const card = mapCard(
      queueRow({ priority: null, tone: null, total_installments: null! }),
      1,
    );

    expect(card.priority).toBe(0);
    expect(card.tone).toBe('');
    expect(card.contract.totalInstallments).toBe(0);
    expect(card.installment.label).toBe('2/0');
  });

  it('omite telefone e empresa quando vêm nulos', () => {
    const card = mapCard(
      queueRow({ client_phone: null, company_name: null }),
      1,
    );
    expect(card.client.phone).toBeUndefined();
    expect(card.contract.companyName).toBeUndefined();
  });
});

describe('mapGuarantor', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['array', []],
    ['string', 'nada'],
    ['número', 42],
  ])('devolve null para %s', (_label, raw) => {
    expect(mapGuarantor(raw)).toBeNull();
  });

  it('devolve null quando o bloco existe mas não tem identificação', () => {
    // Caso real: o bloco de avalista foi aberto na proposta e não preenchido.
    expect(mapGuarantor({ name: '   ', document: '' })).toBeNull();
  });

  it('aceita avalista identificado só pelo nome', () => {
    expect(mapGuarantor({ name: 'Ana Lima' })).toEqual({
      name: 'Ana Lima',
      taxId: '',
      phone: undefined,
      email: undefined,
      address: undefined,
    });
  });

  it('aceita avalista identificado só pelo documento', () => {
    expect(mapGuarantor({ document: '123.456.789-09' })?.taxId).toBe(
      '12345678909',
    );
  });

  it('apara o nome e tira a máscara do documento', () => {
    const guarantor = mapGuarantor({
      name: '  Ana Lima  ',
      document: '123.456.789-09',
    });
    expect(guarantor?.name).toBe('Ana Lima');
    expect(guarantor?.taxId).toBe('12345678909');
  });

  it('mapeia o endereço do jsonb, que usa chaves diferentes das de addresses', () => {
    const guarantor = mapGuarantor({
      name: 'Ana Lima',
      document: '12345678909',
      telephone: '11987654321',
      email: 'ana@exemplo.com',
      address: {
        streetName: 'R. das Acácias',
        streetNumber: '99',
        streetComplement: 'casa 2',
        streetDistrict: 'Jardins',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01402000',
      },
    });

    expect(guarantor?.phone).toBe('11987654321');
    expect(guarantor?.email).toBe('ana@exemplo.com');
    expect(guarantor?.address).toEqual({
      street: 'R. das Acácias',
      number: '99',
      complement: 'casa 2',
      neighborhood: 'Jardins',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01402000',
    });
  });

  it('omite o endereço quando o jsonb não traz o logradouro', () => {
    const guarantor = mapGuarantor({
      name: 'Ana Lima',
      address: { city: 'São Paulo' },
    });
    expect(guarantor?.address).toBeUndefined();
  });

  it('preenche com vazio os campos ausentes do endereço', () => {
    const guarantor = mapGuarantor({
      name: 'Ana Lima',
      address: { streetName: 'R. das Acácias' },
    });

    expect(guarantor?.address).toEqual({
      street: 'R. das Acácias',
      number: '',
      complement: undefined,
      neighborhood: '',
      city: '',
      state: undefined,
      zipCode: '',
    });
  });
});

describe('mapAddress', () => {
  it('monta o endereço do cliente', () => {
    expect(mapAddress(addressRow())).toEqual({
      street: 'R. das Flores',
      number: '123',
      complement: 'apto 4',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    });
  });

  it('devolve undefined quando não há endereço', () => {
    expect(mapAddress(undefined)).toBeUndefined();
  });

  it('devolve undefined quando a linha existe mas não tem logradouro', () => {
    expect(mapAddress(addressRow({ street: '' }))).toBeUndefined();
  });

  it('traduz complemento e estado nulos para undefined, e o resto para vazio', () => {
    const address = mapAddress(
      addressRow({ complement: null, state: null, zip_code: null! }),
    );

    expect(address?.complement).toBeUndefined();
    expect(address?.state).toBeUndefined();
    expect(address?.zipCode).toBe('');
  });
});
