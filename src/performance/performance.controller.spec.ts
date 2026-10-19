import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { PerformanceModule } from './performance.module';
import { PerformanceRepository } from './performance.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

describe('PerformanceController V2', () => {
  let controller: PerformanceController;
  let service: { getMonths: jest.Mock; getPerformance: jest.Mock };

  beforeEach(() => {
    service = { getMonths: jest.fn(), getPerformance: jest.fn() };
    controller = new PerformanceController(
      service as unknown as PerformanceService,
    );
  });

  it('usa o parceiro fixo do teste local para consultar competências', async () => {
    service.getMonths.mockResolvedValue({
      currentMonth: '2026-10',
      months: [],
    });
    await expect(controller.getMonths()).resolves.toEqual({
      currentMonth: '2026-10',
      months: [],
    });
    expect(service.getMonths).toHaveBeenCalledWith(
      '2e95c324-bd29-4f42-896c-2c8f0a1e1c94',
    );
  });

  it('usa o mesmo parceiro fixo para os indicadores e preserva o mês solicitado', async () => {
    service.getPerformance.mockResolvedValue({
      month: '2026-09',
      availability: 'NO_DATA',
      data: null,
    });
    await controller.getPerformance({ month: '2026-09' });
    expect(service.getPerformance).toHaveBeenCalledWith(
      '2e95c324-bd29-4f42-896c-2c8f0a1e1c94',
      '2026-09',
    );
  });

  it('permite omitir o mês', async () => {
    await controller.getPerformance({});
    expect(service.getPerformance).toHaveBeenCalledWith(
      '2e95c324-bd29-4f42-896c-2c8f0a1e1c94',
      undefined,
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
