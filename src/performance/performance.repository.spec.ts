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
    expect(values).toEqual([PERFORMANCE_USER_ID]);
    expect(sql).toContain('s.id_consultor = ?::uuid');
    expect(sql).toContain("now() AT TIME ZONE 'America/Sao_Paulo'");
    expect(sql).toContain('ORDER BY month DESC');
    expect(sql).toContain(
      'LEFT JOIN analytics.vw_metric_remuneracao_parceiro_mes',
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
    expect(sql).toContain('analytics.vw_metric_remuneracao_parceiro_mes');
    expect(sql).not.toContain('tbl_snapshot');
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
