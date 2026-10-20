import { PeopleScopeService } from '../scope/people-scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PerformanceRepository } from './performance.repository';
import { PERFORMANCE_USER_ID, performanceRow } from './performance.fixture';

const viewer = {
  userId: PERFORMANCE_USER_ID,
  permissions: [PermissionKey.INSTALLMENT_VIEW],
};
const partnerId = 'f630bd84-1425-423a-a533-5e5139abb9d5';

describe('PerformanceService', () => {
  const people = { assertCanSelect: jest.fn() };
  let service: PerformanceService;
  let repository: { findMonths: jest.Mock; findPerformance: jest.Mock };

  beforeEach(() => {
    people.assertCanSelect.mockReset();
    repository = { findMonths: jest.fn(), findPerformance: jest.fn() };
    service = new PerformanceService(
      repository as unknown as PerformanceRepository,
      people as unknown as PeopleScopeService,
    );
  });

  it('consulta os indicadores do próprio parceiro e da competência explícita', async () => {
    repository.findPerformance.mockResolvedValue(performanceRow());
    const result = await service.getPerformance(viewer, '2026-09');
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
    await expect(service.getPerformance(viewer)).resolves.toEqual({
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
    await expect(service.getMonths(viewer)).resolves.toEqual({
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
        await service[method](viewer);
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
    await expect(service.getPerformance(viewer)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    repository.findPerformance.mockResolvedValue(undefined);
    await expect(service.getPerformance(viewer)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('consulta a mesma pessoa autorizada no histórico e nos indicadores', async () => {
    repository.findMonths.mockResolvedValue([
      { current_month: '2026-10', month: null },
    ]);
    repository.findPerformance.mockResolvedValue(performanceRow());
    await service.getMonths(viewer, partnerId);
    await service.getPerformance(viewer, '2026-09', partnerId);
    expect(people.assertCanSelect).toHaveBeenNthCalledWith(
      1,
      viewer,
      partnerId,
    );
    expect(people.assertCanSelect).toHaveBeenNthCalledWith(
      2,
      viewer,
      partnerId,
    );
    expect(repository.findMonths).toHaveBeenCalledWith(partnerId);
    expect(repository.findPerformance).toHaveBeenCalledWith(
      partnerId,
      '2026-09',
    );
  });

  it.each(['getMonths', 'getPerformance'] as const)(
    'recusa pessoa fora do escopo antes de ler a view em %s',
    async (method) => {
      people.assertCanSelect.mockRejectedValue(
        new ForbiddenException('assignee_outside_viewer_scope'),
      );
      const result =
        method === 'getMonths'
          ? service.getMonths(viewer, partnerId)
          : service.getPerformance(viewer, '2026-09', partnerId);
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.findMonths).not.toHaveBeenCalled();
      expect(repository.findPerformance).not.toHaveBeenCalled();
    },
  );

  it('não permite selecionar equipe sem as permissões exigidas pela Home', async () => {
    await expect(
      service.getPerformance(
        { ...viewer, permissions: [] },
        '2026-09',
        partnerId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(people.assertCanSelect).not.toHaveBeenCalled();
    expect(repository.findPerformance).not.toHaveBeenCalled();
  });

  it('permite consultar a si próprio sem permissões da Home', async () => {
    repository.findPerformance.mockResolvedValue(performanceRow());
    await service.getPerformance(
      { ...viewer, permissions: [] },
      '2026-09',
      viewer.userId,
    );
    expect(people.assertCanSelect).not.toHaveBeenCalled();
    expect(repository.findPerformance).toHaveBeenCalledWith(
      viewer.userId,
      '2026-09',
    );
  });
});
