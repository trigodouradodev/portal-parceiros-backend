import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  PortfolioDashboard,
  RenewalMonthBucket,
} from './interfaces/portfolio-dashboard.interface';
import { MonthPerformance } from './interfaces/month-performance.interface';

/** Status de contrato que compõem a carteira ativa. */
const PORTFOLIO_CONTRACT_STATUSES = ['disbursed', 'active'];
/** Status de contrato considerados originação do mês (desembolsado válido). */
const ORIGINATION_CONTRACT_STATUSES = ['disbursed', 'closed'];
/** Status de parcela considerados "em aberto". */
const OPEN_INSTALLMENT_STATUSES = ['not_paid', 'partially_paid'];

const EMPTY_DASHBOARD: PortfolioDashboard = {
  activeContracts: 0,
  dueTodayContracts: 0,
  overdueContracts: 0,
  upcomingRenewals: { total: 0, byMonth: [] },
};

interface KpiRow {
  active: bigint;
  due_today: bigint;
  overdue: bigint;
}

interface RenewalRow {
  month: string;
  count: bigint;
}

interface PerformanceRow {
  month: string;
  origination_count: bigint;
  origination_amount: Prisma.Decimal | string | number;
  avg_rate: Prisma.Decimal | string | number | null;
  renewal_count: bigint;
}

interface DelinquencyRow {
  overdue_pending: Prisma.Decimal | string | number;
  open_pending: Prisma.Decimal | string | number;
}

/** Coerção robusta de valores numéricos do $queryRaw (Decimal/string/bigint). */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  return Number(value);
}

