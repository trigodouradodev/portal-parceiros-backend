import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { trigo_users } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.is_active || user.is_deleted) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const permissions = await this.usersService.getPermissionKeys(user.id);
    const tokens = await this.generateTokens(user, permissions);
    await this.usersService.updateLastLogin(user.id);

    return { user: { ...this.toPublicUser(user), permissions }, ...tokens };
  }

  async refreshTokens(userId: string): Promise<Tokens> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.is_active || user.is_deleted) {
      throw new ForbiddenException('Acesso negado');
    }

    const permissions = await this.usersService.getPermissionKeys(user.id);
    return this.generateTokens(user, permissions);
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.is_active || user.is_deleted) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const permissions = await this.usersService.getPermissionKeys(user.id);
    return { ...this.toPublicUser(user), permissions };
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
