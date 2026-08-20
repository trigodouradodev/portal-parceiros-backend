import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toNum } from '../common/query.util';
import { CollectionDetail } from '../collections/interfaces/collection-detail.interface';
import { CollectionsService } from '../collections/collections.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsQueryDto } from './dto/contracts-query.dto';
import { ContractListRow } from './interfaces/contracts-row.interface';
import {
  ContractListItem,
  ContractsPage,
} from './interfaces/contracts-list.interface';
import { ContractInstallmentRow } from './interfaces/contract-installment-row.interface';
import {
  ContractInstallmentDisplayStatus,
  ContractInstallmentItem,
  ContractInstallmentsList,
} from './interfaces/contract-installment.interface';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsService,
    private readonly scope: ScopeService,
  ) {}

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

  /**
   * Detalhe de um contrato da Carteira (AUREA-330): reaproveita o mesmo
   * detalhe rico do Preventivo/Cobrança (`CollectionsService.getDetail`).
   *
   * AUREA-346: aceita `installmentNumber` explícito (parcela escolhida na
   * lista de parcelas da Carteira) — nesse caso pula a auto-resolução e usa
   * ela direto (`CollectionsService.getDetail` já valida que a parcela
   * pertence ao contrato, 404 caso contrário). Sem o parâmetro, mantém o
   * comportamento original: resolve a parcela em aberto mais próxima do
   * vencimento e, se o contrato não tiver nenhuma aberta (ex.: já pago), cai
   * para a última parcela — cobre 100% dos contratos, diferente de expor o
   * id/número da próxima parcela na listagem (que falha pra contrato sem
   * parcela aberta).
   */
  async getContractDetail(
    viewer: ScopeViewer,
    contractId: string,
    installmentNumber?: number,
  ): Promise<CollectionDetail> {
    const resolvedInstallmentNumber =
      installmentNumber ??
      (await this.resolveDisplayInstallmentNumber(contractId));
    if (resolvedInstallmentNumber === null) {
      throw new NotFoundException('contract_without_installments');
    }
    return this.collections.getDetail(
      viewer,
      contractId,
      resolvedInstallmentNumber,
    );
  }

  /**
   * Todas as parcelas do contrato com status de exibição derivado (paga /
   * atrasada / vence hoje / a vencer) — AUREA-346. Alimenta a tela de lista
   * de parcelas da Carteira, de onde o consultor escolhe uma parcela real
   * pra ver o detalhe completo e registrar uma ação (follow-up).
   *
   * Mesmo gate de acesso do detalhe (ownership direto, sem árvore); fora do
   * escopo ou inexistente → 404 (não revela existência).
   */
  async getContractInstallments(
    viewer: ScopeViewer,
    contractId: string,
  ): Promise<ContractInstallmentsList> {
    const canView = await this.scope.canDirectlyViewContract(
      contractId,
      viewer.userId,
    );
    if (!canView) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const rows = await this.prisma.$queryRaw<ContractInstallmentRow[]>`
      SELECT
        i.installment_number,
        i.due_date,
        i.total_amount,
        i.pending_amount,
        i.payment_date,
        CASE
          WHEN i.status = 'paid' THEN 'paid'
          WHEN i.due_date < CURRENT_DATE THEN 'overdue'
          WHEN i.due_date = CURRENT_DATE THEN 'due_today'
          ELSE 'upcoming'
        END AS display_status,
        (CURRENT_DATE - i.due_date)::int AS days_overdue,
        (
          SELECT COUNT(*)::int
          FROM public.installment_followups f
          WHERE f.contract_id = i.contract_id
            AND f.installment_number = i.installment_number
        ) AS followups_count
      FROM public.installments i
      WHERE i.contract_id = ${contractId}::uuid
      ORDER BY i.installment_number ASC
    `;

    return { items: rows.map((row) => this.mapInstallmentRow(row)) };
  }

  /** Parcela em aberto mais próxima do vencimento; sem nenhuma aberta, a última. */
  private async resolveDisplayInstallmentNumber(
    contractId: string,
  ): Promise<number | null> {
    const [openRow] = await this.prisma.$queryRaw<
      { installment_number: number }[]
    >`
      SELECT installment_number
      FROM public.installments
      WHERE contract_id = ${contractId}::uuid
        AND status IN ('not_paid', 'partially_paid')
      ORDER BY due_date ASC, installment_number ASC
      LIMIT 1
    `;
    if (openRow) return Number(openRow.installment_number);

    const [lastRow] = await this.prisma.$queryRaw<
      { installment_number: number }[]
    >`
      SELECT installment_number
      FROM public.installments
      WHERE contract_id = ${contractId}::uuid
      ORDER BY installment_number DESC
      LIMIT 1
    `;
    return lastRow ? Number(lastRow.installment_number) : null;
  }

  private mapInstallmentRow(
    row: ContractInstallmentRow,
  ): ContractInstallmentItem {
    const displayStatus =
      row.display_status as ContractInstallmentDisplayStatus;
    // AUREA-346: atraso/follow-ups só fazem sentido pra parcela atrasada —
    // omitidos (em vez de 0) nas demais, pra não sugerir "0 dias de atraso".
    const isOverdue = displayStatus === 'overdue';
    return {
      number: Number(row.installment_number),
      dueDate: row.due_date,
      totalAmount: toNum(row.total_amount),
      pendingAmount: toNum(row.pending_amount),
      paymentDate: row.payment_date ?? undefined,
      displayStatus,
      daysOverdue: isOverdue ? Number(row.days_overdue) : undefined,
      followUpsCount: isOverdue ? Number(row.followups_count) : undefined,
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
