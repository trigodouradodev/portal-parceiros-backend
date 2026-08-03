import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { toNum } from '../common/query.util';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PortfolioSnapshotRow } from './interfaces/portfolio-row.interface';
import { PortfolioSummary } from './interfaces/portfolio-summary.interface';

const EMPTY_SUMMARY = (): PortfolioSummary => ({
  active: { outstandingAmount: 0, contracts: 0 },
  delinquency: { rate: 0, amount: 0, contracts: 0 },
  renegotiatedOutstandingAmount: 0,
});

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Os seis KPIs de carteira vêm de `analytics.vw_fato_parcela`. A ligação com
   * `public.contracts c` existe apenas para reaproveitar o mesmo escopo
   * hierárquico e RBAC dos módulos Activities e Collections.
   */
  async getSummary(viewer: ScopeViewer): Promise<PortfolioSummary> {
    const scopeClause = await this.scope.buildContractScopeSql(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
    ]);
    if (scopeClause === null) return EMPTY_SUMMARY();

    const snapshot = await this.findPortfolioSnapshot(scopeClause);
    const portfolioActiveAmount = toNum(snapshot?.portfolio_active_amount);
    const delinquencyAmount = toNum(snapshot?.delinquency_amount);

    return {
      active: {
        outstandingAmount: portfolioActiveAmount,
        contracts: toNum(snapshot?.active_contracts),
      },
      delinquency: {
        rate:
          portfolioActiveAmount > 0
            ? Math.round((delinquencyAmount / portfolioActiveAmount) * 10000) /
              100
            : 0,
        amount: delinquencyAmount,
        contracts: toNum(snapshot?.delinquent_contracts),
      },
      renegotiatedOutstandingAmount: toNum(
        snapshot?.renegotiated_outstanding_amount,
      ),
    };
  }

  private async findPortfolioSnapshot(
    scopeClause: Prisma.Sql,
  ): Promise<PortfolioSnapshotRow | undefined> {
    const [row] = await this.prisma.$queryRaw<PortfolioSnapshotRow[]>`
      SELECT
        COALESCE(SUM(p.valor_pendente) FILTER (
          WHERE p.valor_pendente > 0
        ), 0) AS portfolio_active_amount,
        COUNT(DISTINCT p.id_contrato) FILTER (
          WHERE p.valor_pendente > 0
        ) AS active_contracts,
        COALESCE(SUM(p.valor_contribuicao_inadimplencia), 0) AS delinquency_amount,
        COUNT(DISTINCT p.id_contrato) FILTER (
          WHERE p.valor_contribuicao_inadimplencia > 0
        ) AS delinquent_contracts,
        COALESCE(SUM(p.valor_pendente) FILTER (
          WHERE p.flag_renegociado AND p.valor_pendente > 0
        ), 0) AS renegotiated_outstanding_amount
      FROM analytics.vw_fato_parcela p
      JOIN public.contracts c ON c.id = p.id_contrato
      WHERE ${scopeClause}
    `;
    return row;
  }
}
