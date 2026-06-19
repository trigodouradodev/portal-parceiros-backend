import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  ClientAddress,
  OverdueCollectionPage,
  OverdueContract,
} from './interfaces/overdue-collection.interface';
import {
  PreventiveCollectionPage,
  PreventiveContract,
} from './interfaces/preventive-collection.interface';

/** Status de contrato que compõem a carteira em cobrança. */
const PORTFOLIO_CONTRACT_STATUSES = ['disbursed', 'active'];
/** Status de parcela considerados "em aberto". */
const OPEN_INSTALLMENT_STATUSES = ['not_paid', 'partially_paid'];

/**
 * Colunas de contato do cliente (telefone + endereço) para o SELECT. Assume os
 * aliases `cl` (clients) e `addr` (CLIENT_ADDRESS_JOIN) no escopo da query.
 */
const CLIENT_CONTACT_COLUMNS = Prisma.sql`
  cl.phone AS client_phone,
  addr.street AS addr_street,
  addr.number AS addr_number,
  addr.complement AS addr_complement,
  addr.neighborhood AS addr_neighborhood,
  addr.city AS addr_city,
  addr.state AS addr_state,
  addr.zip_code AS addr_zip_code
`;

/**
 * Join lateral do endereço do cliente: prioriza o endereço primário e, na
 * ausência de flag, cai para o mais recente. Assume o alias `cl` no escopo.
 */
const CLIENT_ADDRESS_JOIN = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT a.street, a.number, a.complement, a.neighborhood, a.city, a.state, a.zip_code
    FROM addresses a
    WHERE a.client_id = cl.id
    ORDER BY a.is_primary DESC NULLS LAST, a.created_at DESC
    LIMIT 1
  ) addr ON true
