import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { QuoteActivityPermissionsService } from './quote-activity-permissions.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function build(tasks: { segment_code: string }[] = []) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(tasks),
  } as unknown as PrismaService;

  return { service: new QuoteActivityPermissionsService(prisma), prisma };
}

const rolloutPartnerPermissions = [
  PermissionKey.ROLE_CONSULTANT,
  PermissionKey.QUOTE_ACTIVITY_GATES,
];

describe('QuoteActivityPermissionsService', () => {
  it('mantém as propostas liberadas fora do rollout', async () => {
    const { service, prisma } = build();

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: [PermissionKey.ROLE_CONSULTANT],
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('mantém as propostas liberadas para papéis não elegíveis', async () => {
    const { service, prisma } = build();

    await expect(
      service.getPermissions({
        userId: USER_ID,
        permissions: [PermissionKey.QUOTE_ACTIVITY_GATES],
      }),
    ).resolves.toEqual({ canSimulateQuote: true, canCreateQuote: true });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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
});
