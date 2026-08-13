/** Mappers puros (row do Postgres → DTO de resposta) do módulo de activities. */

import { Prisma } from '@prisma/client';
import { ClientAddress } from '../collections/interfaces/overdue-collection.interface';
import {
  ActivityInteractionResponse,
  TaskActionResult,
} from './interfaces/activity-interaction.interface';
import {
  InteractionRow,
  QueueRow,
  RawAddress,
  RawGuarantor,
  TaskActionRow,
} from './interfaces/activity-row.interface';
import { DetailGuarantor } from './interfaces/installment-detail.interface';
import { QueueTaskCard } from './interfaces/task-queue.interface';
import { toNum } from '../common/query.util';
import { onlyDigits } from './activities.util';

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
    isRecommended: row.is_recommended,
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

/**
 * Avalista a partir do jsonb `quotes.guarantor`. Retorna null quando não há
 * proposta vinculada, quando ela não tem avalista, ou quando o objeto está lá
 * mas sem identificação (nome e documento vazios) — caso visto em propostas
 * onde o bloco foi aberto e não preenchido.
 *
 * O endereço do avalista usa chaves DIFERENTES das de `addresses` (streetName /
 * streetDistrict / zipCode vs street / neighborhood / zip_code), por isso não dá
 * pra reusar o mapAddress aqui.
 */
export function mapGuarantor(
  raw: Prisma.JsonValue | null | undefined,
): DetailGuarantor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const guarantor = raw as RawGuarantor;
  const name = guarantor.name?.trim() ?? '';
  const taxId = onlyDigits(guarantor.document);
  if (!name && !taxId) return null;

  const address = guarantor.address;
  return {
    name,
    taxId,
    phone: guarantor.telephone ?? undefined,
    email: guarantor.email ?? undefined,
    address: address?.streetName
      ? {
          street: address.streetName,
          number: address.streetNumber ?? '',
          complement: address.streetComplement ?? undefined,
          neighborhood: address.streetDistrict ?? '',
          city: address.city ?? '',
          state: address.state ?? undefined,
          zipCode: address.zipCode ?? '',
        }
      : undefined,
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
