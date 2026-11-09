import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityRecipientType } from './enums/activity.enums';
import {
  addCollectionDays,
  effectiveCollectionDueDate,
} from './collection-calendar';
import type { LockedTaskRow } from './interfaces/activity-row.interface';
import type {
  CollectionContextRow,
  CollectionExecutionContext,
} from './interfaces/collection-context.interface';

/** Revalidação dos comandos. A criação/cancelamento das tarefas pertence ao job. */
@Injectable()
export class ActivityCollectionGuard {
  /** Mesma ordem a adotar no job: contrato, parcelas em ordem estável, tarefa. */
  async lockContractAndInstallments(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<string> {
    const [contract] = await tx.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM contracts c
      JOIN activity_tasks at ON at.contract_id = c.id
      WHERE at.id = ${taskId}::uuid
      FOR UPDATE OF c
    `;
    if (!contract) throw new NotFoundException('task_not_found');

    await tx.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM installments i
      WHERE i.contract_id = ${contract.id}::uuid
      ORDER BY i.id
      FOR UPDATE OF i
    `;
    return contract.id;
  }

  async assertCollectible(
    tx: Prisma.TransactionClient,
    task: LockedTaskRow,
    userId: string,
  ): Promise<CollectionExecutionContext> {
    const [context] = await tx.$queryRaw<CollectionContextRow[]>`
      WITH execution_clock AS MATERIALIZED (
        SELECT clock_timestamp() AS evaluated_at
      ), collection_clock AS (
        SELECT evaluated_at,
          (evaluated_at AT TIME ZONE 'America/Sao_Paulo')::date AS reference_date
        FROM execution_clock
      )
      SELECT
        clk.evaluated_at, clk.reference_date::text AS reference_date,
        c.status AS contract_status,
        COALESCE(cp.uses_celcoin_integration, false) AS uses_celcoin_integration,
        COALESCE(c.current_collection_agent_id, c.consultant_id) AS current_assigned_to,
        EXISTS (
          SELECT 1 FROM trigo_group_members gm
          JOIN trigo_groups g ON g.id = gm.group_id AND g.is_active AND NOT g.is_deleted
          JOIN trigo_group_permissions gp ON gp.group_id = g.id
          JOIN permissions p ON p.id = gp.permission_id
          WHERE gm.user_id = COALESCE(c.current_collection_agent_id, c.consultant_id)
            AND p.permission_key = 'QUOTE_ACTIVITY_GATES'
        ) AS has_activity_gate_permission,
        EXISTS (
          SELECT 1 FROM contract_pending_actions a
          WHERE a.contract_id = c.id AND a.status = 'open'
            AND (a.type <> 'renegotiation' OR a.expected_agreement_date >= clk.reference_date)
        ) AS has_open_pending_action,
        COALESCE(client.is_deceased, false) AS client_is_deceased,
        (guarantor.id IS NOT NULL AND NOT guarantor.is_deceased) AS has_living_guarantor,
        debt.installment_id AS reference_installment_id,
        debt.due_date::text AS reference_due_date,
        debt.days_overdue,
        COALESCE(debt.overdue_installment_count, 0) AS overdue_installment_count,
        COALESCE(debt.collection_blocked, false) AS collection_blocked,
        EXISTS (
          SELECT 1 FROM activity_interactions ai
          WHERE ai.contract_id = c.id AND ai.installment_id = debt.installment_id
            AND ai.overdue_installment_count_at_execution = 2
            AND ai.created_at <= clk.evaluated_at
        ) AS follow_up_completed,
        latest.result AS last_result, latest.channel AS last_channel,
        (latest.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS last_execution_date,
        latest.days_overdue_at_execution AS last_days_overdue,
        latest.promise_date::text AS promise_date
      FROM contracts c
      CROSS JOIN collection_clock clk
      LEFT JOIN companies cp ON cp.id = c.company_id
      JOIN parties client ON client.id = c.client_id
      LEFT JOIN parties guarantor ON guarantor.id = c.guarantor_party_id
      LEFT JOIN LATERAL (
        SELECT * FROM public.activity_collection_overdue_installments(c.id, clk.reference_date)
        WHERE reference_rank = 1
      ) debt ON true
      LEFT JOIN LATERAL (
        SELECT ai.result, ai.channel, ai.created_at, ai.days_overdue_at_execution, ai.promise_date
        FROM activity_interactions ai
        WHERE ai.contract_id = c.id AND ai.installment_id = debt.installment_id
          AND ai.created_at <= clk.evaluated_at
        ORDER BY ai.created_at DESC, ai.id ASC LIMIT 1
      ) latest ON true
      WHERE c.id = ${task.contract_id}::uuid
    `;
    if (!context) throw new NotFoundException('contract_not_found');

    if (context.has_open_pending_action) this.reject('open_pending_action');
    if (context.contract_status !== 'disbursed')
      this.reject('contract_not_disbursed');
    if (!context.uses_celcoin_integration) this.reject('unsupported_company');
    if (context.current_assigned_to !== userId)
      this.reject('task_assignee_changed');
    if (!context.has_activity_gate_permission)
      this.reject('assignee_not_enabled');
    if (context.client_is_deceased && !context.has_living_guarantor)
      this.reject('no_living_recipient');
    if (
      !context.reference_installment_id ||
      !context.reference_due_date ||
      context.days_overdue === null ||
      context.overdue_installment_count === 0
    )
      this.reject('no_overdue_installments');
    if (context.overdue_installment_count >= 3)
      this.reject('three_or_more_overdue_installments');
    if (context.reference_installment_id !== task.installment_id)
      this.reject('reference_changed');
    if (context.collection_blocked) this.reject('collection_blocked');
    if (context.days_overdue > 30) this.reject('outside_collection_window');
    if (
      context.overdue_installment_count === 2 &&
      context.follow_up_completed
    ) {
      this.reject('second_overdue_follow_up_completed');
    }
    if (
      context.reference_date <=
      effectiveCollectionDueDate(context.reference_due_date)
    ) {
      this.reject('payment_grace_period');
    }
    if (
      context.last_result === 'payment_promise' &&
      context.promise_date &&
      context.promise_date >= context.reference_date
    )
      this.reject(
        'active_payment_promise',
        addCollectionDays(context.promise_date, 1),
      );
    if (
      context.last_channel === 'visit' &&
      context.last_execution_date &&
      context.last_days_overdue !== null &&
      context.last_days_overdue > 5 &&
      ['no_forecast', 'not_located', 'other'].includes(
        context.last_result ?? '',
      )
    ) {
      const returnDate = addCollectionDays(context.last_execution_date, 15);
      if (context.reference_date < returnDate)
        this.reject('visit_interval', returnDate);
    }
    if (context.last_execution_date === context.reference_date)
      this.reject('already_executed_today');

    return {
      ...context,
      reference_installment_id: context.reference_installment_id,
      reference_due_date: context.reference_due_date,
      days_overdue: context.days_overdue,
    };
  }

  assertRecipient(
    context: CollectionExecutionContext,
    recipient: ActivityRecipientType,
  ): void {
    if (
      context.client_is_deceased &&
      recipient !== ActivityRecipientType.GUARANTOR
    ) {
      this.reject('recipient_must_be_guarantor');
    }
    if (
      recipient === ActivityRecipientType.GUARANTOR &&
      !context.has_living_guarantor
    ) {
      this.reject('no_living_guarantor');
    }
  }

  private reject(reason: string, resumeOn?: string): never {
    throw new ConflictException({
      message: 'task_not_collectible',
      reason,
      ...(resumeOn ? { resumeOn } : {}),
    });
  }
}
