import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { toNum } from '../common/query.util';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import {
  OriginationRow,
  PortfolioSnapshotRow,
  ReceiptRow,
  SettledRow,
} from './interfaces/portfolio-row.interface';
import { PortfolioSummary } from './interfaces/portfolio-summary.interface';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const EMPTY_SUMMARY = (): PortfolioSummary => ({
  month: currentMonth(),
  active: { outstandingAmount: 0, contracts: 0 },
  delinquency: { rate: 0, amount: 0, contracts: 0 },
  renegotiatedOutstandingAmount: 0,
  origination: {
    amount: 0,
    contracts: 0,
    newClients: 0,
    renewedClients: 0,
    reactiveClients: 0,
  },
  settledContracts: 0,
  receipts: {
    currentMonthAmount: 0,
    scheduledCurrentMonthAmount: 0,
    advanceAmount: 0,
    lateAmount: 0,
  },
  averageRemainingNominalPerContract: 0,
  averageInterestRate: null,
});

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * KPIs executivos de carteira, todos derivados das views `analytics`.
   *
   * A carteira atual usa `vw_fato_parcela`; originação e taxa usam
   * `vw_fato_originacao`; recebimentos usam `vw_fato_recebimento`. Cada view
   * é ligada a `public.contracts c` apenas para reaproveitar, literalmente, o
   * mesmo escopo hierárquico e RBAC dos módulos Activities e Collections.
   */
  async getSummary(viewer: ScopeViewer): Promise<PortfolioSummary> {
    const scopeClause = await this.scope.buildContractScopeSql(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
    ]);
    if (scopeClause === null) return EMPTY_SUMMARY();

    const [snapshot, origination, receipts, settled] = await Promise.all([
      this.findPortfolioSnapshot(scopeClause),
      this.findMonthOrigination(scopeClause),
      this.findMonthReceipts(scopeClause),
      this.findMonthSettlements(scopeClause),
    ]);

    const portfolioActiveAmount = toNum(snapshot?.portfolio_active_amount);
    const delinquencyAmount = toNum(snapshot?.delinquency_amount);
    const activeContracts = toNum(snapshot?.active_contracts);
    const averageInterestRate = origination?.average_interest_rate;

    return {
      month: origination?.month ?? currentMonth(),
      active: {
        outstandingAmount: portfolioActiveAmount,
        contracts: activeContracts,
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
      origination: {
        amount: toNum(origination?.origination_amount),
        contracts: toNum(origination?.origination_contracts),
        newClients: toNum(origination?.new_clients),
        renewedClients: toNum(origination?.renewed_clients),
        reactiveClients: toNum(origination?.reactive_clients),
      },
      settledContracts: toNum(settled?.settled_contracts),
      receipts: {
        currentMonthAmount: toNum(receipts?.current_month_amount),
        scheduledCurrentMonthAmount: toNum(
          snapshot?.scheduled_current_month_amount,
        ),
        advanceAmount: toNum(receipts?.advance_amount),
        lateAmount: toNum(receipts?.late_amount),
      },
      averageRemainingNominalPerContract:
        activeContracts > 0
          ? Math.round((portfolioActiveAmount / activeContracts) * 100) / 100
          : 0,
      // A view guarda taxa como fração (0.1125); a API expõe percentual.
      averageInterestRate:
        averageInterestRate === null || averageInterestRate === undefined
          ? null
          : Math.round(toNum(averageInterestRate) * 10000) / 100,
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
        ), 0) AS renegotiated_outstanding_amount,
        COALESCE(SUM(p.valor_total_parcela) FILTER (
          WHERE p.data_vencimento >= date_trunc('month', CURRENT_DATE)
            AND p.data_vencimento < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        ), 0) AS scheduled_current_month_amount
      FROM analytics.vw_fato_parcela p
      JOIN public.contracts c ON c.id = p.id_contrato
      WHERE ${scopeClause}
    `;
    return row;
  }

  private async findMonthOrigination(
    scopeClause: Prisma.Sql,
  ): Promise<OriginationRow | undefined> {
    const [row] = await this.prisma.$queryRaw<OriginationRow[]>`
      SELECT
        to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM') AS month,
        COALESCE(SUM(o.valor_contrato), 0) AS origination_amount,
        COUNT(*) AS origination_contracts,
        COUNT(*) FILTER (WHERE o.flag_novo_cliente) AS new_clients,
        COUNT(*) FILTER (WHERE o.flag_renovado) AS renewed_clients,
        COUNT(*) FILTER (WHERE o.flag_cliente_reativo) AS reactive_clients,
        AVG(o.taxa_juros) AS average_interest_rate
      FROM analytics.vw_fato_originacao o
      JOIN public.contracts c ON c.id = o.id_contrato
      WHERE o.data_desembolso >= date_trunc('month', CURRENT_DATE)
        AND o.data_desembolso < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        AND ${scopeClause}
    `;
    return row;
  }

  private async findMonthReceipts(
    scopeClause: Prisma.Sql,
  ): Promise<ReceiptRow | undefined> {
    const [row] = await this.prisma.$queryRaw<ReceiptRow[]>`
      SELECT
        COALESCE(SUM(r.valor_recebido), 0) AS current_month_amount,
        COALESCE(SUM(r.valor_recebido) FILTER (
          WHERE r.classificacao_pagamento = 'PAGO_ANTECIPADO'
        ), 0) AS advance_amount,
        COALESCE(SUM(r.valor_recebido) FILTER (
          WHERE r.classificacao_pagamento = 'PAGO_COM_ATRASO'
        ), 0) AS late_amount
      FROM analytics.vw_fato_recebimento r
      JOIN public.contracts c ON c.id = r.id_contrato
      WHERE r.data_pagamento >= date_trunc('month', CURRENT_DATE)
        AND r.data_pagamento < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        AND ${scopeClause}
    `;
    return row;
  }

  private async findMonthSettlements(
    scopeClause: Prisma.Sql,
  ): Promise<SettledRow | undefined> {
    const [row] = await this.prisma.$queryRaw<SettledRow[]>`
      SELECT COUNT(*) AS settled_contracts
      FROM public.contracts c
      CROSS JOIN LATERAL (
        SELECT MAX(i.payment_date) AS last_payment_date
        FROM public.installments i
        WHERE i.contract_id = c.id
      ) last_payment
      WHERE c.status = 'closed'
        AND ${scopeClause}
        AND last_payment.last_payment_date >= date_trunc('month', CURRENT_DATE)
        AND last_payment.last_payment_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    `;
    return row;
  }
}
