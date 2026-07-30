import {
  BadRequestException,
  ConflictException,
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
    const email = dto.email?.trim().toLowerCase();
    const fullName = dto.fullName?.trim();
    // null = limpar; undefined = não tocar (por isso não dá pra usar `?.`).
    const phone =
      dto.phoneNumber === undefined
        ? undefined
        : (dto.phoneNumber?.trim() ?? null);

    if (email === undefined && fullName === undefined && phone === undefined) {
      throw new BadRequestException('no_fields_to_update');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.trigo_users.findFirst({
          where: { id: userId, is_deleted: false },
          select: { id: true },
        });
        if (!user) throw new UnauthorizedException('Usuário não encontrado');

        if (email !== undefined) {
          // Case-insensitive e SEM filtrar is_deleted: o índice único de
          // trigo_users.email é do banco e não conhece soft delete — um usuário
          // deletado segurando o email faria o UPDATE estourar mais adiante.
          const taken = await tx.trigo_users.findFirst({
            where: {
              email: { equals: email, mode: 'insensitive' },
              id: { not: userId },
            },
            select: { id: true },
          });
          if (taken) throw new ConflictException('email_already_in_use');
        }

        const updated = await tx.trigo_users.update({
          where: { id: userId },
          data: {
            ...(email !== undefined && { email }),
            ...(fullName !== undefined && { full_name: fullName }),
            ...(phone !== undefined && { phone_number: phone }),
            updated_at: new Date(),
          },
        });

        await this.syncLegacyProfiles(tx, userId, {
          email,
          name: fullName,
          phone_number: phone,
        });

        return updated;
      });
    } catch (error) {
      // consultants.email/cpf têm UNIQUE próprio: o espelhamento pode colidir
      // com um perfil legado de OUTRO usuário mesmo com trigo_users limpo.
      // A transação inteira sofre rollback — nada fica pela metade.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('email_already_in_use');
      }
      throw error;
    }
  }

  private async syncLegacyProfiles(
    tx: Prisma.TransactionClient,
    userId: string,
    data: { email?: string; name?: string; phone_number?: string | null },
  ): Promise<void> {
    const legacy = {
      ...(data.email !== undefined && { email: data.email }),
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
