import { Injectable } from '@nestjs/common';
import { toNum } from '../common/query.util';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioSnapshotRow } from './interfaces/portfolio-row.interface';
import { PortfolioSummary } from './interfaces/portfolio-summary.interface';


@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Os seis KPIs de carteira vêm de `analytics.vw_fato_parcela`. A ligação com
   * `public.contracts c` limita os dados ao usuário vinculado diretamente como
   * consultor ou agente de cobrança — sem escopo hierárquico em cascata.
   */
  async getSummary(userId: string): Promise<PortfolioSummary> {
    const snapshot = await this.findPortfolioSnapshot(userId);
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
    userId: string,
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
      WHERE (
        c.consultant_id = ${userId}::uuid
        OR c.current_collection_agent_id = ${userId}::uuid
      )
    `;
    return row;
  }
}
