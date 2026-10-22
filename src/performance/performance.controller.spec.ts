import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { PerformanceModule } from './performance.module';
import { PerformanceRepository } from './performance.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

const user: JwtPayload = {
  sub: '2e95c324-bd29-4f42-896c-2c8f0a1e1c94',
  email: 'test@example.com',
  role: null,
  permissions: ['INSTALLMENT_VIEW'],
};
const viewer = { userId: user.sub, permissions: user.permissions };
const partnerId = '2410a057-4613-4596-a164-e07c694b7eff';

describe('PerformanceController V2', () => {
  let controller: PerformanceController;
  let service: {
    getMonths: jest.Mock;
    getPerformance: jest.Mock;
    getPartners: jest.Mock;
    getTeam: jest.Mock;
  };

  beforeEach(() => {
    service = {
      getMonths: jest.fn(),
      getPerformance: jest.fn(),
      getPartners: jest.fn(),
      getTeam: jest.fn(),
    };
    controller = new PerformanceController(
      service as unknown as PerformanceService,
    );
  });

  it('usa o usuário autenticado para consultar competências', async () => {
    service.getMonths.mockResolvedValue({
      currentMonth: '2026-10',
      months: [],
    });
    await expect(controller.getMonths(user, {})).resolves.toEqual({
      currentMonth: '2026-10',
      months: [],
    });
    expect(service.getMonths).toHaveBeenCalledWith(viewer, undefined);
  });

  it('encaminha a pessoa selecionada para os indicadores e preserva o mês solicitado', async () => {
    service.getPerformance.mockResolvedValue({
      month: '2026-09',
      availability: 'NO_DATA',
      data: null,
    });
    await controller.getPerformance(user, { month: '2026-09', partnerId });
    expect(service.getPerformance).toHaveBeenCalledWith(
      viewer,
      '2026-09',
      partnerId,
      undefined,
    );
  });

  it('permite omitir o mês', async () => {
    await controller.getPerformance(user, {});
    expect(service.getPerformance).toHaveBeenCalledWith(
      viewer,
      undefined,
      undefined,
      undefined,
    );
  });

  it('encaminha a pessoa selecionada também para as competências', async () => {
    await controller.getMonths(user, { partnerId });
    expect(service.getMonths).toHaveBeenCalledWith(viewer, partnerId);
  });

  it('encaminha opções e integrante com o escopo do usuário autenticado', async () => {
    const memberId = 'adb77ae3-7fda-4b87-856e-9583f4d90d0c';
    await controller.getPartners(user, { month: '2026-10' });
    await controller.getTeam(user, { partnerId, month: '2026-10' });
    await controller.getPerformance(user, {
      partnerId,
      memberId,
      month: '2026-10',
    });
    expect(service.getPartners).toHaveBeenCalledWith(viewer, '2026-10');
    expect(service.getTeam).toHaveBeenCalledWith(viewer, partnerId, '2026-10');
    expect(service.getPerformance).toHaveBeenCalledWith(
      viewer,
      '2026-10',
      partnerId,
      memberId,
    );
  });

  it('registra os provedores e os contratos Swagger das rotas novas no módulo', async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, PerformanceModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn() })
      .compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      const document = SwaggerModule.createDocument(app, {
        info: { title: 'Performance', version: '2', description: '' },
        openapi: '3.0.0',
        paths: {},
      });
      expect(app.get(PerformanceService)).toBeInstanceOf(PerformanceService);
      expect(app.get(PerformanceRepository)).toBeInstanceOf(
        PerformanceRepository,
      );
      expect(
        document.paths['/performance']?.get?.responses['200'],
      ).toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/PerformanceResponseDto',
            },
          },
        },
      });
      for (const path of [
        '/performance/me',
        '/performance/current',
        '/performance/program',
      ]) {
        expect(document.paths[path]).toBeUndefined();
      }
      expect(
        document.paths['/performance/months']?.get?.responses['200'],
      ).toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/PerformanceMonthsResponseDto',
            },
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});

describe('Desempenho: permissão explícita nas quatro rotas', () => {
  let app: INestApplication<Server>;
  let permissions: string[];
  const service = {
    getMonths: jest.fn(),
    getPerformance: jest.fn(),
    getPartners: jest.fn(),
    getTeam: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PerformanceController],
      providers: [{ provide: PerformanceService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { user?: JwtPayload }, _res: unknown, next: () => void) => {
      req.user = { ...user, permissions };
      next();
    });
    app.useGlobalGuards(new PermissionsGuard(app.get(Reflector)));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permissions = [];
    service.getMonths.mockResolvedValue({
      currentMonth: '2026-10',
      months: [],
    });
    service.getPerformance.mockResolvedValue({
      month: '2026-10',
      availability: 'NO_DATA',
      data: null,
    });
    service.getPartners.mockResolvedValue([]);
    service.getTeam.mockResolvedValue([]);
  });
  afterAll(async () => {
    await app.close();
  });

  describe.each([
    '/performance',
    '/performance/months',
    '/performance/partners',
    '/performance/team',
  ])('%s', (path) => {
    it.each(
      [
        [],
        [PermissionKey.ROLE_MANAGER],
        [PermissionKey.ROLE_ADMIN],
        [PermissionKey.ROLE_CONSULTANT, PermissionKey.QUOTE_ACTIVITY_GATES],
        [
          PermissionKey.ROLE_COLLECTION_AGENT,
          PermissionKey.QUOTE_ACTIVITY_GATES,
        ],
      ].map((roles) => ({ roles })),
    )('recusa sem PERFORMANCE_VIEW, mesmo com $roles', async ({ roles }) => {
      permissions = roles;
      await request(app.getHttpServer()).get(path).expect(403);
      expect(service.getMonths).not.toHaveBeenCalled();
      expect(service.getPerformance).not.toHaveBeenCalled();
      expect(service.getPartners).not.toHaveBeenCalled();
      expect(service.getTeam).not.toHaveBeenCalled();
    });

    it.each(
      [
        [PermissionKey.ROLE_MANAGER],
        [PermissionKey.ROLE_ADMIN],
        [PermissionKey.ROLE_CONSULTANT],
        [PermissionKey.ROLE_COLLECTION_AGENT],
      ].map((roles) => ({ roles })),
    )('libera $roles com a permissão atribuída ao grupo', async ({ roles }) => {
      permissions = [...roles, PermissionKey.PERFORMANCE_VIEW];
      await request(app.getHttpServer()).get(path).expect(200);
    });
  });
});
