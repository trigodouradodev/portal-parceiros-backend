import { ScopeService } from '../scope/scope.service';
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
  const people = { assertCanSelect: jest.fn(), getOptions: jest.fn() };
  const scope = { getViewerScopeIds: jest.fn() };
  let service: PerformanceService;
  let repository: {
    findMonths: jest.Mock;
    findPerformance: jest.Mock;
    findPartners: jest.Mock;
    findTeam: jest.Mock;
    findIndividual: jest.Mock;
  };

  beforeEach(() => {
    people.assertCanSelect.mockReset();
    people.getOptions.mockReset().mockResolvedValue([]);
    scope.getViewerScopeIds
      .mockReset()
      .mockResolvedValue({ userIds: [PERFORMANCE_USER_ID] });
    repository = {
      findMonths: jest.fn(),
      findPerformance: jest.fn(),
      findPartners: jest.fn(),
      findTeam: jest.fn(),
      findIndividual: jest.fn(),
    };
    service = new PerformanceService(
      repository as unknown as PerformanceRepository,
      people as unknown as PeopleScopeService,
      scope as unknown as ScopeService,
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
    expect(repository.findMonths).toHaveBeenCalledWith([PERFORMANCE_USER_ID]);
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
    'recusa pessoa fora do escopo antes de ler o snapshot em %s',
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

describe('Seleção de parceiro e integrante', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const member = '22222222-2222-4222-8222-222222222222';
  function build() {
    const repository = {
      findPartners: jest.fn().mockResolvedValue([]),
      findMonths: jest
        .fn()
        .mockResolvedValue([{ current_month: '2026-10', month: '2026-09' }]),
      findTeam: jest.fn().mockResolvedValue([
        { id: owner, name: 'Titular' },
        { id: member, name: 'Integrante' },
      ]),
      findPerformance: jest.fn().mockResolvedValue(performanceRow()),
      findIndividual: jest.fn().mockResolvedValue(undefined),
    };
    const people = {
      getOptions: jest.fn().mockResolvedValue([
        { id: owner, name: 'Titular' },
        { id: member, name: 'Integrante' },
      ]),
      assertCanSelect: jest.fn().mockResolvedValue(undefined),
    };
    const scope = {
      getViewerScopeIds: jest
        .fn()
        .mockResolvedValue({ userIds: [owner, member] }),
    };
    return {
      repository,
      people,
      scope,
      service: new PerformanceService(
        repository as unknown as PerformanceRepository,
        people as unknown as PeopleScopeService,
        scope as unknown as ScopeService,
      ),
    };
  }

  it('lista somente os parceiros da competência dentro dos IDs autorizados', async () => {
    const { service, repository } = build();
    await service.getPartners(viewer, '2026-10');
    expect(repository.findPartners).toHaveBeenCalledWith(
      [viewer.userId, member],
      '2026-10',
    );
  });
  it('consulta o histórico do escopo quando o gerente não selecionou um parceiro', async () => {
    const { service, repository } = build();
    await service.getMonths(viewer);
    expect(repository.findMonths).toHaveBeenCalledWith([viewer.userId, member]);
  });
  it('restringe a listagem ao próprio usuário sem permissão de equipe', async () => {
    const { service, repository, people } = build();
    await service.getPartners({ ...viewer, permissions: [] }, '2026-10');
    expect(repository.findPartners).toHaveBeenCalledWith(
      [viewer.userId],
      '2026-10',
    );
    expect(people.getOptions).not.toHaveBeenCalled();
  });
  it('inclui a hierarquia do titular na seleção mesmo quando falta snapshot do integrante', async () => {
    const { service, repository } = build();
    await service.getTeam(viewer, owner, '2026-10');
    expect(repository.findTeam).toHaveBeenCalledWith(
      owner,
      [owner, member],
      '2026-10',
    );
  });
  it('rejeita titular fora do escopo antes de ler indicadores ou integrantes', async () => {
    const { service, repository, people } = build();
    people.assertCanSelect.mockRejectedValue(new ForbiddenException());
    await expect(
      service.getPerformance(viewer, '2026-10', member, owner),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findPerformance).not.toHaveBeenCalled();
    expect(repository.findTeam).not.toHaveBeenCalled();
  });
  it('rejeita integrante que não pertence ao titular selecionado', async () => {
    const { service, repository } = build();
    await expect(
      service.getPerformance(viewer, '2026-10', owner, 'outside'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findIndividual).not.toHaveBeenCalled();
  });
  it('retorna contribuição zerada se faltar detalhamento sem copiar a remuneração do titular', async () => {
    const { service } = build();
    const result = await service.getPerformance(
      viewer,
      '2026-09',
      owner,
      member,
    );
    expect(result.view).toMatchObject({
      mode: 'INDIVIDUAL',
      missingDetails: true,
    });
    expect(result.data!.indicators.origination.amount).toBe(0);
    expect(result.data!.contractsCount).toBe(0);
    expect(result.data!.indicators.reimbursement.amount).toBe(0);
    expect(result.data!.remuneration.totalAmount).toBeNull();
    expect(result.data!.indicators.origination.targetAmount).toBeNull();
  });
  it('propaga indisponibilidade da consulta individual como 503, sem retornar zeros', async () => {
    const { service, repository } = build();
    repository.findIndividual.mockRejectedValue(
      new Error('snapshot unavailable'),
    );
    await expect(
      service.getPerformance(viewer, '2026-09', owner, member),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
