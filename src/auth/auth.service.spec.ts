import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { trigo_users } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';

jest.mock('bcrypt');

const USER_ID = '11111111-1111-1111-1111-111111111111';

const CONFIG: Record<string, string> = {
  'jwt.accessSecret': 'segredo-de-acesso',
  'jwt.accessExpiresIn': '15m',
  'jwt.refreshSecret': 'segredo-de-refresh',
  'jwt.refreshExpiresIn': '7d',
};

function user(overrides: Partial<trigo_users> = {}): trigo_users {
  return {
    id: USER_ID,
    email: 'parceiro@trigodourado.com',
    password: '$2b$12$hash-armazenado',
    full_name: 'Maria Souza',
    phone_number: '11987654321',
    role: 'consultant',
    is_active: true,
    is_deleted: false,
    ...overrides,
  } as trigo_users;
}

interface BuildOptions {
  found?: trigo_users | null;
  permissions?: string[];
  quoteActivityPermissions?: {
    canSimulateQuote: boolean;
    canCreateQuote: boolean;
  };
}

async function build(options: BuildOptions = {}) {
  const {
    found = user(),
    permissions = ['INSTALLMENT_VIEW'],
    quoteActivityPermissions = {
      canSimulateQuote: true,
      canCreateQuote: true,
    },
  } = options;

  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(found),
    findById: jest.fn().mockResolvedValue(found),
    getPermissionKeys: jest.fn().mockResolvedValue(permissions),
    updateLastLogin: jest.fn().mockResolvedValue(undefined),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    updateProfile: jest.fn().mockResolvedValue(found),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token-assinado'),
  };
  const configService = {
    getOrThrow: jest.fn((key: string) => CONFIG[key]),
  };
  const quoteActivityPermissionsService = {
    getPermissions: jest.fn().mockResolvedValue(quoteActivityPermissions),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useValue: usersService },
      { provide: JwtService, useValue: jwtService },
      { provide: ConfigService, useValue: configService },
      {
        provide: QuoteActivityPermissionsService,
        useValue: quoteActivityPermissionsService,
      },
    ],
  }).compile();

  return {
    service: module.get(AuthService),
    usersService,
    jwtService,
    quoteActivityPermissionsService,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$novo-hash');
});

