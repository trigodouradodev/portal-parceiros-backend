import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerRestrictionsService } from './partner-restrictions.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

async function build(rows: { id: string }[] | Error = []) {
  const queryRaw = jest.fn(() =>
    rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows),
  );
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PartnerRestrictionsService,
      { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
    ],
  }).compile();

  return { service: module.get(PartnerRestrictionsService), queryRaw };
}

function lastSql(queryRaw: jest.Mock): Prisma.Sql {
  return (queryRaw.mock.calls[0] as unknown as [Prisma.Sql])[0];
}

describe('PartnerRestrictionsService.isLoginBlocked', () => {
  it('true quando há linha (suspenso, desligado ou restrição de acesso ativa)', async () => {
    const { service } = await build([{ id: 'partner-1' }]);

    await expect(service.isLoginBlocked(USER_ID, 'auth/login')).resolves.toBe(
      true,
    );
  });

  it('false quando não há linha: ativo sem restrição, ou quem não é parceiro', async () => {
    const { service } = await build([]);

    await expect(service.isLoginBlocked(USER_ID, 'auth/login')).resolves.toBe(
      false,
    );
  });

  it('consulta pelo usuário, só restrição de acesso ainda ativa e os status que bloqueiam', async () => {
    const { service, queryRaw } = await build([]);

    await service.isLoginBlocked(USER_ID, 'auth/login');

    const query = lastSql(queryRaw);
    expect(query.sql).toContain("pr.scope = 'acesso'");
    expect(query.sql).toContain('pr.lifted_at IS NULL');
    expect(query.sql).toContain('p.current_status IN');
    expect(query.values).toEqual([USER_ID, 'suspenso', 'desligado']);
  });

  it('registra o bloqueio em log estruturado', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = await build([{ id: 'partner-1' }]);

    await service.isLoginBlocked(USER_ID, 'auth/refresh');

    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: 'partner_restriction_blocked',
      scope: 'acesso',
      userId: USER_ID,
      route: 'auth/refresh',
    });
    warn.mockRestore();
  });
});

describe('PartnerRestrictionsService.isOriginationRestricted', () => {
  const consultant = {
    userId: USER_ID,
    permissions: [PermissionKey.QUOTE_CREATE],
  };

  it('true com restrição de originação ativa', async () => {
    const { service } = await build([{ id: 'restriction-1' }]);

    await expect(
      service.isOriginationRestricted(consultant, 'quotes/draft'),
    ).resolves.toBe(true);
  });

  it('false sem restrição, e consulta só o escopo originacao ainda ativo', async () => {
    const { service, queryRaw } = await build([]);

    await expect(
      service.isOriginationRestricted(consultant, 'quotes/draft'),
    ).resolves.toBe(false);

    const query = lastSql(queryRaw);
    expect(query.sql).toContain("pr.scope = 'originacao'");
    expect(query.sql).toContain('pr.lifted_at IS NULL');
    expect(query.values).toEqual([USER_ID]);
  });

  it('com logBlock false (perfil) a restrição é detectada mas não vira log de bloqueio', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = await build([{ id: 'restriction-1' }]);

    await expect(
      service.isOriginationRestricted(consultant, 'auth/profile', {
        logBlock: false,
      }),
    ).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ROLE_ADMIN nunca é barrado e nem consulta o banco', async () => {
    const { service, queryRaw } = await build([{ id: 'restriction-1' }]);

    await expect(
      service.isOriginationRestricted(
        { userId: USER_ID, permissions: [PermissionKey.ROLE_ADMIN] },
        'quotes/draft/submit',
      ),
    ).resolves.toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('PartnerRestrictionsService — falha da consulta', () => {
  it('recusa com 503 em vez de liberar, nos dois escopos', async () => {
    const { service } = await build(new Error('conexão perdida'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.isLoginBlocked(USER_ID, 'auth/login')).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(
      service.isOriginationRestricted(
        { userId: USER_ID, permissions: [] },
        'quotes/draft',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    error.mockRestore();
  });

  it('tabela inexistente é logada como erro de ordem de deploy', async () => {
    const { service } = await build(
      new Error('relation "partners" does not exist'),
    );
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.isLoginBlocked(USER_ID, 'auth/login')).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(JSON.parse(error.mock.calls[0][0] as string)).toMatchObject({
      event: 'partner_restriction_check_failed',
      route: 'auth/login',
      missingTable: true,
    });
    error.mockRestore();
  });

  it.each([
    ['mensagem em português', new Error('relação "partners" não existe')],
    [
      'código 42P01 do Prisma, qualquer que seja o idioma',
      Object.assign(new Error('falha na consulta'), {
        code: 'P2010',
        meta: { code: '42P01' },
      }),
    ],
  ])('tabela inexistente é reconhecida: %s', async (_nome, failure) => {
    const { service } = await build(failure);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.isLoginBlocked(USER_ID, 'auth/login')).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(JSON.parse(error.mock.calls[0][0] as string)).toMatchObject({
      missingTable: true,
    });
    error.mockRestore();
  });

  it('outro erro de banco não é marcado como tabela inexistente', async () => {
    const { service } = await build(new Error('connection terminated'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.isLoginBlocked(USER_ID, 'auth/login')).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(JSON.parse(error.mock.calls[0][0] as string)).toMatchObject({
      missingTable: false,
    });
    error.mockRestore();
  });
});
