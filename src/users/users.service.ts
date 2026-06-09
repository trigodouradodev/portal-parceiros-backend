import { Injectable } from '@nestjs/common';
import { trigo_users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<trigo_users | null> {
    return this.prisma.trigo_users.findUnique({ where: { email } });
  }

  findById(id: string): Promise<trigo_users | null> {
    return this.prisma.trigo_users.findUnique({ where: { id } });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.trigo_users.update({
      where: { id },
      data: { last_login: new Date() },
    });
  }

  /**
   * Permission keys concedidas ao usuário via seus grupos ativos.
   * trigo_users -> trigo_group_members -> trigo_groups -> trigo_group_permissions -> permissions
   */
  async getPermissionKeys(userId: string): Promise<string[]> {
    const permissions = await this.prisma.permissions.findMany({
      where: {
        trigo_group_permissions: {
          some: {
            trigo_groups: {
              is_active: true,
              is_deleted: false,
              trigo_group_members: { some: { user_id: userId } },
            },
          },
        },
      },
      select: { permission_key: true },
      orderBy: { permission_key: 'asc' },
    });

    return permissions.map((permission) => permission.permission_key);
  }
}