describe('login', () => {
  it('autentica e devolve usuário, permissões e tokens', async () => {
    const { service, usersService } = await build();
    const result = await service.login({
      email: 'parceiro@trigodourado.com',
      password: 'senha',
    });

    expect(result.accessToken).toBe('token-assinado');
    expect(result.refreshToken).toBe('token-assinado');
    expect(result.user.permissions).toEqual(['INSTALLMENT_VIEW']);
    expect(result.user.canSimulateQuote).toBe(true);
    expect(result.user.canCreateQuote).toBe(true);
    expect(usersService.updateLastLogin).toHaveBeenCalledWith(USER_ID);
  });

  it('nunca devolve o hash da senha', async () => {
    const { service } = await build();
    const result = await service.login({
      email: 'parceiro@trigodourado.com',
      password: 'senha',
    });

    expect(result.user).not.toHaveProperty('password');
    expect(JSON.stringify(result)).not.toContain('$2b$12$hash-armazenado');
  });

  it('normaliza o email antes de buscar — espaço e caixa não impedem o login', async () => {
    const { service, usersService } = await build();
    await service.login({
      email: '  Parceiro@TrigoDourado.com  ',
      password: 'senha',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'parceiro@trigodourado.com',
    );
  });

  it.each([
    ['usuário inexistente', null],
    ['usuário inativo', user({ is_active: false })],
    ['usuário deletado', user({ is_deleted: true })],
  ])('401 para %s', async (_label, found) => {
    const { service } = await build({ found });
    await expect(
      service.login({ email: 'a@b.com', password: 'senha' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('401 quando a senha não confere', async () => {
    const { service } = await build();
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'a@b.com', password: 'errada' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('usa a mesma mensagem para usuário inexistente e senha errada', async () => {
    // Mensagens distintas permitiriam enumerar quais emails existem.
    const semUsuario = await build({ found: null });
    const senhaErrada = await build();
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const erroA = await semUsuario.service
      .login({ email: 'a@b.com', password: 'x' })
      .catch((e: Error) => e.message);
    const erroB = await senhaErrada.service
      .login({ email: 'a@b.com', password: 'x' })
      .catch((e: Error) => e.message);

    expect(erroA).toBe(erroB);
  });

  it('não registra último acesso quando a autenticação falha', async () => {
    const { service, usersService } = await build({ found: null });
    await expect(
      service.login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(usersService.updateLastLogin).not.toHaveBeenCalled();
  });
});

describe('geração de tokens', () => {
  it('assina access e refresh com segredos DIFERENTES', async () => {
    // Se compartilhassem segredo, um refresh token seria aceito como access
    // token pela JwtStrategy — escalada silenciosa de privilégio.
    const { service, jwtService } = await build();
    await service.login({ email: 'a@b.com', password: 'senha' });

    const segredos = jwtService.signAsync.mock.calls.map(
      ([, options]: [unknown, { secret: string }]) => options.secret,
    );
    expect(segredos).toEqual(['segredo-de-acesso', 'segredo-de-refresh']);
  });

  it('usa expirações diferentes para access e refresh', async () => {
    const { service, jwtService } = await build();
    await service.login({ email: 'a@b.com', password: 'senha' });

    const expiracoes = jwtService.signAsync.mock.calls.map(
      ([, options]: [unknown, { expiresIn: string }]) => options.expiresIn,
    );
    expect(expiracoes).toEqual(['15m', '7d']);
  });

  it('coloca sub, email, role e permissões no payload — e nada mais', async () => {
    const { service, jwtService } = await build();
    await service.login({ email: 'a@b.com', password: 'senha' });

    const [payload] = jwtService.signAsync.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'permissions',
      'role',
      'sub',
    ]);
    expect(payload.sub).toBe(USER_ID);
  });
});

describe('refreshTokens', () => {
  it('emite novos tokens para usuário válido', async () => {
    const { service } = await build();
    await expect(service.refreshTokens(USER_ID)).resolves.toEqual({
      accessToken: 'token-assinado',
      refreshToken: 'token-assinado',
    });
  });

  it('relê as permissões do banco a cada refresh', async () => {
    // O refresh é stateless: se as permissões mudaram, o token novo já sai
    // atualizado sem precisar de novo login.
    const { service, usersService } = await build({ permissions: ['NOVA'] });
    await service.refreshTokens(USER_ID);

    expect(usersService.getPermissionKeys).toHaveBeenCalledWith(USER_ID);
  });

  it.each([
    ['usuário inexistente', null],
    ['usuário inativo', user({ is_active: false })],
    ['usuário deletado', user({ is_deleted: true })],
  ])(
    '403 para %s — e não 401, que o cliente trataria como reautenticar',
    async (_label, found) => {
      const { service } = await build({ found });
      await expect(service.refreshTokens(USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    },
  );
});

describe('getProfile', () => {
  it('devolve o perfil público com as permissões', async () => {
    const { service } = await build();
    const profile = await service.getProfile(USER_ID);

    expect(profile).toEqual({
      id: USER_ID,
      email: 'parceiro@trigodourado.com',
      full_name: 'Maria Souza',
      phone_number: '11987654321',
      role: 'consultant',
      permissions: ['INSTALLMENT_VIEW'],
      canSimulateQuote: true,
      canCreateQuote: true,
    });
  });

  it('inclui as permissões comerciais calculadas pelas atividades', async () => {
    const { service, quoteActivityPermissionsService } = await build({
      permissions: [
        'ROLE_CONSULTANT',
        'QUOTE_ACTIVITY_GATES',
        'INSTALLMENT_VIEW',
      ],
      quoteActivityPermissions: {
        canSimulateQuote: true,
        canCreateQuote: false,
      },
    });

    await expect(service.getProfile(USER_ID)).resolves.toMatchObject({
      canSimulateQuote: true,
      canCreateQuote: false,
    });
    expect(quoteActivityPermissionsService.getPermissions).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        permissions: [
          'ROLE_CONSULTANT',
          'QUOTE_ACTIVITY_GATES',
          'INSTALLMENT_VIEW',
        ],
      },
    );
  });

  it.each([
    ['usuário inexistente', null],
    ['usuário inativo', user({ is_active: false })],
    ['usuário deletado', user({ is_deleted: true })],
  ])('401 para %s', async (_label, found) => {
    const { service } = await build({ found });
    await expect(service.getProfile(USER_ID)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('changePassword', () => {
  const dto = { currentPassword: 'atual', newPassword: 'nova' };

  it('troca a senha e confirma', async () => {
    const { service, usersService } = await build();
    await expect(service.changePassword(USER_ID, dto)).resolves.toEqual({
      message: 'Senha alterada com sucesso',
    });
    expect(usersService.updatePassword).toHaveBeenCalledWith(
      USER_ID,
      '$2b$12$novo-hash',
    );
  });

  it('gera o hash com custo 12', async () => {
    const { service } = await build();
    await service.changePassword(USER_ID, dto);

    expect(bcrypt.hash).toHaveBeenCalledWith('nova', 12);
  });

  it('401 quando a senha atual não confere', async () => {
    const { service, usersService } = await build();
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.changePassword(USER_ID, dto)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('400 quando a nova senha é igual à atual', async () => {
    const { service, usersService } = await build();
    await expect(
      service.changePassword(USER_ID, {
        currentPassword: 'mesma',
        newPassword: 'mesma',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('valida a senha atual antes de comparar com a nova', async () => {
    // Ordem importa: quem não sabe a senha atual não deve descobrir, pela
    // mensagem de erro, que chutou justamente a senha vigente.
    const { service } = await build();
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changePassword(USER_ID, {
        currentPassword: 'mesma',
        newPassword: 'mesma',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['usuário inexistente', null],
    ['usuário inativo', user({ is_active: false })],
    ['usuário deletado', user({ is_deleted: true })],
  ])('401 para %s', async (_label, found) => {
    const { service } = await build({ found });
    await expect(service.changePassword(USER_ID, dto)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
