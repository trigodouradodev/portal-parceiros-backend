import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, trigo_users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

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

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.trigo_users.update({
      where: { id: userId },
      data: { password: passwordHash, updated_at: new Date() },
    });
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<trigo_users> {
    // E-mail não é editável por esta rota (é o login do usuário) — só nome e
    // telefone chegam aqui, então não há verificação de duplicidade a fazer.
    const fullName = dto.fullName?.trim();
    // null = limpar; undefined = não tocar (por isso não dá pra usar `?.`).
    const phone =
      dto.phoneNumber === undefined
        ? undefined
        : (dto.phoneNumber?.trim() ?? null);

    if (fullName === undefined && phone === undefined) {
      throw new BadRequestException('no_fields_to_update');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.trigo_users.findFirst({
        where: { id: userId, is_deleted: false },
        select: { id: true },
      });
      if (!user) throw new UnauthorizedException('Usuário não encontrado');

      const updated = await tx.trigo_users.update({
        where: { id: userId },
        data: {
          ...(fullName !== undefined && { full_name: fullName }),
          ...(phone !== undefined && { phone_number: phone }),
          updated_at: new Date(),
        },
      });

      await this.syncLegacyProfiles(tx, userId, {
        name: fullName,
        phone_number: phone,
      });

      return updated;
    });
  }

  private async syncLegacyProfiles(
    tx: Prisma.TransactionClient,
    userId: string,
    data: { name?: string; phone_number?: string | null },
  ): Promise<void> {
    const legacy = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone_number !== undefined && {
        phone_number: data.phone_number,
      }),
    };
    if (Object.keys(legacy).length === 0) return;

    await tx.consultants.updateMany({
      where: { user_id: userId },
      data: legacy,
    });
    await tx.collection_agents.updateMany({
      where: { user_id: userId },
      data: legacy,
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
