import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import {
  EXPLICIT_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionMode,
} from '../decorators/require-permissions.decorator';
import { PermissionKey } from '../permissions/permission-keys';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

interface GuardOptions {
  required?: PermissionKey[];
  explicitRequired?: PermissionKey[];
  mode?: PermissionMode;
  permissions?: string[];
  /** false simula requisição sem `request.user` populado. */
  authenticated?: boolean;
}

function run(options: GuardOptions = {}): boolean {
  const {
    required,
    explicitRequired,
    mode,
    permissions = [],
    authenticated = true,
  } = options;

  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PERMISSIONS_KEY) return required;
      if (key === EXPLICIT_PERMISSIONS_KEY) return explicitRequired;
      if (key === PERMISSIONS_MODE_KEY) return mode;
      return undefined;
    }),
  } as unknown as Reflector;

  const user: JwtPayload = {
    sub: 'user-1',
    email: 'a@b.com',
    role: 'consultant',
    permissions,
  };

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => (authenticated ? { user } : {}),
    }),
  } as unknown as ExecutionContext;

  return new PermissionsGuard(reflector).canActivate(context);
}

describe('rotas sem exigência de permissão', () => {
  it('libera quando a rota não declara permissões', () => {
    expect(run({ required: undefined })).toBe(true);
  });

  it('libera quando a rota declara uma lista vazia', () => {
    expect(run({ required: [] })).toBe(true);
  });
});

describe('bypass de ROLE_ADMIN', () => {
  it('libera admin mesmo sem a permissão exigida', () => {
    expect(
      run({
        required: [PermissionKey.INSTALLMENT_VIEW],
        permissions: [PermissionKey.ROLE_ADMIN],
      }),
    ).toBe(true);
  });

  it('libera admin também no modo ALL', () => {
    expect(
      run({
        required: [PermissionKey.QUOTE_CREATE, PermissionKey.QUOTE_APPROVER],
        mode: 'ALL',
        permissions: [PermissionKey.ROLE_ADMIN],
      }),
    ).toBe(true);
  });
});

describe('permissões explícitas de rollout', () => {
  it('não concede bypass ao admin sem a permissão explícita', () => {
    expect(() =>
      run({
        explicitRequired: [PermissionKey.QUOTE_NEW_ORIGINATION_FLOW],
        permissions: [PermissionKey.ROLE_ADMIN],
      }),
    ).toThrow(ForbiddenException);
  });

  it('libera quando a permissão explícita está presente', () => {
    expect(
      run({
        explicitRequired: [PermissionKey.QUOTE_NEW_ORIGINATION_FLOW],
        permissions: [PermissionKey.QUOTE_NEW_ORIGINATION_FLOW],
      }),
    ).toBe(true);
  });
});

describe('modo ANY (padrão)', () => {
  it('libera com uma das permissões exigidas', () => {
    expect(
      run({
        required: [
          PermissionKey.INSTALLMENT_VIEW,
          PermissionKey.INSTALLMENT_VIEW_ALL,
        ],
        permissions: [PermissionKey.INSTALLMENT_VIEW_ALL],
      }),
    ).toBe(true);
  });

  it('bloqueia sem nenhuma das exigidas', () => {
    expect(() =>
      run({
        required: [PermissionKey.INSTALLMENT_VIEW],
        permissions: [PermissionKey.CONTRACT_VIEW],
      }),
    ).toThrow(ForbiddenException);
  });

  it('é o modo aplicado quando a rota não declara um', () => {
    // Sem @RequirePermissions(..., 'ALL'), ter só uma das duas basta.
    expect(
      run({
        required: [PermissionKey.QUOTE_CREATE, PermissionKey.QUOTE_APPROVER],
        mode: undefined,
        permissions: [PermissionKey.QUOTE_CREATE],
      }),
    ).toBe(true);
  });
});

describe('modo ALL', () => {
  it('libera com todas as permissões exigidas', () => {
    expect(
      run({
        required: [PermissionKey.QUOTE_CREATE, PermissionKey.QUOTE_APPROVER],
        mode: 'ALL',
        permissions: [
          PermissionKey.QUOTE_CREATE,
          PermissionKey.QUOTE_APPROVER,
          PermissionKey.CONTRACT_VIEW,
        ],
      }),
    ).toBe(true);
  });

  it('bloqueia quando falta uma das exigidas', () => {
    expect(() =>
      run({
        required: [PermissionKey.QUOTE_CREATE, PermissionKey.QUOTE_APPROVER],
        mode: 'ALL',
        permissions: [PermissionKey.QUOTE_CREATE],
      }),
    ).toThrow(ForbiddenException);
  });
});

describe('requisição sem usuário', () => {
  it('bloqueia quando request.user não foi populado', () => {
    // Não deveria acontecer com o JwtAuthGuard global, mas o guard não pode
    // liberar por omissão se a ordem dos guards mudar.
    expect(() =>
      run({ required: [PermissionKey.INSTALLMENT_VIEW], authenticated: false }),
    ).toThrow(ForbiddenException);
  });
});
