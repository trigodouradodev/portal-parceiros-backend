import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, ScopeViewer } from '../scope/scope.service';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { RegisterInteractionDto } from './dto/register-interaction.dto';
import { RescheduleTaskDto } from './dto/reschedule-task.dto';
import { CreateFollowUpDto } from '../follow-up/dto/create-follow-up.dto';
import { FollowUpService } from '../follow-up/follow-up.service';
import {
  FollowUpExpectedResult,
  FollowUpParty,
  FollowUpType,
} from '../follow-up/enums/follow-up.enums';
import {
  ActivityChannel,
  ActivityInteractionResult,
  ActivityRecipientType,
  ActivityTaskStatus,
  ActivityTaskType,
  CHANNELS_BY_TASK_TYPE,
  PROMISE_MAX_DAYS,
  RESCHEDULE_MAX_DAYS,
  RESCHEDULE_MIN_DAYS,
  RESULTS_BY_TASK_TYPE,
} from './enums/activity.enums';
import {
  RegisterInteractionResult,
  TaskActionResult,
} from './interfaces/activity-interaction.interface';
import {
  InteractionRow,
  LockedTaskRow,
  QueueRow,
  TaskActionRow,
} from './interfaces/activity-row.interface';
import { SegmentSummary, TodayQueue } from './interfaces/task-queue.interface';
import { InstallmentDetail } from './interfaces/installment-detail.interface';
import { SubordinateOption } from './interfaces/subordinate-option.interface';
import { ResponsibleType } from '../collections/interfaces/responsible.interface';
import { toNum } from '../common/query.util';
import { daysOverdue } from './activities.util';
import {
  mapAddress,
  mapCard,
  mapGuarantor,
  mapInteraction,
  mapTaskAction,
} from './activities.mapper';

const ROLLOUT_PARTNER_ROLES = [
  PermissionKey.ROLE_CONSULTANT,
  PermissionKey.ROLE_COLLECTION_AGENT,
];

