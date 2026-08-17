import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SelfOrAdminGuard } from './self-or-admin.guard';
import { PermissionKey } from '../permissions/permission-keys';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

interface GuardOptions {
  /** Nome do parâmetro de rota declarado por @SelfOrAdmin('...'). */
  paramName?: string;
  params?: Record<string, string>;
  permissions?: string[];
  authenticated?: boolean;
}

function run(options: GuardOptions = {}): boolean {
  const { params = {}, permissions = [], authenticated = true } = options;
  // Default por presença da chave, não por destructuring: `paramName:
  // undefined` precisa significar "o decorator não declarou", e o default de
  // destructuring também dispara para undefined.
  const paramName = 'paramName' in options ? options.paramName : 'managerId';

  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(paramName),
  } as unknown as Reflector;

  const user: JwtPayload = {
    sub: USER_ID,
    email: 'a@b.com',
    role: 'consultant',
    permissions,
  };

  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => (authenticated ? { user, params } : { params }),
    }),
  } as unknown as ExecutionContext;

  return new SelfOrAdminGuard(reflector).canActivate(context);
}

describe('autenticação', () => {
  it('401 quando request.user não foi populado', () => {
    expect(() => run({ authenticated: false })).toThrow(UnauthorizedException);
  });
});

describe('acesso de admin', () => {
  it('libera admin para o recurso de qualquer usuário', () => {
    expect(
      run({
        params: { managerId: OTHER_ID },
        permissions: [PermissionKey.ROLE_ADMIN],
      }),
    ).toBe(true);
  });
});

describe('acesso ao próprio recurso', () => {
  it('libera quando o id do parâmetro é o do próprio caller', () => {
    expect(run({ params: { managerId: USER_ID } })).toBe(true);
  });

  it('403 quando o id do parâmetro é de outro usuário', () => {
    expect(() => run({ params: { managerId: OTHER_ID } })).toThrow(
      ForbiddenException,
    );
  });

  it('403 quando o parâmetro não está presente na rota', () => {
    // Parâmetro ausente vira undefined, que nunca casa com o sub — bloqueia em
    // vez de liberar por comparação frouxa.
    expect(() => run({ params: {} })).toThrow(ForbiddenException);
  });

  it('403 quando o decorator não declarou o nome do parâmetro', () => {
    // Sem @SelfOrAdmin('x'), só admin passa: o guard não tem o que comparar.
    expect(() =>
      run({ paramName: undefined, params: { managerId: USER_ID } }),
    ).toThrow(ForbiddenException);
  });

  it('libera admin mesmo sem o nome do parâmetro declarado', () => {
    expect(
      run({
        paramName: undefined,
        params: {},
        permissions: [PermissionKey.ROLE_ADMIN],
      }),
    ).toBe(true);
  });

  it('compara o id de forma exata, sem casar prefixo', () => {
    expect(() => run({ params: { managerId: USER_ID.slice(0, -1) } })).toThrow(
      ForbiddenException,
    );
  });
});
