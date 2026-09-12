import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { QuoteActivityPermissionsService } from './quote-activity-permissions.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVATION_AT = '2026-10-01T03:00:00.000Z';

function build(
  tasks: { segment_code: string }[] = [],
  activationAt: string | null = ACTIVATION_AT,
) {
  const queryRaw = jest.fn().mockResolvedValue(tasks);
  const findUnique = jest
    .fn()
    .mockResolvedValue(activationAt === null ? null : { value: activationAt });
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
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(ACTIVATION_AT));
  });

  afterEach(() => jest.restoreAllMocks());

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