/** Mês corrente 'YYYY-MM' (fallback quando não há ida ao banco). */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function emptyPerformance(): MonthPerformance {
  return {
    month: currentMonth(),
    origination: { count: 0, amount: 0 },
    averageRate: null,
    delinquency: { rate: 0, overdueAmount: 0, portfolioOpenAmount: 0 },
    renewals: 0,
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * KPIs de carteira para o Resumo Home:
   *   - activeContracts: contratos disbursed/active com parcela em aberto
   *   - dueTodayContracts: idem com parcela em aberto vencendo hoje
   *   - overdueContracts: idem com parcela em aberto vencida (due_date < hoje)
   *   - upcomingRenewals: contratos cuja última parcela vence nos próximos
   *     4 meses, agrupados por mês
   *
   * Scope: ROLE_ADMIN ou INSTALLMENT_VIEW_ALL veem toda a carteira. Caso
   * contrário, restringe a contratos da árvore de hierarquia do viewer
   * (consultant_id OU current_collection_agent_id na árvore). Viewer sem
   * árvore → dashboard zerado.
   */
  async getDashboard(viewer: ScopeViewer): Promise<PortfolioDashboard> {
    const scopeClause = await this.buildScopeClause(viewer);
    if (scopeClause === null) return EMPTY_DASHBOARD;

    const statuses = Prisma.join(PORTFOLIO_CONTRACT_STATUSES);
    const openStatuses = Prisma.join(OPEN_INSTALLMENT_STATUSES);

    // KPIs 1-3 em uma única passada: agrega por contrato e conta via FILTER.
    const [kpis] = await this.prisma.$queryRaw<KpiRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE has_open)  AS active,
        COUNT(*) FILTER (WHERE due_today) AS due_today,
        COUNT(*) FILTER (WHERE overdue)   AS overdue
      FROM (
        SELECT
          c.id,
          bool_or(i.status IN (${openStatuses})) AS has_open,
          bool_or(
            i.due_date = CURRENT_DATE AND i.status IN (${openStatuses})
          ) AS due_today,
          bool_or(
            i.due_date < CURRENT_DATE AND i.status IN (${openStatuses})
          ) AS overdue
        FROM contracts c
        JOIN installments i ON i.contract_id = c.id
        WHERE c.status IN (${statuses})
          AND ${scopeClause}
        GROUP BY c.id
      ) t
    `;

    // Renovações: última parcela (MAX due_date) por contrato dentro da janela
    // de 4 meses (mês atual + 3), agrupada por mês de vencimento.
    const renewals = await this.prisma.$queryRaw<RenewalRow[]>`
      SELECT to_char(last_due, 'YYYY-MM') AS month, COUNT(*) AS count
      FROM (
        SELECT c.id, MAX(i.due_date) AS last_due
        FROM contracts c
        JOIN installments i ON i.contract_id = c.id
        WHERE c.status IN (${statuses})
          AND ${scopeClause}
        GROUP BY c.id
      ) t
      WHERE last_due >= date_trunc('month', CURRENT_DATE)
        AND last_due <  date_trunc('month', CURRENT_DATE) + INTERVAL '4 months'
      GROUP BY 1
      ORDER BY 1
    `;

    const byMonth: RenewalMonthBucket[] = renewals.map((row) => ({
      month: row.month,
      count: Number(row.count),
    }));

    return {
      activeContracts: Number(kpis?.active ?? 0),
      dueTodayContracts: Number(kpis?.due_today ?? 0),
      overdueContracts: Number(kpis?.overdue ?? 0),
      upcomingRenewals: {
        total: byMonth.reduce((acc, bucket) => acc + bucket.count, 0),
        byMonth,
      },
    };
  }

  /**
   * "Meu Desempenho do Mês" — KPIs do mês corrente sobre a carteira do viewer
   * (mesmo scope de hierarquia do dashboard):
   *   - origination: contratos desembolsados no mês (qtd + soma total_amount)
   *   - averageRate: média simples da interest_rate (loan_terms) desses contratos
   *   - delinquency: % de inadimplência da carteira (snapshot atual) pela
   *     regra de arrasto — atraso > 30d soma o saldo devedor total do
   *     contrato; atraso 1–30d soma só as parcelas vencidas; ÷ saldo aberto
   *   - renewals: contratos do mês de clientes que já tiveram contrato 'closed'
   *
   * Viewer sem árvore → desempenho zerado.
   */
  async getMonthPerformance(viewer: ScopeViewer): Promise<MonthPerformance> {
    const scopeClause = await this.buildScopeClause(viewer);
    if (scopeClause === null) return emptyPerformance();

    const statuses = Prisma.join(PORTFOLIO_CONTRACT_STATUSES);
    const openStatuses = Prisma.join(OPEN_INSTALLMENT_STATUSES);
    const originationStatuses = Prisma.join(ORIGINATION_CONTRACT_STATUSES);

    // Originação + taxa média + renovações: tudo sobre os contratos
    // desembolsados no mês corrente (status disbursed/closed). Renovação =
    // cliente com contrato 'closed'.
    const [perf] = await this.prisma.$queryRaw<PerformanceRow[]>`
      SELECT
        to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM') AS month,
        COUNT(*)                          AS origination_count,
        COALESCE(SUM(c.total_amount), 0)  AS origination_amount,
        AVG(lt.interest_rate)             AS avg_rate,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM contracts prev
          WHERE prev.client_id = c.client_id
            AND prev.id <> c.id
            AND prev.status = 'closed'
        ))                                AS renewal_count
      FROM contracts c
      JOIN loan_terms lt ON lt.id = c.loan_terms_id
      WHERE c.status IN (${originationStatuses})
        AND c.disbursement_date >= date_trunc('month', CURRENT_DATE)
        AND c.disbursement_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        AND ${scopeClause}
    `;

    // Inadimplência (snapshot atual da carteira disbursed/active) com a
    // "regra de arrasto" (híbrida), calculada por contrato:
    //   - max_aging = maior atraso (dias) entre parcelas em aberto e vencidas
    //   - max_aging > 30  → arrasto: saldo devedor TOTAL do contrato (todas as
    //     parcelas em aberto, vencidas + a vencer)
    //   - 1 <= max_aging <= 30 → apenas o saldo das parcelas vencidas
    //   - sem atraso → 0
    // Saldo = total_amount - total_paid (espelha a view bi do dashboard de
    // referência; NÃO usa pending_amount, que pondera desconto/pagto em curso).
    // Denominador = saldo em aberto de toda a carteira.
    const [delq] = await this.prisma.$queryRaw<DelinquencyRow[]>`
      WITH per_contract AS (
        SELECT
          c.id,
          MAX(
            CASE
              WHEN i.status IN (${openStatuses}) AND i.due_date < CURRENT_DATE
              THEN CURRENT_DATE - i.due_date
              ELSE 0
            END
          ) AS max_aging,
          COALESCE(SUM(
            CASE
              WHEN i.status IN (${openStatuses})
              THEN i.total_amount - i.total_paid
              ELSE 0
            END
          ), 0) AS open_balance,
          COALESCE(SUM(
            CASE
              WHEN i.status IN (${openStatuses}) AND i.due_date < CURRENT_DATE
              THEN i.total_amount - i.total_paid
              ELSE 0
            END
          ), 0) AS overdue_balance
        FROM contracts c
        JOIN installments i ON i.contract_id = c.id
        WHERE c.status IN (${statuses})
          AND ${scopeClause}
        GROUP BY c.id
      )
      SELECT
        COALESCE(SUM(
          CASE
            WHEN max_aging > 30 THEN open_balance
            WHEN max_aging >= 1 THEN overdue_balance
            ELSE 0
          END
        ), 0) AS overdue_pending,
        COALESCE(SUM(open_balance), 0) AS open_pending
      FROM per_contract
    `;

    const overdueAmount = toNum(delq?.overdue_pending);
    const portfolioOpenAmount = toNum(delq?.open_pending);
    const rate =
      portfolioOpenAmount > 0
        ? Math.round((overdueAmount / portfolioOpenAmount) * 10000) / 100
        : 0;

    return {
      month: perf?.month ?? currentMonth(),
      origination: {
        count: toNum(perf?.origination_count),
        amount: toNum(perf?.origination_amount),
      },
      // interest_rate é gravado em fração (ex.: 0.11 = 11%); ×100 e 2 casas.
      averageRate:
        perf?.avg_rate === null || perf?.avg_rate === undefined
          ? null
          : Math.round(toNum(perf.avg_rate) * 10000) / 100,
      delinquency: { rate, overdueAmount, portfolioOpenAmount },
      renewals: toNum(perf?.renewal_count),
    };
  }

  /**
   * Fragmento SQL do filtro de scope aplicado sobre `contracts c`
   * (ROLE_ADMIN / INSTALLMENT_VIEW_ALL veem tudo; sem árvore → `null`).
   * Delega ao `ScopeService.buildContractScopeSql` (lógica compartilhada).
   */
  private buildScopeClause(viewer: ScopeViewer): Promise<Prisma.Sql | null> {
    return this.scope.buildContractScopeSql(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
    ]);
  }
}
