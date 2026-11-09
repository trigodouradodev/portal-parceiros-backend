import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { QuoteActivityPermissionsService } from './quote-activity-permissions.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVATION_AT = '2026-10-01T03:00:00.000Z';
const BLOCKING_AT = '2026-10-01T16:00:00.000Z';

function build(
  tasks: { segment_code: string }[] = [],
  activationAt: string | null = ACTIVATION_AT,
  window: string | null = null,
) {
  const queryRaw = jest.fn().mockResolvedValue(tasks);
  const findUnique = jest
    .fn()
    .mockImplementation(({ where }: { where: { key: string } }) => {
      const value =
        where.key === 'QUOTE_ACTIVITY_GATES_ACTIVATION_AT'
          ? activationAt
          : window;
      return Promise.resolve(value === null ? null : { value });
    });
  const prisma = {
    $queryRaw: queryRaw,
    system_configs: { findUnique },
  } as unknown as PrismaService;

  return {
    service: new QuoteActivityPermissionsService(prisma),
    queryRaw,
    findUnique,
  };
}

const rolloutPartnerPermissions = [
  PermissionKey.ROLE_CONSULTANT,
  PermissionKey.QUOTE_ACTIVITY_GATES,
];

describe('QuoteActivityPermissionsService', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(BLOCKING_AT));
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['2026-11-09T03:00:00Z', true],
    ['2026-11-09T15:59:59.999Z', true],
    ['2026-11-09T16:00:00Z', false],
    ['2026-11-10T02:59:59.999Z', false],
    ['2026-11-10T03:00:00Z', true],
  ])(
    'respeita a janela padrão em São Paulo no instante %s',
    async (now, allowed) => {
      jest.mocked(Date.now).mockReturnValue(Date.parse(now));
      const { service, queryRaw } = build([{ segment_code: 'early' }]);
      await expect(
        service.getPermissions({
          userId: USER_ID,
          permissions: rolloutPartnerPermissions,
        }),
      ).resolves.toEqual({
        canSimulateQuote: allowed,
        canCreateQuote: allowed,
      });
      expect(queryRaw).toHaveBeenCalledTimes(allowed ? 0 : 1);
    },
  );

  it.each([
    ['2026-11-09T17:29:59Z', true],
    ['2026-11-09T17:30:00Z', false],
    ['2026-11-10T00:14:59Z', false],
    ['2026-11-10T00:15:00Z', true],
  ])('usa horários configurados com minutos em %s', async (now, allowed) => {
    jest.mocked(Date.now).mockReturnValue(Date.parse(now));
    const { service } = build(
      [{ segment_code: 'early' }],
      ACTIVATION_AT,
      JSON.stringify({ start: '14:30', end: '21:15' }),
    );
    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: allowed, canCreateQuote: allowed });
  });

  it.each([
    ['2026-11-10T00:59:59Z', true],
    ['2026-11-10T01:00:00Z', false],
    ['2026-11-10T03:00:00Z', false],
    ['2026-11-10T04:59:59Z', false],
    ['2026-11-10T05:00:00Z', true],
  ])(
    'suporta janela que atravessa a meia-noite em %s',
    async (now, allowed) => {
      jest.mocked(Date.now).mockReturnValue(Date.parse(now));
      const { service } = build(
        [{ segment_code: 'early' }],
        ACTIVATION_AT,
        JSON.stringify({ start: '22:00', end: '02:00' }),
      );
      await expect(
        service.getPermissions({
          userId: USER_ID,
          permissions: rolloutPartnerPermissions,
        }),
      ).resolves.toEqual({
        canSimulateQuote: allowed,
        canCreateQuote: allowed,
      });
    },
  );

  it.each([
    null,
    '',
    'invalido',
    '{}',
    'null',
    '[]',
    '{"start":"24:00","end":"00:00"}',
    '{"start":"18:00","end":"10:60"}',
    '{"start":13,"end":"00:00"}',
  ])(
    'usa a janela padrão para configuração ausente ou inválida %s',
    async (window) => {
      const { service } = build(
        [{ segment_code: 'early' }],
        ACTIVATION_AT,
        window,
      );
      await expect(
        service.getPermissions({
          userId: USER_ID,
          permissions: rolloutPartnerPermissions,
        }),
      ).resolves.toEqual({ canSimulateQuote: false, canCreateQuote: false });
    },
  );

  it('horários iguais aplicam a avaliação durante as 24 horas', async () => {
    jest.mocked(Date.now).mockReturnValue(Date.parse('2026-11-09T12:00:00Z'));
    const { service } = build(
      [{ segment_code: 'early' }],
      ACTIVATION_AT,
      JSON.stringify({ start: '00:00', end: '00:00' }),
    );
    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: false, canCreateQuote: false });
  });

  it('consulta os horários novamente após uma edição da configuração', async () => {
    const { service, findUnique } = build([{ segment_code: 'early' }]);
    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: false, canCreateQuote: false });
    findUnique.mockImplementation(({ where }: { where: { key: string } }) =>
      Promise.resolve({
        value:
          where.key === 'QUOTE_ACTIVITY_GATES_ACTIVATION_AT'
            ? ACTIVATION_AT
            : '{"start":"16:00","end":"00:00"}',
      }),
    );
    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
  });

  it('propaga falha de leitura sem liberar os acessos por engano', async () => {
    const { service, findUnique, queryRaw } = build([
      { segment_code: 'early' },
    ]);
    findUnique
      .mockResolvedValueOnce({ value: ACTIVATION_AT })
      .mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).rejects.toThrow('database unavailable');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('mantém as propostas liberadas fora do rollout', async () => {
    const { service, queryRaw, findUnique } = build();

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: [PermissionKey.ROLE_CONSULTANT],
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('mantém as propostas liberadas para papéis não elegíveis', async () => {
    const { service, queryRaw, findUnique } = build();

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: [PermissionKey.QUOTE_ACTIVITY_GATES],
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('bloqueia simular e criar para segmentos de contato pendentes', async () => {
    const { service } = build([{ segment_code: 'early' }]);

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: false, canCreateQuote: false });
  });

  it('permite simular e bloqueia criar para visita pendente', async () => {
    const { service } = build([{ segment_code: 'mid' }]);

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: false });
  });

  it('mantém tudo liberado antes da data configurada', async () => {
    jest.mocked(Date.now).mockReturnValue(Date.parse(ACTIVATION_AT) - 1);
    const { service, queryRaw } = build([{ segment_code: 'early' }]);

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('respeita uma postergação feita em system_configs', async () => {
    const { service, queryRaw } = build(
      [{ segment_code: 'early' }],
      '2026-11-01T03:00:00.000Z',
    );

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('usa a data padrão quando a configuração é inválida', async () => {
    const { service } = build([{ segment_code: 'early' }], 'data-invalida');

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: false, canCreateQuote: false });
  });

  it('não aceita uma data configurada sem timezone explícito', async () => {
    const { service } = build(
      [{ segment_code: 'early' }],
      '2026-11-01T00:00:00',
    );

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: rolloutPartnerPermissions,
      }),
    ).resolves.toEqual({ canSimulateQuote: false, canCreateQuote: false });
  });
});