`;

interface OverdueRow {
  id: string;
  contract_id: string;
  installment_number: number;
  due_date: Date;
  pending_amount: Prisma.Decimal | string | number;
  total_amount: Prisma.Decimal | string | number;
  status: string;
  days_overdue: number;
  contract_number: string;
  total_installments: number;
  client_name: string;
  client_tax_id: string;
  client_phone: string | null;
  addr_street: string | null;
  addr_number: string | null;
  addr_complement: string | null;
  addr_neighborhood: string | null;
  addr_city: string | null;
  addr_state: string | null;
  addr_zip_code: string | null;
  consultant_name: string | null;
  collection_agent_id: string | null;
  collection_agent_name: string | null;
  company_name: string | null;
  followup_count: number;
  latest_followup_status: string | null;
}

interface UpcomingRow extends Omit<OverdueRow, 'days_overdue'> {
  days_until_due: number;
}

/** Coerção robusta de valores numéricos do $queryRaw (Decimal/string/bigint). */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  return Number(value);
}

/** Campos de endereço presentes em ambas as linhas (overdue e upcoming). */
type AddressRow = Pick<
  OverdueRow,
  | 'addr_street'
  | 'addr_number'
  | 'addr_complement'
  | 'addr_neighborhood'
  | 'addr_city'
  | 'addr_state'
  | 'addr_zip_code'
>;

/** Monta o endereço do cliente a partir da linha; undefined se não houver. */
function mapAddress(row: AddressRow): ClientAddress | undefined {
  if (!row.addr_street) return undefined;
  return {
    street: row.addr_street,
    number: row.addr_number ?? '',
    complement: row.addr_complement ?? undefined,
    neighborhood: row.addr_neighborhood ?? '',
    city: row.addr_city ?? '',
    state: row.addr_state ?? undefined,
    zipCode: row.addr_zip_code ?? '',
  };
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Aba Cobrança: contratos com parcela vencida em aberto, do mais atrasado
   * para o menos atrasado. Uma linha por contrato, representada pela parcela
   * vencida mais antiga (driver do atraso). Paginado.
   *
   * Carteira = contratos `disbursed`/`active`; parcela em aberto =
   * `not_paid`/`partially_paid` com `due_date < CURRENT_DATE`. Scope por
   * hierarquia (ROLE_ADMIN / INSTALLMENT_VIEW_ALL veem tudo; sem árvore →
   * página vazia sem ir ao banco).
   */
  async getOverdue(
    viewer: ScopeViewer,
    page = 1,
    limit = 30,
  ): Promise<OverdueCollectionPage> {
    const emptyPage: OverdueCollectionPage = {
      contracts: [],
      pagination: {
        page,
        limit,
        totalContracts: 0,
        totalPages: 0,
        hasNextPage: false,
      },
    };

    const scopeClause = await this.scope.buildContractScopeSql(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
    ]);
    if (scopeClause === null) return emptyPage;

    const statuses = Prisma.join(PORTFOLIO_CONTRACT_STATUSES);
    const openStatuses = Prisma.join(OPEN_INSTALLMENT_STATUSES);

    // Total de contratos atrasados (para paginação).
    const [countRow] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT i.contract_id)::int AS total
      FROM installments i
      JOIN contracts c ON c.id = i.contract_id
      WHERE i.status IN (${openStatuses})
        AND i.due_date < CURRENT_DATE
        AND c.status IN (${statuses})
        AND ${scopeClause}
    `;
    const totalContracts = toNum(countRow?.total);
    if (totalContracts === 0) return emptyPage;

    const offset = (page - 1) * limit;

    // first_overdue: parcela vencida mais antiga por contrato (DISTINCT ON
    // ordenado por due_date asc). A página externa reordena pelo maior atraso.
    const rows = await this.prisma.$queryRaw<OverdueRow[]>`
      WITH first_overdue AS (
        SELECT DISTINCT ON (i.contract_id)
          i.id,
          i.contract_id,
          i.installment_number,
          i.due_date,
          i.pending_amount,
          i.total_amount,
          i.status,
          (CURRENT_DATE - i.due_date)::int AS days_overdue
        FROM installments i
        JOIN contracts c ON c.id = i.contract_id
        WHERE i.status IN (${openStatuses})
          AND i.due_date < CURRENT_DATE
          AND c.status IN (${statuses})
          AND ${scopeClause}
        ORDER BY i.contract_id, i.due_date ASC, i.installment_number ASC
      )
      SELECT
        fo.id,
        fo.contract_id,
        fo.installment_number,
        fo.due_date,
        fo.pending_amount,
        fo.total_amount,
        fo.status,
        fo.days_overdue,
        c.contract_number,
        c.total_installments,
        cl.name AS client_name,
        cl.tax_id AS client_tax_id,
        ${CLIENT_CONTACT_COLUMNS},
        cons.full_name AS consultant_name,
        ca.id AS collection_agent_id,
        ca.full_name AS collection_agent_name,
        comp.name AS company_name,
        (
          SELECT COUNT(*)::int
          FROM installment_followups f
          WHERE f.contract_id = fo.contract_id
            AND f.installment_number = fo.installment_number
        ) AS followup_count,
        (
          SELECT f.status
          FROM installment_followups f
          WHERE f.contract_id = fo.contract_id
            AND f.installment_number = fo.installment_number
          ORDER BY f.created_at DESC
          LIMIT 1
        ) AS latest_followup_status
      FROM first_overdue fo
      JOIN contracts c ON c.id = fo.contract_id
      JOIN clients cl ON cl.id = c.client_id
      ${CLIENT_ADDRESS_JOIN}
      LEFT JOIN trigo_users cons ON cons.id = c.consultant_id
      LEFT JOIN trigo_users ca ON ca.id = c.current_collection_agent_id
      LEFT JOIN companies comp ON comp.id = c.company_id
      ORDER BY fo.days_overdue DESC, fo.pending_amount DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalPages = Math.ceil(totalContracts / limit);
    return {
      contracts: rows.map((row) => this.mapRow(row)),
      pagination: {
        page,
        limit,
        totalContracts,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  }

  private mapRow(row: OverdueRow): OverdueContract {
    return {
      contractId: row.contract_id,
      contractNumber: row.contract_number,
      totalInstallments: Number(row.total_installments ?? 0),
      clientName: row.client_name,
      clientTaxId: row.client_tax_id,
      clientPhone: row.client_phone ?? undefined,
      address: mapAddress(row),
      consultantName: row.consultant_name ?? undefined,
      companyName: row.company_name ?? undefined,
      collectionAgent: row.collection_agent_id
        ? {
            id: row.collection_agent_id,
            name: row.collection_agent_name ?? '',
          }
        : undefined,
      firstOverdueInstallment: {
        id: row.id,
        installmentNumber: Number(row.installment_number),
        dueDate: row.due_date,
        daysOverdue: Number(row.days_overdue),
        pendingAmount: toNum(row.pending_amount),
        totalAmount: toNum(row.total_amount),
        status: row.status,
        followupCount: Number(row.followup_count ?? 0),
        latestFollowupStatus: row.latest_followup_status ?? undefined,
      },
    };
  }

  /**
   * Aba Preventivo: contratos com parcela a vencer nos próximos `withinDays`
   * dias (default 15), do vencimento mais próximo para o mais distante. Uma
   * linha por contrato, representada pela próxima parcela a vencer. Paginado.
   *
   * Carteira = contratos `disbursed`/`active`; parcela em aberto =
   * `not_paid`/`partially_paid` com `due_date` entre hoje e hoje + N dias. Um
   * contrato com atraso também entra (pela próxima parcela a vencer), podendo
   * aparecer também na Cobrança. Mesmo scope do getOverdue.
   */
  async getPreventive(
    viewer: ScopeViewer,
    page = 1,
    limit = 30,
    withinDays = 15,
  ): Promise<PreventiveCollectionPage> {
    const emptyPage: PreventiveCollectionPage = {
      contracts: [],
      pagination: {
        page,
        limit,
        totalContracts: 0,
        totalPages: 0,
        hasNextPage: false,
      },
    };

    const scopeClause = await this.scope.buildContractScopeSql(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
    ]);
    if (scopeClause === null) return emptyPage;

    const statuses = Prisma.join(PORTFOLIO_CONTRACT_STATUSES);
    const openStatuses = Prisma.join(OPEN_INSTALLMENT_STATUSES);
    // Filtro de janela (parcela a vencer dentro de N dias), compartilhado entre
    // a query de contagem e a de página. Um contrato com atraso também entra
    // aqui pela sua próxima parcela a vencer (pode aparecer nas duas abas).
    const upcomingFilter = Prisma.sql`
      i.status IN (${openStatuses})
      AND i.due_date >= CURRENT_DATE
      AND i.due_date <= CURRENT_DATE + (${withinDays}::int * INTERVAL '1 day')
      AND c.status IN (${statuses})
      AND ${scopeClause}
    `;

    const [countRow] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT i.contract_id)::int AS total
      FROM installments i
      JOIN contracts c ON c.id = i.contract_id
      WHERE ${upcomingFilter}
    `;
    const totalContracts = toNum(countRow?.total);
    if (totalContracts === 0) return emptyPage;

    const offset = (page - 1) * limit;

    // next_upcoming: próxima parcela a vencer por contrato (DISTINCT ON
    // ordenado por due_date asc). A página externa ordena pelo vencimento
    // mais próximo.
    const rows = await this.prisma.$queryRaw<UpcomingRow[]>`
      WITH next_upcoming AS (
        SELECT DISTINCT ON (i.contract_id)
          i.id,
          i.contract_id,
          i.installment_number,
          i.due_date,
          i.pending_amount,
          i.total_amount,
          i.status,
          (i.due_date - CURRENT_DATE)::int AS days_until_due
        FROM installments i
        JOIN contracts c ON c.id = i.contract_id
        WHERE ${upcomingFilter}
        ORDER BY i.contract_id, i.due_date ASC, i.installment_number ASC
      )
      SELECT
        nu.id,
        nu.contract_id,
        nu.installment_number,
        nu.due_date,
        nu.pending_amount,
        nu.total_amount,
        nu.status,
        nu.days_until_due,
        c.contract_number,
        c.total_installments,
        cl.name AS client_name,
        cl.tax_id AS client_tax_id,
        ${CLIENT_CONTACT_COLUMNS},
        cons.full_name AS consultant_name,
        ca.id AS collection_agent_id,
        ca.full_name AS collection_agent_name,
        comp.name AS company_name,
        (
          SELECT COUNT(*)::int
          FROM installment_followups f
          WHERE f.contract_id = nu.contract_id
            AND f.installment_number = nu.installment_number
        ) AS followup_count,
        (
          SELECT f.status
          FROM installment_followups f
          WHERE f.contract_id = nu.contract_id
            AND f.installment_number = nu.installment_number
          ORDER BY f.created_at DESC
          LIMIT 1
        ) AS latest_followup_status
      FROM next_upcoming nu
      JOIN contracts c ON c.id = nu.contract_id
      JOIN clients cl ON cl.id = c.client_id
      ${CLIENT_ADDRESS_JOIN}
      LEFT JOIN trigo_users cons ON cons.id = c.consultant_id
      LEFT JOIN trigo_users ca ON ca.id = c.current_collection_agent_id
      LEFT JOIN companies comp ON comp.id = c.company_id
      ORDER BY nu.days_until_due ASC, nu.pending_amount DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalPages = Math.ceil(totalContracts / limit);
    return {
      contracts: rows.map((row) => this.mapUpcomingRow(row)),
      pagination: {
        page,
        limit,
        totalContracts,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  }

  private mapUpcomingRow(row: UpcomingRow): PreventiveContract {
    return {
      contractId: row.contract_id,
      contractNumber: row.contract_number,
      totalInstallments: Number(row.total_installments ?? 0),
      clientName: row.client_name,
      clientTaxId: row.client_tax_id,
      clientPhone: row.client_phone ?? undefined,
      address: mapAddress(row),
      consultantName: row.consultant_name ?? undefined,
      companyName: row.company_name ?? undefined,
      collectionAgent: row.collection_agent_id
        ? {
            id: row.collection_agent_id,
            name: row.collection_agent_name ?? '',
          }
        : undefined,
      nextInstallment: {
        id: row.id,
        installmentNumber: Number(row.installment_number),
        dueDate: row.due_date,
        daysUntilDue: Number(row.days_until_due),
        pendingAmount: toNum(row.pending_amount),
        totalAmount: toNum(row.total_amount),
        status: row.status,
        followupCount: Number(row.followup_count ?? 0),
        latestFollowupStatus: row.latest_followup_status ?? undefined,
      },
    };
  }
}
