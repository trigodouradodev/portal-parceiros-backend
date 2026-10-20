import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { ScopeService, ScopeViewer } from './scope.service';

interface PersonOption {
  id: string;
  name: string;
}

const ROLLOUT_PARTNER_ROLES = [
  PermissionKey.ROLE_CONSULTANT,
  PermissionKey.ROLE_COLLECTION_AGENT,
];

const ROLLOUT_OBSERVER_ROLES = [
  PermissionKey.ROLE_ADMIN,
  PermissionKey.ROLE_SUPPORT,
];

/** Escopo de pessoas compartilhado pela Home e pelo Desempenho. */
@Injectable()
export class PeopleScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async getOptions(viewer: ScopeViewer): Promise<PersonOption[]> {
    if (this.isRolloutObserver(viewer.permissions)) {
      return this.findRolloutPartners();
    }

    const scope = await this.scope.getViewerScopeIds(viewer.userId);
    const subordinateIds = scope.userIds.filter((id) => id !== viewer.userId);
    if (subordinateIds.length === 0) return [];

    const users = await this.prisma.trigo_users.findMany({
      where: { id: { in: subordinateIds }, is_deleted: false },
      select: { id: true, full_name: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
    return users.map((user) => ({ id: user.id, name: user.full_name }));
  }

  async assertCanSelect(
    viewer: ScopeViewer,
    assignedToId: string,
  ): Promise<void> {
    if (this.isRolloutObserver(viewer.permissions)) {
      const rolloutPartner = await this.findRolloutPartners(assignedToId);
      if (rolloutPartner.length === 0) {
        throw new ForbiddenException('assignee_outside_viewer_scope');
      }
      return;
    }

    const scope = await this.scope.getViewerScopeIds(viewer.userId);
    if (!scope.userIds.includes(assignedToId)) {
      throw new ForbiddenException('assignee_outside_viewer_scope');
    }
    return;
  }

  isRolloutObserver(permissions: string[]): boolean {
    return ROLLOUT_OBSERVER_ROLES.some((role) => permissions.includes(role));
  }

  private async findRolloutPartners(userId?: string): Promise<PersonOption[]> {
    const users = await this.prisma.trigo_users.findMany({
      where: {
        ...(userId ? { id: userId } : {}),
        is_active: true,
        is_deleted: false,
        AND: [
          {
            trigo_group_members: {
              some: {
                trigo_groups: {
                  is_active: true,
                  is_deleted: false,
                  trigo_group_permissions: {
                    some: {
                      permissions: {
                        permission_key: PermissionKey.QUOTE_ACTIVITY_GATES,
                      },
                    },
                  },
                },
              },
            },
          },
          {
            trigo_group_members: {
              some: {
                trigo_groups: {
                  is_active: true,
                  is_deleted: false,
                  trigo_group_permissions: {
                    some: {
                      permissions: {
                        permission_key: { in: ROLLOUT_PARTNER_ROLES },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true, full_name: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
    return users.map((user) => ({ id: user.id, name: user.full_name }));
  }
}
