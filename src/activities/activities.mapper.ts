/** Mappers puros (row do Postgres → DTO de resposta) do módulo de activities. */

import { ClientAddress } from '../collections/interfaces/overdue-collection.interface';
import {
  ActivityInteractionResponse,
  TaskActionResult,
} from './interfaces/activity-interaction.interface';
import {
  InteractionRow,
  QueueRow,
  RawAddress,
  TaskActionRow,
} from './interfaces/activity-row.interface';
import { QueueTaskCard } from './interfaces/task-queue.interface';
import { toNum } from './activities.util';

export function mapInteraction(
  row: InteractionRow,
): ActivityInteractionResponse {
  return {
    id: row.id,
    taskId: row.task_id,
    installmentId: row.installment_id,
    contractId: row.contract_id,
    taskType: row.task_type,
    channel: row.channel,
    recipientType: row.recipient_type,
    recipientContactId: row.recipient_contact_id ?? undefined,
    result: row.result,
    promiseDate: row.promise_date ?? undefined,
    observation: row.observation ?? undefined,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

export function mapTaskAction(row: TaskActionRow): TaskActionResult {
  return {
    id: row.id,
    installmentId: row.installment_id,
    contractId: row.contract_id,
    segmentCode: row.segment_code,
    taskType: row.task_type,
    status: row.status,
    expireDate: row.expire_date,
    wasPostponed: row.was_postponed,
    wasRescheduled: row.was_rescheduled,
  };
}

export function mapCard(row: QueueRow, position: number): QueueTaskCard {
  const totalInstallments = Number(row.total_installments ?? 0);
  const installmentNumber = Number(row.installment_number);
  const pendingAmount = toNum(row.pending_amount);
  return {
    position,
    taskId: row.task_id,
    segmentCode: row.segment_code,
    priority: Number(row.priority ?? 0),
    tone: row.tone ?? '',
    taskType: row.task_type,
    status: row.status,
    isActive: row.is_active,
    assignedTo: row.assigned_to_id
      ? { id: row.assigned_to_id, name: row.assigned_to_name ?? '' }
      : null,
    expireDate: row.expire_date,
    wasPostponed: row.was_postponed,
    wasRescheduled: row.was_rescheduled,
    client: {
      name: row.client_name,
      taxId: row.client_tax_id,
      phone: row.client_phone ?? undefined,
    },
    contract: {
      id: row.contract_id,
      number: row.contract_number,
      totalInstallments,
      companyName: row.company_name ?? undefined,
    },
    installment: {
      id: row.installment_id,
      number: installmentNumber,
      label: `${installmentNumber}/${totalInstallments}`,
      dueDate: row.due_date,
      daysOverdue: Number(row.days_overdue),
      pendingAmount,
      // TODO(RN-023): valor corrigido hoje (juros + correção). Sem cálculo no portal ainda.
      amountOverdue: pendingAmount,
      totalAmount: toNum(row.total_amount),
    },
    lastInteraction: row.last_result
      ? {
          result: row.last_result,
          channel: row.last_channel ?? '',
          createdAt: row.last_created_at as Date,
        }
      : null,
  };
}

/** Monta o endereço do cliente a partir da linha do Prisma; undefined se não houver. */
export function mapAddress(
  row: RawAddress | undefined,
): ClientAddress | undefined {
  if (!row?.street) return undefined;
  return {
    street: row.street,
    number: row.number ?? '',
    complement: row.complement ?? undefined,
    neighborhood: row.neighborhood ?? '',
    city: row.city ?? '',
    state: row.state ?? undefined,
    zipCode: row.zip_code ?? '',
  };
}
