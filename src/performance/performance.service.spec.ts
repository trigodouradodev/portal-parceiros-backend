import { ServiceUnavailableException } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PerformanceRepository } from './performance.repository';
import { PERFORMANCE_USER_ID, performanceRow } from './performance.fixture';

describe('PerformanceService', () => {
  let service: PerformanceService;
  let repository: { findMonths: jest.Mock; findPerformance: jest.Mock };

  beforeEach(() => {
    repository = { findMonths: jest.fn(), findPerformance: jest.fn() };
    service = new PerformanceService(
      repository as unknown as PerformanceRepository,
    );
  });

  it('consulta os indicadores do próprio parceiro e da competência explícita', async () => {
    repository.findPerformance.mockResolvedValue(performanceRow());
    const result = await service.getPerformance(PERFORMANCE_USER_ID, '2026-09');
    expect(repository.findPerformance).toHaveBeenCalledWith(
      PERFORMANCE_USER_ID,
      '2026-09',
    );
    expect(result.data!.level.label).toBe('Bronze');
  });

  it('delega ao banco a referência do mês corrente quando o mês não é informado', async () => {
    repository.findPerformance.mockResolvedValue(
      performanceRow({ requested_month: '2026-10', id_consultor: null }),
    );
    await expect(service.getPerformance(PERFORMANCE_USER_ID)).resolves.toEqual({
      month: '2026-10',
      availability: 'NO_DATA',
      data: null,
    });
    expect(repository.findPerformance).toHaveBeenCalledWith(
      PERFORMANCE_USER_ID,
      undefined,
    );
  });

  it('consulta as competências somente do usuário autenticado', async () => {
    repository.findMonths.mockResolvedValue([
      { current_month: '2026-10', month: null },
    ]);
    await expect(service.getMonths(PERFORMANCE_USER_ID)).resolves.toEqual({
      currentMonth: '2026-10',
      months: [],
    });
    expect(repository.findMonths).toHaveBeenCalledWith(PERFORMANCE_USER_ID);
  });

  it.each(['getMonths', 'getPerformance'] as const)(
    'converte falha de leitura em 503 em %s, sem expor a mensagem do driver',
    async (method) => {
      const readError = new Error('database connection details');
      repository.findMonths.mockRejectedValue(readError);
      repository.findPerformance.mockRejectedValue(readError);
      try {
        await service[method](PERFORMANCE_USER_ID);
        throw new Error('expected_service_unavailable');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect(
          (error as ServiceUnavailableException).getResponse(),
        ).toMatchObject({
          statusCode: 503,
          message: 'performance_data_unavailable',
        });
        expect((error as Error).message).not.toContain('connection details');
      }
    },
  );

  it('não transforma dados corrompidos ou resultado inesperado em NO_DATA', async () => {
    repository.findPerformance.mockResolvedValue(
      performanceRow({ taxa_media_bonus: 'NaN' }),
    );
    await expect(
      service.getPerformance(PERFORMANCE_USER_ID),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    repository.findPerformance.mockResolvedValue(undefined);
    await expect(
      service.getPerformance(PERFORMANCE_USER_ID),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
