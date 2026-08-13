import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toNum } from '../common/query.util';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsQueryDto } from './dto/contracts-query.dto';
import { ContractListRow } from './interfaces/contracts-row.interface';
import {
  ContractListItem,
  ContractsPage,
} from './interfaces/contracts-list.interface';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista contratos em que o usuário é diretamente consultor ou agente de
   * cobrança. Não há expansão da hierarquia, mesmo para permissões globais.
   */
  async getContracts(
    userId: string,
    query: ContractsQueryDto = new ContractsQueryDto(),
  ): Promise<ContractsPage> {
    const { page, limit } = query;
    const whereClause = this.buildWhereClause(userId, query);
    const [countRow] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total
      FROM public.contracts c
      JOIN public.clients cl ON cl.id = c.client_id
      WHERE ${whereClause}
    `;
    const total = toNum(countRow?.total);
    const totalPages = Math.ceil(total / limit);
    if (total === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      };
    }

    const offset = (page - 1) * limit;
    const rows = await this.prisma.$queryRaw<ContractListRow[]>`
      SELECT
        c.id,
        c.contract_number,
        cl.name AS client_name,
        comp.name AS company_name,
        consultant.full_name AS consultant_name,
        COALESCE(fp.product_name, 'SEM_PRODUTO') AS product_name,
        c.total_amount AS disbursed_amount,
        c.total_with_iof AS projected_amount,
        COALESCE(open_installments.outstanding_balance, 0) AS outstanding_balance,
        c.total_installments,
        c.disbursement_date,
        next_open_installment.id AS next_installment_id,
        next_open_installment.due_date AS next_due_date
      FROM public.contracts c
      JOIN public.clients cl ON cl.id = c.client_id
      LEFT JOIN public.companies comp ON comp.id = c.company_id
      LEFT JOIN public.trigo_users consultant ON consultant.id = c.consultant_id
      LEFT JOIN public.quotes q ON q.id = c.quote_id
      LEFT JOIN public.finance_products fp ON fp.id = q.finance_product_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(i.pending_amount) FILTER (
            WHERE i.status IN ('not_paid', 'partially_paid')
          ), 0) AS outstanding_balance
        FROM public.installments i
        WHERE i.contract_id = c.id
      ) open_installments ON true
      LEFT JOIN LATERAL (
        SELECT i.id, i.due_date
        FROM public.installments i
        WHERE i.contract_id = c.id
          AND i.status IN ('not_paid', 'partially_paid')
        ORDER BY i.due_date ASC, i.installment_number ASC, i.id ASC
        LIMIT 1
      ) next_open_installment ON true
      WHERE ${whereClause}
      ORDER BY c.disbursement_date DESC NULLS LAST, c.created_at DESC, c.id
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      items: rows.map((row) => this.mapItem(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  }

  private mapItem(row: ContractListRow): ContractListItem {
    return {
      id: row.id,
      contractNumber: row.contract_number,
      clientName: row.client_name,
      companyName: row.company_name ?? undefined,
      consultantName: row.consultant_name ?? undefined,
      productName: row.product_name ?? 'SEM_PRODUTO',
      disbursedAmount: toNum(row.disbursed_amount),
      projectedAmount: toNum(row.projected_amount),
      outstandingBalance: toNum(row.outstanding_balance),
      totalInstallments: Number(row.total_installments),
      disbursementDate: row.disbursement_date ?? undefined,
      nextInstallmentId: row.next_installment_id ?? undefined,
      nextDueDate: row.next_due_date ?? undefined,
    };
  }

  /** Condições compartilhadas pelo total e pela página de resultados. */
  private buildWhereClause(
    userId: string,
    query: ContractsQueryDto,
  ): Prisma.Sql {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('start_date_must_be_before_end_date');
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`(
      c.consultant_id = ${userId}::uuid
      OR c.current_collection_agent_id = ${userId}::uuid
    )`,
      // RN02: Empresa fixa em CELCOIN no portal do parceiro.
      Prisma.sql`EXISTS (
        SELECT 1
        FROM public.companies celcoin_company
        WHERE celcoin_company.id = c.company_id
          AND UPPER(celcoin_company.name) = 'CELCOIN'
      )`,
    ];
    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(Prisma.sql`(
        cl.name ILIKE ${pattern}
        OR c.contract_number ILIKE ${pattern}
      )`);
    }
    if (query.products && query.products.length > 0) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM public.quotes product_quote
        WHERE product_quote.id = c.quote_id
          AND product_quote.finance_product_id = ANY(${query.products}::uuid[])
      )`);
    }
    if (query.startDate) {
      conditions.push(
        Prisma.sql`c.disbursement_date >= ${query.startDate}::date`,
      );
    }
    if (query.endDate) {
      conditions.push(
        Prisma.sql`c.disbursement_date <= ${query.endDate}::date`,
      );
    }
    if (query.onlyActive) {
      // Mesma fonte do KPI Contratos Ativos / Carteira Ativa.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM analytics.vw_fato_parcela active_fato
        WHERE active_fato.id_contrato = c.id
          AND active_fato.valor_pendente > 0
      )`);
    }
    if (query.onlyDelinquency) {
      // Mesma fonte do KPI de inadimplência (Regra do Vagão / contribuição > 0).
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM analytics.vw_fato_parcela delinquent_fato
        WHERE delinquent_fato.id_contrato = c.id
          AND delinquent_fato.valor_contribuicao_inadimplencia > 0
      )`);
    }
    if (query.onlyRenegotiated) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM public.renegotiations r
        WHERE r.contract_id = c.id
      )`);
    }

    return Prisma.join(conditions, ' AND ');
  }
}
