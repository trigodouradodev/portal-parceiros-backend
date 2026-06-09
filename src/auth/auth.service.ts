import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { trigo_users } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.trigo_users.findUnique({
      where: { email },
    });

    if (!user || !user.is_active || user.is_deleted) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const permissions = await this.getUserPermissionKeys(user.id);
    const tokens = await this.generateTokens(user, permissions);
    await this.prisma.trigo_users.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    return { user: { ...this.toPublicUser(user), permissions }, ...tokens };
  }

  async refreshTokens(userId: string): Promise<Tokens> {
    const user = await this.prisma.trigo_users.findUnique({
      where: { id: userId },
    });

    if (!user || !user.is_active || user.is_deleted) {
      throw new ForbiddenException('Acesso negado');
    }

    const permissions = await this.getUserPermissionKeys(user.id);
    return this.generateTokens(user, permissions);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.trigo_users.findUnique({
      where: { id: userId },
    });

    if (!user || !user.is_active || user.is_deleted) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const permissions = await this.getUserPermissionKeys(user.id);
    return { ...this.toPublicUser(user), permissions };
  }

  /**
   * Permission keys concedidas ao usuário via seus grupos ativos.
   * trigo_users -> trigo_group_members -> trigo_groups -> trigo_group_permissions -> permissions
   */
  private async getUserPermissionKeys(userId: string): Promise<string[]> {
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

  private async generateTokens(
    user: trigo_users,
    permissions: string[],
  ): Promise<Tokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'jwt.accessExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'jwt.refreshExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private toPublicUser(user: trigo_users) {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    };
  }
}
