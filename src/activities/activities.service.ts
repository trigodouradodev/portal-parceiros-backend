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
import { RegisterInteractionDto } from './dto/register-interaction.dto';
import { RescheduleTaskDto } from './dto/reschedule-task.dto';
import {
  ActivityInteractionResult,
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

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Fila "Ações de hoje" da home, com ownership direto: o usuário vê somente
   * contratos em que é consultor ou agente de cobrança.
   *
   * Grupos: `active` = a #1 EXECUTÁVEL do viewer (a de maior prioridade `assigned_to`
   * = ele); somente o responsável pela tarefa pode recebê-la como ativa.
   * `locked` = demais pendentes de hoje visíveis; `scheduled` = postergadas/reagendadas;
   * `completedToday` = concluídas hoje. Ordem: prioridade do segmento, depois maior atraso.
   */
  async getTodayQueue(
    viewer: ScopeViewer,
    page = 1,
    limit = 30,
  ): Promise<TodayQueue> {
    const scopeClause = this.scope.buildDirectContractScopeSql(viewer.userId);

    const pendingToday = Prisma.sql`at.status = 'pending' AND at.expire_date <= CURRENT_DATE`;
    const order = Prisma.sql`ORDER BY rs.priority ASC NULLS LAST, days_overdue DESC, at.created_at ASC`;

    // active = a #1 executável do viewer (maior prioridade `assigned_to` = ele).
    const [activeRow] = await this.fetchCards(
      scopeClause,
      Prisma.sql`AND ${pendingToday} AND at.assigned_to = ${viewer.userId}::uuid`,
      Prisma.sql`${order} LIMIT 1`,
      true,
    );
    const activeId = activeRow?.task_id ?? null;
    const activeOffset = activeId ? 1 : 0;
    const notActive = activeId
      ? Prisma.sql`AND at.id <> ${activeId}::uuid`
      : Prisma.empty;

    // counter (total de hoje no escopo) e totalizadores por segmento (travadas).
    const counter = await this.countTasks(
      scopeClause,
      Prisma.sql`AND ${pendingToday}`,
    );
    const segments = await this.segmentCounts(
      scopeClause,
      Prisma.sql`AND ${pendingToday} ${notActive}`,
    );

    // locked = travadas paginadas no banco, com is_active por responsável.
    const offset = (page - 1) * limit;
    const lockedRows = await this.fetchLockedPage(
      scopeClause,
      activeId,
      limit,
      offset,
    );
    const lockedTotal = counter - activeOffset;
    const totalPages = Math.ceil(lockedTotal / limit);

    // scheduled (postergadas/reagendadas) e completedToday — listas cheias por ora.
    const scheduledRows = await this.fetchCards(
      scopeClause,
      Prisma.sql`AND at.status = 'pending' AND at.expire_date > CURRENT_DATE`,
      order,
      false,
    );
    const completedRows = await this.fetchCards(
      scopeClause,
      Prisma.sql`AND at.status = 'completed' AND at.completed_at::date = CURRENT_DATE`,
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

  /**
   * Detalhe da PARCELA (por installmentId): contrato, cliente, responsável e o histórico
   * completo de tarefas da parcela — cada uma com a sua interação. Escopo por
   * ownership direto; fora do escopo ou inexistente → 404 (não revela existência).
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

    const canView = await this.scope.canDirectlyViewContract(
      contractId,
      viewer.userId,
    );
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
   * e ordenação. `isActive` é literal aqui: a #1 do viewer é true; scheduled/completed false.
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
        at.assigned_to AS assigned_to_id, u.full_name AS assigned_to_name,
        at.expire_date, at.was_postponed, at.was_rescheduled,
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
   * Página de travadas com `is_active` POR RESPONSÁVEL: um CTE leve ranqueia as
   * pendentes de hoje do escopo (ROW_NUMBER por assigned_to), marcando a #1 de cada um;
   * o SELECT externo enriquece só a página, exclui a #1 do viewer e pagina. Assim o
   * Gerente/Diretor vê, no locked, a ativa de cada subordinado (is_active=true) + as demais.
   * NOTA: o ranking roda sobre o conjunto todo do escopo (ok p/ parceiro/gerente; p/ Diretor
   * muito grande, otimizar depois).
   */
  private fetchLockedPage(
    scopeClause: Prisma.Sql,
    activeId: string | null,
    limit: number,
    offset: number,
  ): Promise<QueueRow[]> {
    const notActive = activeId
      ? Prisma.sql`WHERE r.task_id <> ${activeId}::uuid`
      : Prisma.empty;
    return this.prisma.$queryRaw<QueueRow[]>`
      WITH ranked AS (
        SELECT
          at.id AS task_id,
          rs.priority AS priority,
          (CURRENT_DATE - i.due_date)::int AS days_overdue,
          at.created_at AS created_at,
          (ROW_NUMBER() OVER (
            PARTITION BY at.assigned_to
            ORDER BY rs.priority ASC NULLS LAST, (CURRENT_DATE - i.due_date) DESC, at.created_at ASC
          ) = 1) AS is_active
        FROM activity_tasks at
        LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
        JOIN installments i ON i.id = at.installment_id
        JOIN contracts c ON c.id = at.contract_id
        WHERE ${scopeClause} AND at.status = 'pending' AND at.expire_date <= CURRENT_DATE
      )
      SELECT
        at.id AS task_id, at.segment_code, at.task_type, at.status,
        r.is_active,
        at.assigned_to AS assigned_to_id, u.full_name AS assigned_to_name,
        at.expire_date, at.was_postponed, at.was_rescheduled,
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
   * NÃO cria a próxima tarefa (só o job diário cria). Só é permitido na tarefa
   * #1 ativa da fila do usuário (trava no backend).
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
                  expire_date, was_postponed, was_rescheduled
      `;
      return mapTaskAction(rows[0]);
    });
  }

  /** Reagenda uma tarefa de VISITA para uma data em [D+1, D+5] (1× por tarefa). */
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
      if (task.was_rescheduled)
        throw new ConflictException('already_rescheduled');
      await this.assertWithinRescheduleWindow(tx, dto.date);

      const rows = await tx.$queryRaw<TaskActionRow[]>`
        UPDATE activity_tasks
        SET expire_date = ${dto.date}::date, was_rescheduled = TRUE
        WHERE id = ${taskId}::uuid
        RETURNING id, installment_id, contract_id, segment_code, task_type, status,
                  expire_date, was_postponed, was_rescheduled
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
      SELECT id, installment_id, contract_id, task_type, status, assigned_to,
             was_postponed, was_rescheduled
      FROM activity_tasks
      WHERE id = ${taskId}::uuid
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

  /** A tarefa deve ser a #1 ativa da fila do usuário (só a #1 é executável). */
  private async assertIsActiveTask(
    tx: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT at.id
      FROM activity_tasks at
      LEFT JOIN activity_ruler_stages rs ON rs.id = at.ruler_stage_id
      JOIN installments i ON i.id = at.installment_id
      WHERE at.assigned_to = ${userId}::uuid
        AND at.status = 'pending'
        AND at.expire_date <= CURRENT_DATE
      ORDER BY rs.priority ASC NULLS LAST, (CURRENT_DATE - i.due_date) DESC, at.created_at ASC
      LIMIT 1
    `;
    if (rows[0]?.id !== taskId) {
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