const ROLLOUT_OBSERVER_ROLES = [
  PermissionKey.ROLE_ADMIN,
  PermissionKey.ROLE_BACKOFFICE,
];

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly followUpService: FollowUpService,
  ) {}

  /**
   * Fila "Ações de hoje" da home, sempre de um único responsável: por padrão
   * o próprio viewer, ou um subordinado recursivo escolhido pelo filtro. A
   * árvore hierárquica só define quais responsáveis podem ser selecionados.
   *
   * Grupos: `active` = a tarefa RECOMENDADA do viewer (a de maior prioridade
   * `assigned_to` = ele). Desde AUREA-319, isso não é mais a única executável: toda
   * pendente do mesmo `segment_code` da recomendada também é (ver `isActive` nos
   * cards de `locked`) — a trava é só entre segmentos, dentro do segmento ativo o
   * usuário escolhe qual executar. `locked` = demais pendentes de hoje visíveis;
   * `scheduled` = postergadas/reagendadas; `completedToday` = concluídas hoje.
   * Ordem: prioridade do segmento, depois maior atraso.
   */
  async getTodayQueue(
    viewer: ScopeViewer,
    page = 1,
    limit = 30,
    assignedToId?: string,
  ): Promise<TodayQueue> {
    if (this.isRolloutObserver(viewer.permissions) && !assignedToId) {
      return this.emptyTodayQueue(page, limit);
    }
    const scopeClause = await this.scope.buildContractScopeSql(viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
      PermissionKey.ROLE_BACKOFFICE,
    ]);
    if (!scopeClause) {
      return this.emptyTodayQueue(page, limit);
    }
    const selectedAssigneeId = assignedToId ?? viewer.userId;
    const assigneeFilter = await this.buildAssigneeFilter(
      viewer,
      selectedAssigneeId,
    );

    const pendingToday = Prisma.sql`at.status = 'pending' AND at.expire_date <= CURRENT_DATE`;
    const order = Prisma.sql`ORDER BY rs.priority ASC NULLS LAST, days_overdue DESC, at.created_at ASC`;

    // active = a #1 executável do viewer (maior prioridade `assigned_to` = ele).
    const canHaveOwnActive = selectedAssigneeId === viewer.userId;
    const [activeRow] = canHaveOwnActive
      ? await this.fetchCards(
          scopeClause,
          Prisma.sql`AND ${pendingToday} ${assigneeFilter} AND at.assigned_to = ${viewer.userId}::uuid`,
          Prisma.sql`${order} LIMIT 1`,
          true,
        )
      : [];
    const activeId = activeRow?.task_id ?? null;
    const activeOffset = activeId ? 1 : 0;
    const notActive = activeId
      ? Prisma.sql`AND at.id <> ${activeId}::uuid`
      : Prisma.empty;

    // counter (total de hoje no escopo) e totalizadores por segmento (travadas).
    const counter = await this.countTasks(
      scopeClause,
      Prisma.sql`AND ${pendingToday} ${assigneeFilter}`,
    );
    const segments = await this.segmentCounts(
      scopeClause,
      Prisma.sql`AND ${pendingToday} ${assigneeFilter} ${notActive}`,
    );

    // locked = travadas paginadas no banco, com is_active por responsável.
    const offset = (page - 1) * limit;
    const lockedRows = await this.fetchLockedPage(
      scopeClause,
      activeId,
      limit,
      offset,
      assigneeFilter,
    );
    const lockedTotal = counter - activeOffset;
    const totalPages = Math.ceil(lockedTotal / limit);

    // scheduled (postergadas/reagendadas) e completedToday — listas cheias por ora.
    const scheduledRows = await this.fetchCards(
      scopeClause,
      Prisma.sql`AND at.status = 'pending' AND at.expire_date > CURRENT_DATE ${assigneeFilter}`,
      order,
      false,
    );
    const completedRows = await this.fetchCards(
      scopeClause,
      Prisma.sql`AND at.status = 'completed' AND at.completed_at::date = CURRENT_DATE ${assigneeFilter}`,
      order,
      false,
    );

    return {
      active: activeRow ? mapCard(activeRow, 1) : null,
      counter,
      segments,
      locked: {
        items: lockedRows.map((row, i) =>
          mapCard(row, activeOffset + offset + i + 1),
        ),
        pagination: {
          page,
          limit,
          total: lockedTotal,
          totalPages,
          hasNextPage: page < totalPages,
        },
      },
      scheduled: scheduledRows.map((row) => mapCard(row, 0)),
      completedToday: completedRows.map((row) => mapCard(row, 0)),
    };
  }

  async getSubordinates(viewer: ScopeViewer): Promise<SubordinateOption[]> {
    if (this.isRolloutObserver(viewer.permissions)) {
      return this.findRolloutPartners();
    }

    const scope = await this.scope.getViewerScopeIds(viewer.userId);
    const subordinateIds = scope.userIds.filter((id) => id !== viewer.userId);
    if (subordinateIds.length === 0) return [];

    const users = await this.prisma.trigo_users.findMany({
      where: { id: { in: subordinateIds }, is_deleted: false },
      select: { id: true, full_name: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
    return users.map((user) => ({ id: user.id, name: user.full_name }));
  }

  private emptyTodayQueue(page: number, limit: number): TodayQueue {
    return {
      active: null,
      counter: 0,
      segments: [],
      locked: {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      },
      scheduled: [],
      completedToday: [],
    };
  }

  private async buildAssigneeFilter(
    viewer: ScopeViewer,
    assignedToId: string,
  ): Promise<Prisma.Sql> {
    if (this.isRolloutObserver(viewer.permissions)) {
      const rolloutPartner = await this.findRolloutPartners(assignedToId);
      if (rolloutPartner.length === 0) {
        throw new ForbiddenException('assignee_outside_viewer_scope');
      }
      return Prisma.sql`AND at.assigned_to = ${assignedToId}::uuid`;
    }

    const scope = await this.scope.getViewerScopeIds(viewer.userId);
    if (!scope.userIds.includes(assignedToId)) {
      throw new ForbiddenException('assignee_outside_viewer_scope');
    }
    return Prisma.sql`AND at.assigned_to = ${assignedToId}::uuid`;
  }

  private isRolloutObserver(permissions: string[]): boolean {
    return ROLLOUT_OBSERVER_ROLES.some((role) => permissions.includes(role));
  }

  private async findRolloutPartners(
    userId?: string,
  ): Promise<SubordinateOption[]> {
    const users = await this.prisma.trigo_users.findMany({
      where: {
        ...(userId ? { id: userId } : {}),
        is_active: true,
        is_deleted: false,
        AND: [
          {
            trigo_group_members: {
              some: {
                trigo_groups: {
                  is_active: true,
                  is_deleted: false,
                  trigo_group_permissions: {
                    some: {
                      permissions: {
                        permission_key: PermissionKey.QUOTE_ACTIVITY_GATES,
                      },
                    },
                  },
                },
              },
            },
          },
          {
            trigo_group_members: {
              some: {
                trigo_groups: {
                  is_active: true,
                  is_deleted: false,
                  trigo_group_permissions: {
                    some: {
                      permissions: {
                        permission_key: { in: ROLLOUT_PARTNER_ROLES },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true, full_name: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
    return users.map((user) => ({ id: user.id, name: user.full_name }));
  }

  /**
   * Detalhe da PARCELA (por installmentId): contrato, cliente, responsável e o histórico
   * completo de tarefas da parcela — cada uma com a sua interação. Escopo por
   * hierarquia; admin, backoffice e INSTALLMENT_VIEW_ALL têm visão global. Fora
   * do escopo ou inexistente → 404 (não revela existência).
   */
  async getInstallmentDetail(
    installmentId: string,
    viewer: ScopeViewer,
  ): Promise<InstallmentDetail> {
    const installment = await this.prisma.installments.findUnique({
      where: { id: installmentId },
      select: {
        installment_number: true,
        due_date: true,
        total_amount: true,
        pending_amount: true,
        status: true,
        contract_id: true,
      },
    });
    if (!installment) throw new NotFoundException('installment_not_found');
    const contractId = installment.contract_id;
    if (!contractId) throw new NotFoundException('installment_not_found');

    const canView = await this.scope.canViewContract(contractId, viewer, [
      PermissionKey.INSTALLMENT_VIEW_ALL,
      PermissionKey.ROLE_BACKOFFICE,
    ]);
    if (!canView) throw new NotFoundException('installment_not_found');

    const contract = await this.prisma.contracts.findUnique({
      where: { id: contractId },
      select: {
        contract_number: true,
        total_amount: true,
        total_installments: true,
        disbursement_date: true,
        current_collection_agent_id: true,
        companies: { select: { name: true } },
        quotes: { select: { guarantor: true } },
        clients: {
          select: {
            name: true,
            tax_id: true,
            phone: true,
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
      },
    });
    if (!contract) throw new NotFoundException('installment_not_found');

    // Fim do contrato = vencimento da última parcela.
    const lastInstallment = await this.prisma.installments.aggregate({
      where: { contract_id: contractId },
      _max: { due_date: true },
    });

    // Histórico completo de tarefas da parcela, cada uma com a sua interação.
    const tasks = await this.prisma.activity_tasks.findMany({
      where: { installment_id: installmentId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        assigned_to: true,
        segment_code: true,
        task_type: true,
        status: true,
        created_by: true,
        expire_date: true,
        was_postponed: true,
        was_rescheduled: true,
        reschedule_count: true,
        created_at: true,
        completed_at: true,
        system_closed_at: true,
        cancelled_at: true,
        cancellation_reason: true,
        activity_ruler_stages: {
          select: { priority: true, tone: true, badge_label: true },
        },
        trigo_users_activity_tasks_assigned_toTotrigo_users: {
          select: { id: true, full_name: true },
        },
        activity_interactions: {
          select: {
            id: true,
            channel: true,
            recipient_type: true,
            result: true,
            promise_date: true,
            observation: true,
            created_at: true,
            trigo_users: { select: { id: true, full_name: true } },
            geolocations: { select: { latitude: true, longitude: true } },
          },
        },
      },
    });

    const totalInstallments = Number(contract.total_installments ?? 0);
    const instNumber = Number(installment.installment_number);
    // Responsável atual = assigned_to da tarefa mais recente.
    const latest = tasks[0];
    const assignee =
      latest?.trigo_users_activity_tasks_assigned_toTotrigo_users;

    return {
      installment: {
        id: installmentId,
        number: instNumber,
        label: `${instNumber}/${totalInstallments}`,
        dueDate: installment.due_date,
        daysOverdue: daysOverdue(installment.due_date),
        pendingAmount: toNum(installment.pending_amount),
        totalAmount: toNum(installment.total_amount),
        status: installment.status,
      },
      contract: {
        id: contractId,
        number: contract.contract_number,
        totalInstallments,
        totalAmount: toNum(contract.total_amount),
        startDate: contract.disbursement_date ?? undefined,
        endDate: lastInstallment._max.due_date ?? undefined,
        companyName: contract.companies?.name ?? undefined,
      },
      client: {
        name: contract.clients.name,
        taxId: contract.clients.tax_id,
        phone: contract.clients.phone ?? undefined,
        address: mapAddress(contract.clients.addresses[0]),
      },
      guarantor: mapGuarantor(contract.quotes?.guarantor),
      responsible: assignee
        ? {
            id: assignee.id,
            name: assignee.full_name,
            type:
              latest?.assigned_to === contract.current_collection_agent_id
                ? ResponsibleType.COLLECTION_AGENT
                : ResponsibleType.CONSULTANT,
          }
        : null,
      tasks: tasks.map((t) => ({
        id: t.id,
        segmentCode: t.segment_code,
        segmentBadgeLabel: t.activity_ruler_stages?.badge_label ?? undefined,
        priority: Number(t.activity_ruler_stages?.priority ?? 0),
        tone: t.activity_ruler_stages?.tone ?? '',
        taskType: t.task_type,
        status: t.status,
        createdBy: t.created_by,
        expireDate: t.expire_date,
        wasPostponed: t.was_postponed,
        wasRescheduled: t.was_rescheduled,
        rescheduleCount: t.reschedule_count,
        createdAt: t.created_at,
        completedAt: t.completed_at ?? undefined,
        systemClosedAt: t.system_closed_at ?? undefined,
        cancelledAt: t.cancelled_at ?? undefined,
        cancellationReason: t.cancellation_reason ?? undefined,
        interaction: t.activity_interactions
          ? {
              id: t.activity_interactions.id,
              channel: t.activity_interactions.channel,
              recipientType: t.activity_interactions.recipient_type,
              result: t.activity_interactions.result,
              promiseDate: t.activity_interactions.promise_date ?? undefined,
              observation: t.activity_interactions.observation ?? undefined,
              createdAt: t.activity_interactions.created_at,
              author: {
                id: t.activity_interactions.trigo_users.id,
                name: t.activity_interactions.trigo_users.full_name,
              },
              geolocation: t.activity_interactions.geolocations
                ? {
                    latitude: toNum(
                      t.activity_interactions.geolocations.latitude,
                    ),
                    longitude: toNum(
                      t.activity_interactions.geolocations.longitude,
                    ),
                  }
                : undefined,
            }
          : null,
      })),
    };
  }

  /**
   * Query enriquecida dos cards (active/scheduled/completed), parametrizada por filtro
   * e ordenação. `isActive`/`isRecommended` são literais aqui: a recomendada do viewer
   * é true nos dois; scheduled/completed false nos dois (não fazem parte da fila do dia).
   * O `assigned_to` (id + nome) sai junto p/ Gerente/Diretor verem o responsável.
   */
  private fetchCards(
    scopeClause: Prisma.Sql,
    filter: Prisma.Sql,
    orderLimit: Prisma.Sql,
    isActive: boolean,
  ): Promise<QueueRow[]> {
    return this.prisma.$queryRaw<QueueRow[]>`
      SELECT
        at.id AS task_id, at.segment_code, at.task_type, at.status,
        ${isActive}::boolean AS is_active,
        ${isActive}::boolean AS is_recommended,
        at.assigned_to AS assigned_to_id, u.full_name AS assigned_to_name,
        at.expire_date, at.was_postponed, at.was_rescheduled, at.reschedule_count,
        rs.priority, rs.tone,
        i.id AS installment_id, i.installment_number, i.due_date,
        (CURRENT_DATE - i.due_date)::int AS days_overdue,
        i.pending_amount, i.total_amount,
        c.id AS contract_id, c.contract_number, c.total_installments,
        comp.name AS company_name,
        cl.name AS client_name, cl.tax_id AS client_tax_id, cl.phone AS client_phone,
        li.result AS last_result, li.channel AS last_channel, li.created_at AS last_created_at
      FROM activity_tasks at
      LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
      JOIN installments i ON i.id = at.installment_id
      JOIN contracts c ON c.id = at.contract_id
      JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN companies comp ON comp.id = c.company_id
      LEFT JOIN trigo_users u ON u.id = at.assigned_to
      LEFT JOIN LATERAL (
        SELECT ai.result, ai.channel, ai.created_at
        FROM activity_interactions ai
        WHERE ai.installment_id = at.installment_id
        ORDER BY ai.created_at DESC
        LIMIT 1
      ) li ON true
      WHERE ${scopeClause} ${filter}
      ${orderLimit}
    `;
  }

  /**
   * Página de travadas com `is_active`/`is_recommended` POR RESPONSÁVEL (AUREA-319):
   * o CTE `leaders` acha, por `assigned_to`, a tarefa recomendada de hoje (maior
   * prioridade, mesmo critério de sempre); o CTE `ranked` marca `is_recommended` só
   * nessa linha e `is_active` em TODA tarefa do mesmo `segment_code` do líder daquele
   * responsável — ou seja, dentro do segmento ativo, qualquer pendente é executável,
   * não só a recomendada. Entre segmentos a trava continua (só o segmento do líder
   * fica desbloqueado). O SELECT externo enriquece só a página, exclui a recomendada
   * do viewer (já vem em `active`) e pagina. Assim o Gerente/Diretor vê, no locked, o
   * segmento ativo de cada subordinado desbloqueado + o restante travado.
   * NOTA: o ranking roda sobre o conjunto todo do escopo (ok p/ parceiro/gerente; p/ Diretor
   * muito grande, otimizar depois).
   */
  private fetchLockedPage(
    scopeClause: Prisma.Sql,
    activeId: string | null,
    limit: number,
    offset: number,
    assigneeFilter: Prisma.Sql,
  ): Promise<QueueRow[]> {
    const notActive = activeId
      ? Prisma.sql`WHERE r.task_id <> ${activeId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<QueueRow[]>`
      WITH leaders AS (
        SELECT DISTINCT ON (at.assigned_to)
          at.assigned_to AS assigned_to,
          at.segment_code AS segment_code,
          at.id AS task_id
        FROM activity_tasks at
        LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
        JOIN installments i ON i.id = at.installment_id
        JOIN contracts c ON c.id = at.contract_id
        WHERE ${scopeClause} AND at.status = 'pending' AND at.expire_date <= CURRENT_DATE ${assigneeFilter}
        ORDER BY at.assigned_to, rs.priority ASC NULLS LAST, (CURRENT_DATE - i.due_date) DESC, at.created_at ASC
      ),
      ranked AS (
        SELECT
          at.id AS task_id,
          rs.priority AS priority,
          (CURRENT_DATE - i.due_date)::int AS days_overdue,
          at.created_at AS created_at,
          (at.segment_code = l.segment_code) AS is_active,
          (at.id = l.task_id) AS is_recommended
        FROM activity_tasks at
        LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
        JOIN installments i ON i.id = at.installment_id
        JOIN contracts c ON c.id = at.contract_id
        JOIN leaders l ON l.assigned_to = at.assigned_to
        WHERE ${scopeClause} AND at.status = 'pending' AND at.expire_date <= CURRENT_DATE ${assigneeFilter}
      )
      SELECT
        at.id AS task_id, at.segment_code, at.task_type, at.status,
        r.is_active, r.is_recommended,
        at.assigned_to AS assigned_to_id, u.full_name AS assigned_to_name,
        at.expire_date, at.was_postponed, at.was_rescheduled, at.reschedule_count,
        rs.priority, rs.tone,
        i.id AS installment_id, i.installment_number, i.due_date, r.days_overdue,
        i.pending_amount, i.total_amount,
        c.id AS contract_id, c.contract_number, c.total_installments,
        comp.name AS company_name,
        cl.name AS client_name, cl.tax_id AS client_tax_id, cl.phone AS client_phone,
        li.result AS last_result, li.channel AS last_channel, li.created_at AS last_created_at
      FROM ranked r
      JOIN activity_tasks at ON at.id = r.task_id
      LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
      JOIN installments i ON i.id = at.installment_id
      JOIN contracts c ON c.id = at.contract_id
      JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN companies comp ON comp.id = c.company_id
      LEFT JOIN trigo_users u ON u.id = at.assigned_to
      LEFT JOIN LATERAL (
        SELECT ai.result, ai.channel, ai.created_at
        FROM activity_interactions ai
        WHERE ai.installment_id = at.installment_id
        ORDER BY ai.created_at DESC
        LIMIT 1
      ) li ON true
      ${notActive}
      ORDER BY r.priority ASC NULLS LAST, r.days_overdue DESC, at.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  private async countTasks(
    scopeClause: Prisma.Sql,
    filter: Prisma.Sql,
  ): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM activity_tasks at
      JOIN contracts c ON c.id = at.contract_id
      WHERE ${scopeClause} ${filter}
    `;
    return Number(row?.total ?? 0);
  }

  private async segmentCounts(
    scopeClause: Prisma.Sql,
    filter: Prisma.Sql,
  ): Promise<SegmentSummary[]> {
    const rows = await this.prisma.$queryRaw<
      { code: string; priority: number | null; count: number }[]
    >`
      SELECT at.segment_code AS code, rs.priority AS priority, COUNT(*)::int AS count
      FROM activity_tasks at
      LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
      JOIN contracts c ON c.id = at.contract_id
      WHERE ${scopeClause} ${filter}
      GROUP BY at.segment_code, rs.priority
      ORDER BY rs.priority ASC NULLS LAST
    `;
    return rows.map((r) => ({
      code: r.code,
      priority: Number(r.priority ?? 0),
      count: Number(r.count),
    }));
  }

  /**
   * Registra a execução de uma tarefa: conclui a tarefa e grava a interação.
   * NÃO cria a próxima tarefa (só o job diário cria). Só é permitido em tarefa
   * pendente e atribuída ao usuário. Tarefas agendadas podem ser concluídas antes
   * da data; as tarefas de hoje continuam sujeitas à trava de segmento ativo.
   */
  async registerInteraction(
    taskId: string,
    userId: string,
    dto: RegisterInteractionDto,
  ): Promise<RegisterInteractionResult> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.loadActiveTaskForAction(tx, taskId, userId);

      const taskType = task.task_type as ActivityTaskType;
      this.validateChannelAndResult(taskType, dto);
      if (
        dto.result === ActivityInteractionResult.OTHER &&
        !dto.observation?.trim()
      ) {
        throw new BadRequestException('observation_required');
      }
      const promiseDate = await this.resolvePromiseDate(tx, dto);

      await tx.$executeRaw`
        UPDATE activity_tasks
        SET status = 'completed', completed_at = NOW(), completed_by_user_id = ${userId}::uuid
        WHERE id = ${taskId}::uuid
      `;

      const rows = await tx.$queryRaw<InteractionRow[]>`
        INSERT INTO activity_interactions
          (task_id, installment_id, contract_id, task_type, channel, recipient_type,
           recipient_contact_id, result, promise_date, observation, user_id)
        VALUES
          (${taskId}::uuid, ${task.installment_id}::uuid, ${task.contract_id}::uuid,
           ${task.task_type}, ${dto.channel}, ${dto.recipientType},
           ${dto.recipientContactId ?? null}::uuid, ${dto.result}, ${promiseDate}::date,
           ${dto.observation ?? null}, ${userId}::uuid)
        RETURNING id, task_id, installment_id, contract_id, task_type, channel, recipient_type,
                  recipient_contact_id, result, promise_date, observation, user_id, created_at
      `;
      const interaction = mapInteraction(rows[0]);

      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        await tx.$executeRaw`
          INSERT INTO geolocations (activity_interaction_id, latitude, longitude)
          VALUES (${interaction.id}::uuid, ${dto.latitude}, ${dto.longitude})
        `;
        interaction.geolocation = {
          latitude: dto.latitude,
          longitude: dto.longitude,
        };
      }

      await this.followUpService.createWithinTransaction(
        tx,
        userId,
        this.mapInteractionToFollowUp(task, dto, promiseDate),
      );

      return { interaction };
    });
  }

  /** Posterga a tarefa ativa para amanhã (1× por tarefa). */
  async postpone(taskId: string, userId: string): Promise<TaskActionResult> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.loadActiveTaskForAction(tx, taskId, userId);
      if (task.was_postponed) throw new ConflictException('already_postponed');

      const rows = await tx.$queryRaw<TaskActionRow[]>`
        UPDATE activity_tasks
        SET expire_date = CURRENT_DATE + 1, was_postponed = TRUE
        WHERE id = ${taskId}::uuid
        RETURNING id, installment_id, contract_id, segment_code, task_type, status,
                  expire_date, was_postponed, was_rescheduled, reschedule_count
      `;
      return mapTaskAction(rows[0]);
    });
  }

  /** Reagenda uma tarefa de VISITA para uma data em [D+1, D+5] (até 2× por tarefa). */
  async reschedule(
    taskId: string,
    userId: string,
    dto: RescheduleTaskDto,
  ): Promise<TaskActionResult> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.loadActiveTaskForAction(tx, taskId, userId);
      if (task.task_type !== (ActivityTaskType.VISIT as string)) {
        throw new BadRequestException('reschedule_visit_only');
      }
      if (task.reschedule_count >= 2) {
        throw new ConflictException('reschedule_limit_reached');
      }
      await this.assertWithinRescheduleWindow(tx, dto.date);

      const rows = await tx.$queryRaw<TaskActionRow[]>`
        UPDATE activity_tasks
        SET expire_date = ${dto.date}::date,
            was_rescheduled = TRUE,
            reschedule_count = reschedule_count + 1
        WHERE id = ${taskId}::uuid
        RETURNING id, installment_id, contract_id, segment_code, task_type, status,
                  expire_date, was_postponed, was_rescheduled, reschedule_count
      `;
      return mapTaskAction(rows[0]);
    });
  }

  // ---- guards / carregamento -------------------------------------------------

  /**
   * Carrega a tarefa alvo de uma ação (registrar/postergar/reagendar) com lock e
   * garante que está pending, pertence ao usuário e é a #1 ativa da fila. Preâmbulo
   * comum aos 3 comandos.
   */
  private async loadActiveTaskForAction(
    tx: Prisma.TransactionClient,
    taskId: string,
    userId: string,
  ): Promise<LockedTaskRow> {
    const task = await this.lockTask(tx, taskId);
    this.assertActionable(task, userId);
    await this.assertIsActiveTask(tx, userId, taskId);
    return task;
  }

  private async lockTask(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<LockedTaskRow> {
    const rows = await tx.$queryRaw<LockedTaskRow[]>`
      SELECT at.id, at.installment_id, i.installment_number, at.contract_id,
             at.task_type, at.status, at.assigned_to, at.was_postponed,
             at.was_rescheduled, at.reschedule_count
      FROM activity_tasks at
      JOIN installments i ON i.id = at.installment_id
      WHERE at.id = ${taskId}::uuid
      FOR UPDATE
    `;
    const task = rows[0];
    if (!task) throw new NotFoundException('task_not_found');
    return task;
  }

  /** Tarefa deve estar pending e pertencer ao usuário. */
  private assertActionable(task: LockedTaskRow, userId: string): void {
    if (task.status !== (ActivityTaskStatus.PENDING as string)) {
      throw new ConflictException('task_not_pending');
    }
    if (task.assigned_to !== userId) {
      throw new ForbiddenException('task_not_assigned_to_user');
    }
  }

  /**
   * Uma tarefa agendada (expire_date futuro) pode ser executada antecipadamente,
   * independentemente do segmento ativo. Para tarefas disponíveis hoje, mantém a
   * trava AUREA-319: aceita qualquer pendente do segmento da recomendada, mas
   * bloqueia segmentos diferentes.
   */
  private async assertIsActiveTask(
    tx: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH leader AS (
        SELECT at.segment_code
        FROM activity_tasks at
        LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
        JOIN installments i ON i.id = at.installment_id
        WHERE at.assigned_to = ${userId}::uuid
          AND at.status = 'pending'
          AND at.expire_date <= CURRENT_DATE
        ORDER BY rs.priority ASC NULLS LAST, (CURRENT_DATE - i.due_date) DESC, at.created_at ASC
        LIMIT 1
      )
      SELECT at.id
      FROM activity_tasks at
      LEFT JOIN leader l ON l.segment_code = at.segment_code
      WHERE at.id = ${taskId}::uuid
        AND at.assigned_to = ${userId}::uuid
        AND at.status = 'pending'
        AND (
          at.expire_date > CURRENT_DATE
          OR l.segment_code IS NOT NULL
        )
    `;
    if (rows.length === 0) {
      throw new ConflictException('task_not_active');
    }
  }

  // ---- validações ------------------------------------------------------------

  private validateChannelAndResult(
    taskType: ActivityTaskType,
    dto: RegisterInteractionDto,
  ): void {
    if (!CHANNELS_BY_TASK_TYPE[taskType]?.includes(dto.channel)) {
      throw new BadRequestException('channel_invalid_for_task_type');
    }
    if (!RESULTS_BY_TASK_TYPE[taskType]?.includes(dto.result)) {
      throw new BadRequestException('result_invalid_for_task_type');
    }
  }

  private mapInteractionToFollowUp(
    task: LockedTaskRow,
    dto: RegisterInteractionDto,
    promiseDate: string | null,
  ): CreateFollowUpDto {
    return {
      contractId: task.contract_id,
      installmentNumber: task.installment_number,
      followUpType: this.mapChannelToFollowUpType(dto.channel),
      party: this.mapRecipientToFollowUpParty(dto.recipientType),
      expectedResult: this.mapResultToExpectedResult(dto.result),
      paymentForecast: promiseDate ?? undefined,
      note: dto.observation,
      latitude: dto.latitude,
      longitude: dto.longitude,
    };
  }

  private mapChannelToFollowUpType(channel: ActivityChannel): FollowUpType {
    switch (channel) {
      case ActivityChannel.CALL:
        return FollowUpType.CALL;
      case ActivityChannel.WHATSAPP:
        return FollowUpType.MESSAGE;
      case ActivityChannel.VISIT:
        return FollowUpType.VISIT;
    }
  }

  private mapRecipientToFollowUpParty(
    recipientType: ActivityRecipientType,
  ): FollowUpParty {
    switch (recipientType) {
      case ActivityRecipientType.CLIENT:
        return FollowUpParty.CLIENT;
      case ActivityRecipientType.GUARANTOR:
        return FollowUpParty.GUARANTOR;
      case ActivityRecipientType.OTHER:
        throw new BadRequestException('recipient_unsupported_for_follow_up');
    }
  }

  private mapResultToExpectedResult(
    result: ActivityInteractionResult,
  ): FollowUpExpectedResult {
    switch (result) {
      case ActivityInteractionResult.NO_RESPONSE:
        return FollowUpExpectedResult.NO_RETURN;
      case ActivityInteractionResult.NOT_LOCATED:
        return FollowUpExpectedResult.NOT_LOCATED;
      case ActivityInteractionResult.PAYMENT_PROMISE:
        return FollowUpExpectedResult.WILL_PAY_ON_DATE;
      case ActivityInteractionResult.DISPUTE:
        return FollowUpExpectedResult.DISPUTE;
      case ActivityInteractionResult.RENEGOTIATION:
        return FollowUpExpectedResult.WANTS_RENEGOTIATION;
      case ActivityInteractionResult.DECEASED:
        return FollowUpExpectedResult.DECEASED;
      case ActivityInteractionResult.NO_FORECAST:
        return FollowUpExpectedResult.NO_FORECAST;
      case ActivityInteractionResult.OTHER:
        return FollowUpExpectedResult.OTHER;
    }
  }

  /**
   * Promessa de pagamento: obrigatória quando result=payment_promise e ≤ D+10
   * (validado contra CURRENT_DATE do banco). Para outros resultados, ignora.
   * Retorna a data (ISO) ou null.
   */
  private async resolvePromiseDate(
    tx: Prisma.TransactionClient,
    dto: RegisterInteractionDto,
  ): Promise<string | null> {
    if (dto.result !== ActivityInteractionResult.PAYMENT_PROMISE) return null;
    if (!dto.promiseDate)
      throw new BadRequestException('promise_date_required');

    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT (${dto.promiseDate}::date BETWEEN CURRENT_DATE AND CURRENT_DATE + ${PROMISE_MAX_DAYS}::int)
             AS ok
    `;
    if (!row?.ok) throw new BadRequestException('promise_date_out_of_window');
    return dto.promiseDate;
  }

  private async assertWithinRescheduleWindow(
    tx: Prisma.TransactionClient,
    date: string,
  ): Promise<void> {
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT (${date}::date BETWEEN CURRENT_DATE + ${RESCHEDULE_MIN_DAYS}::int
              AND CURRENT_DATE + ${RESCHEDULE_MAX_DAYS}::int) AS ok
    `;
    if (!row?.ok) throw new BadRequestException('reschedule_out_of_window');
  }
}
