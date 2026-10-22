import { PrismaService } from '../prisma/prisma.service';
import { PerformanceRepository } from './performance.repository';
import { PERFORMANCE_USER_ID, performanceRow } from './performance.fixture';

describe('PerformanceRepository', () => {
  let queryRaw: jest.Mock<
    Promise<unknown[]>,
    [TemplateStringsArray, ...unknown[]]
  >;
  let repository: PerformanceRepository;

  beforeEach(() => {
    queryRaw = jest.fn<
      Promise<unknown[]>,
      [TemplateStringsArray, ...unknown[]]
    >();
    repository = new PerformanceRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it('lista competências usando o Prisma existente e filtrando o próprio parceiro', async () => {
    const rows = [{ current_month: '2026-10', month: null }];
    queryRaw.mockResolvedValue(rows);
    await expect(repository.findMonths(PERFORMANCE_USER_ID)).resolves.toEqual(
      rows,
    );
    const [strings, ...values] = queryRaw.mock.calls[0];
    const sql = strings.join('?');
    expect(values).toEqual([[PERFORMANCE_USER_ID]]);
    expect(sql).toContain('s.id_consultor = ANY(?::uuid[])');
    expect(sql).toContain("now() AT TIME ZONE 'America/Sao_Paulo'");
    expect(sql).toContain('ORDER BY month DESC');
    expect(sql).toContain(
      'LEFT JOIN analytics.tbl_snapshot_remuneracao_parceiro_mes',
    );
  });

  it('vincula mês e usuário como parâmetros, sem interpolar seus valores no SQL', async () => {
    const row = performanceRow();
    queryRaw.mockResolvedValue([row]);
    const month = "2026-09'; SELECT 1";
    await expect(
      repository.findPerformance(PERFORMANCE_USER_ID, month),
    ).resolves.toEqual(row);
    const [strings, ...values] = queryRaw.mock.calls[0];
    const sql = strings.join('?');
    expect(values).toEqual([month, PERFORMANCE_USER_ID]);
    expect(sql).toContain('?::text');
    expect(sql).toContain('s.id_consultor = ?::uuid');
    expect(sql).toContain('s.taxa_media_bonus');
    expect(sql).toContain('s.valor_fixo_mensal');
    expect(sql).toContain('s.valor_bonus_desembolso');
    expect(sql).toContain('s.valor_bonus_taxa');
    expect(sql).toContain('s.valor_bonus_risco');
    expect(sql).toContain('s.valor_acordos');
    expect(sql).toContain('s.valor_bonus_producao');
    expect(sql).toContain('s.valor_bonus_reembolso');
    expect(sql).toContain('s.valor_remuneracao_total');
    expect(sql).toContain('s.pct_inadimplencia_bonus');
    expect(sql).not.toContain(month);
    expect(sql).not.toContain('SELECT *');
    expect(sql).toContain('analytics.tbl_snapshot_remuneracao_parceiro_mes');
    expect(sql).not.toContain('vw_metric_remuneracao_parceiro_mes');
    expect(sql).not.toContain('situacao_competencia');
    expect(sql).not.toContain('data_hora_foto');
    expect(sql).toContain(
      "s.data_competencia = (reference.requested_month || '-01')::date",
    );
    expect(sql).not.toContain('partner_enrollments');
  });

  it('usa null no mês omitido para o banco escolher a referência em Brasília', async () => {
    queryRaw.mockResolvedValue([
      performanceRow({ requested_month: '2026-10', id_consultor: null }),
    ]);
    await repository.findPerformance(PERFORMANCE_USER_ID);
    const [, ...values] = queryRaw.mock.calls[0];
    expect(values).toEqual([null, PERFORMANCE_USER_ID]);
  });

  it('propaga a falha de consulta para o serviço traduzir em 503', async () => {
    queryRaw.mockRejectedValue(new Error('read connection failed'));
    await expect(
      repository.findPerformance(PERFORMANCE_USER_ID),
    ).rejects.toThrow('read connection failed');
  });
});

it('recusa mais de uma linha para o mesmo parceiro e competência', async () => {
  const repository = new PerformanceRepository({
    $queryRaw: jest
      .fn()
      .mockResolvedValue([performanceRow(), performanceRow()]),
  } as unknown as PrismaService);
  await expect(
    repository.findPerformance(PERFORMANCE_USER_ID, '2026-09'),
  ).rejects.toThrow('duplicate_performance_rows');
});

describe('Snapshots de parceiros e equipes', () => {
  function build(rows: unknown[] = []) {
    const queryRaw = jest
      .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
      .mockResolvedValue(rows);
    return {
      queryRaw,
      repository: new PerformanceRepository({
        $queryRaw: queryRaw,
      } as unknown as PrismaService),
    };
  }
  it('restringe parceiros aos IDs autorizados e à competência selecionada', async () => {
    const { queryRaw, repository } = build();
    await repository.findPartners([PERFORMANCE_USER_ID], '2026-10');
    const [strings, ...values] = queryRaw.mock.calls[0];
    expect(values).toEqual([[PERFORMANCE_USER_ID], '2026-10']);
    expect(strings.join('?')).toContain('s.id_consultor = ANY(?::uuid[])');
    expect(strings.join('?')).toContain('s.data_competencia =');
  });
  it('inclui a hierarquia e os integrantes históricos do snapshot sem exigir permissão de acesso dos integrantes', async () => {
    const { queryRaw, repository } = build();
    await repository.findTeam(
      PERFORMANCE_USER_ID,
      [PERFORMANCE_USER_ID, 'member'],
      '2026-10',
    );
    const [strings, ...values] = queryRaw.mock.calls[0];
    expect(values).toEqual([
      '2026-10',
      [PERFORMANCE_USER_ID, 'member'],
      PERFORMANCE_USER_ID,
    ]);
    const sql = strings.join('?');
    expect(sql).toContain('UNION');
    expect(sql).toContain('tbl_snapshot_remuneracao_equipe_mes');
    expect(sql).not.toContain('flag_ativo = true');
    expect(sql).not.toContain('permissions');
  });
  it('vincula titular, integrante e mês separadamente na consulta individual', async () => {
    const { queryRaw, repository } = build();
    await expect(
      repository.findIndividual(PERFORMANCE_USER_ID, 'member', '2026-10'),
    ).resolves.toBeUndefined();
    const [strings, ...values] = queryRaw.mock.calls[0];
    expect(values).toEqual([PERFORMANCE_USER_ID, 'member', '2026-10']);
    expect(strings.join('?')).toContain('e.id_parceiro = ?::uuid');
    expect(strings.join('?')).toContain('e.id_pessoa_equipe = ?::uuid');
  });
  it('recusa duplicidade no detalhe em vez de escolher uma linha ou somar números', async () => {
    const { repository } = build([{}, {}]);
    await expect(
      repository.findIndividual(PERFORMANCE_USER_ID, 'member', '2026-10'),
    ).rejects.toThrow('duplicate_performance_team_rows');
  });
});
