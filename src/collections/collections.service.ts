import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import {
  ClientAddress,
  OverdueCollectionItem,
  OverdueCollectionPage,
} from './interfaces/overdue-collection.interface';
import {
  PreventiveCollectionPage,
  PreventiveContract,
} from './interfaces/preventive-collection.interface';
import {
  CollectionDetail,
  FollowUpHistoryItem,
} from './interfaces/collection-detail.interface';
import {
  ContractResponsible,
  ResponsibleType,
} from './interfaces/responsible.interface';

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
  consultant_id: string | null;
  consultant_name: string | null;
  collection_agent_id: string | null;
  collection_agent_name: string | null;
  company_name: string | null;
  task_id: string | null;
  task_stage_code: string | null;
  task_stage_badge_label: string | null;
  task_channel: string | null;
  task_status: string | null;
  task_created_at: Date | null;
  task_completed_at: Date | null;
}

interface UpcomingRow extends Omit<
  OverdueRow,
  | 'days_overdue'
  | 'task_id'
  | 'task_stage_code'
  | 'task_stage_badge_label'
  | 'task_channel'
  | 'task_status'
  | 'task_created_at'
  | 'task_completed_at'
> {
  days_until_due: number;
  followup_count: number;
  latest_followup_status: string | null;
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
   * Aba Cobrança: **uma linha por parcela vencida em aberto**, do mais atrasado
   * para o menos atrasado (parcelas do mesmo contrato podem se intercalar). Cada
   * linha traz a tarefa de cobrança (activity) pendente daquela parcela, quando
   * houver. Paginado por parcela.
   *
   * Carteira = contratos `disbursed`/`active`; parcela em aberto =
   * `not_paid`/`partially_paid` com `due_date < CURRENT_DATE`. Scope por
   * hierarquia (ROLE_ADMIN / INSTALLMENT_VIEW_ALL veem tudo; sem árvore →
   * página vazia sem ir ao banco).
   *
   * Obs: o shape do response foi mantido — `contracts`/`totalContracts`/
   * `firstOverdueInstallment` agora representam parcelas (1 row por parcela).
   */
  async getOverdue(
    viewer: ScopeViewer,
    page = 1,
    limit = 30,
  ): Promise<OverdueCollectionPage> {
    const emptyPage: OverdueCollectionPage = {
      items: [],
      pagination: {
        page,
        limit,
        total: 0,
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

    // Total de parcelas atrasadas (para paginação).
    const [countRow] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM installments i
      JOIN contracts c ON c.id = i.contract_id
      WHERE i.status IN (${openStatuses})
        AND i.due_date < CURRENT_DATE
        AND c.status IN (${statuses})
        AND ${scopeClause}
    `;
    const total = toNum(countRow?.total);
    if (total === 0) return emptyPage;

    const offset = (page - 1) * limit;

    // Uma linha por parcela atrasada (sem DISTINCT ON), do maior atraso para o
    // menor; `i.id` no ORDER BY garante paginação estável em empates. O LATERAL
    // traz a tarefa de cobrança pendente da parcela (no máx. 1, pela invariante).
    const rows = await this.prisma.$queryRaw<OverdueRow[]>`
      SELECT
        i.id,
        i.contract_id,
        i.installment_number,
        i.due_date,
        i.pending_amount,
        i.total_amount,
        i.status,
        (CURRENT_DATE - i.due_date)::int AS days_overdue,
        c.contract_number,
        c.total_installments,
        cl.name AS client_name,
        cl.tax_id AS client_tax_id,
        ${CLIENT_CONTACT_COLUMNS},
        c.consultant_id AS consultant_id,
        cons.full_name AS consultant_name,
        ca.id AS collection_agent_id,
        ca.full_name AS collection_agent_name,
        comp.name AS company_name,
        task.id AS task_id,
        task.stage_code AS task_stage_code,
        task.badge_label AS task_stage_badge_label,
        task.channel AS task_channel,
        task.status AS task_status,
        task.created_at AS task_created_at,
        task.completed_at AS task_completed_at
      FROM installments i
      JOIN contracts c ON c.id = i.contract_id
      JOIN clients cl ON cl.id = c.client_id
      ${CLIENT_ADDRESS_JOIN}
      LEFT JOIN trigo_users cons ON cons.id = c.consultant_id
      LEFT JOIN trigo_users ca ON ca.id = c.current_collection_agent_id
      LEFT JOIN companies comp ON comp.id = c.company_id
      LEFT JOIN LATERAL (
        SELECT at.id, at.stage_code, at.channel, at.status, at.created_at, at.completed_at, rs.badge_label
        FROM activity_tasks at
        LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
        WHERE at.installment_id = i.id
        ORDER BY at.created_at DESC
        LIMIT 1
      ) task ON true
      WHERE i.status IN (${openStatuses})
        AND i.due_date < CURRENT_DATE
        AND c.status IN (${statuses})
        AND ${scopeClause}
      ORDER BY days_overdue DESC, i.pending_amount DESC, i.id
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalPages = Math.ceil(total / limit);
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

  private mapItem(row: OverdueRow): OverdueCollectionItem {
    const totalInstallments = Number(row.total_installments ?? 0);
    const installmentNumber = Number(row.installment_number);

    return {
      installment: {
        id: row.id,
        number: installmentNumber,
        label: `${installmentNumber}/${totalInstallments}`,
        dueDate: row.due_date,
        daysOverdue: Number(row.days_overdue),
        pendingAmount: toNum(row.pending_amount),
        totalAmount: toNum(row.total_amount),
        status: row.status,
      },
      contract: {
        id: row.contract_id,
        number: row.contract_number,
        totalInstallments,
        companyName: row.company_name ?? undefined,
      },
      client: {
        name: row.client_name,
        taxId: row.client_tax_id,
        phone: row.client_phone ?? undefined,
        address: mapAddress(row),
      },
      task: this.getTask(row),
      responsible: this.getResponsible(row),
    };
  }

  private getResponsible(row: OverdueRow): ContractResponsible | undefined {
    if (!row?.consultant_id && !row?.collection_agent_id) return undefined;

    if (row?.collection_agent_id) {
      return {
        id: row.collection_agent_id,
        name: row.collection_agent_name ?? '',
        type: ResponsibleType.COLLECTION_AGENT,
      };
    }

    return {
      id: row.consultant_id || '',
      name: row.consultant_name ?? '',
      type: ResponsibleType.CONSULTANT,
    };
  }

  private getTask(row: OverdueRow) {
    if (!row?.task_id) return null;

    return {
      id: row.task_id,
      stageCode: row.task_stage_code ?? '',
      stageBadgeLabel: row.task_stage_badge_label ?? '',
      channel: row.task_channel ?? '',
      status: row.task_status ?? '',
      createdAt: row.task_created_at as Date,
      completedAt: row.task_completed_at ?? undefined,
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

  /**
   * Detalhe de um contrato a partir de uma parcela selecionada na lista de
   * Cobrança/Preventivo: dados do contrato (valor total, início/fim), da
   * parcela (valor, vencimento, posição X de Y) e o histórico de follow-up
   * registrado para essa parcela específica (mais recente primeiro).
   *
   * Scope: mesmo gating das listas — ROLE_ADMIN / INSTALLMENT_VIEW_ALL veem
   * qualquer contrato; os demais só os da própria árvore de hierarquia.
   * Fora do escopo ou inexistente → 404 (não revela existência).
   */
  async getDetail(
    viewer: ScopeViewer,
    contractId: string,
    installmentNumber: number,
  ): Promise<CollectionDetail> {
    const canView = await this.scope.canViewContract(contractId, viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
    ]);
    if (!canView) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      select: {
        contract_number: true,
        total_amount: true,
        total_installments: true,
        disbursement_date: true,
        clients: {
          select: {
            name: true,
            tax_id: true,
            phone: true,
            // Endereço primário; fallback para o mais recente (mesma regra das listas).
            addresses: {
              select: {
                street: true,
                number: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
                zip_code: true,
              },
              orderBy: [
                { is_primary: { sort: 'desc', nulls: 'last' } },
                { created_at: 'desc' },
              ],
              take: 1,
            },
          },
        },
        trigo_users_contracts_current_collection_agent_idTotrigo_users: {
          select: { id: true, full_name: true },
        },
        trigo_users_contracts_consultant_idTotrigo_users: {
          select: { id: true, full_name: true },
        },
      },
    });
    if (!contract) {
      throw new NotFoundException('Contrato não encontrado.');
    }

    const installment = await this.prisma.installments.findFirst({
      where: { contract_id: contractId, installment_number: installmentNumber },
      select: {
        id: true,
        installment_number: true,
        due_date: true,
        total_amount: true,
        pending_amount: true,
        status: true,
      },
    });
    if (!installment) {
      throw new NotFoundException('Parcela não encontrada para o contrato.');
    }

    // Fim do contrato = vencimento da última parcela.
    const lastInstallment = await this.prisma.installments.aggregate({
      where: { contract_id: contractId },
      _max: { due_date: true },
    });

    const followUps = await this.prisma.installment_followups.findMany({
      where: { contract_id: contractId, installment_number: installmentNumber },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        note: true,
        expected_result: true,
        payment_forecast: true,
        created_at: true,
        trigo_users: { select: { id: true, full_name: true } },
        geolocations: { select: { latitude: true, longitude: true } },
      },
    });

    // Cobrança: a régua (tasks) e as interações registradas dessa parcela.
    const tasks = await this.prisma.activity_tasks.findMany({
      where: { installment_id: installment.id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        stage_code: true,
        channel: true,
        status: true,
        created_at: true,
        completed_at: true,
        activity_ruler_stages: { select: { badge_label: true } },
      },
    });

    const interactions = await this.prisma.activity_interactions.findMany({
      where: { installment_id: installment.id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        channel: true,
        result: true,
        observation: true,
        promise_date: true,
        created_at: true,
        trigo_users: { select: { id: true, full_name: true } },
        geolocations: { select: { latitude: true, longitude: true } },
      },
    });

    const addr = contract.clients.addresses[0];
    // Responsável pela parcela: agente de cobrança; na ausência, cai para o
    // consultor do contrato. `type` indica a origem.
    const agent =
      contract.trigo_users_contracts_current_collection_agent_idTotrigo_users;
    const consultant =
      contract.trigo_users_contracts_consultant_idTotrigo_users;
    const responsibleUser = agent ?? consultant;
    const responsible = responsibleUser
      ? {
          id: responsibleUser.id,
          name: responsibleUser.full_name,
          type: agent
            ? ResponsibleType.COLLECTION_AGENT
            : ResponsibleType.CONSULTANT,
        }
      : undefined;

    const totalInstallments = Number(contract.total_installments ?? 0);

    return {
      contract: {
        id: contractId,
        number: contract.contract_number,
        totalInstallments,
        totalAmount: toNum(contract.total_amount),
        startDate: contract.disbursement_date ?? undefined,
        endDate: lastInstallment._max.due_date ?? undefined,
      },
      client: {
        name: contract.clients.name,
        taxId: contract.clients.tax_id,
        phone: contract.clients.phone ?? undefined,
        address: addr
          ? {
              street: addr.street,
              number: addr.number ?? '',
              complement: addr.complement ?? undefined,
              neighborhood: addr.neighborhood ?? '',
              city: addr.city ?? '',
              state: addr.state ?? undefined,
              zipCode: addr.zip_code ?? '',
            }
          : undefined,
      },
      responsible,
      installment: {
        id: installment.id,
        number: installmentNumber,
        label: `${installmentNumber}/${totalInstallments}`,
        dueDate: installment.due_date,
        totalAmount: toNum(installment.total_amount),
        pendingAmount: toNum(installment.pending_amount),
        status: installment.status,
      },
      activity: {
        tasks: tasks.map((t) => ({
          id: t.id,
          stageCode: t.stage_code,
          stageBadgeLabel: t.activity_ruler_stages?.badge_label ?? '',
          channel: t.channel,
          status: t.status,
          createdAt: t.created_at,
          completedAt: t.completed_at ?? undefined,
        })),
        interactions: interactions.map((i) => ({
          id: i.id,
          channel: i.channel,
          result: i.result,
          observation: i.observation ?? undefined,
          promiseDate: i.promise_date ?? undefined,
          createdAt: i.created_at,
          author: { id: i.trigo_users.id, name: i.trigo_users.full_name },
          geolocation: i.geolocations
            ? {
                latitude: toNum(i.geolocations.latitude),
                longitude: toNum(i.geolocations.longitude),
              }
            : undefined,
        })),
      },
      followups: followUps.map(
        (f): FollowUpHistoryItem => ({
          id: f.id,
          status: f.status,
          note: f.note ?? undefined,
          expectedResult: f.expected_result ?? undefined,
          paymentForecast: f.payment_forecast ?? undefined,
          createdAt: f.created_at,
          author: {
            id: f.trigo_users.id,
            name: f.trigo_users.full_name,
          },
          geolocation: f.geolocations
            ? {
                latitude: toNum(f.geolocations.latitude),
                longitude: toNum(f.geolocations.longitude),
              }
            : undefined,
        }),
      ),
    };
  }
}
