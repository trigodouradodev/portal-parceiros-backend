import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ActivityInteractionResult,
  ActivityRecipientType,
} from '../enums/activity.enums';
import { addCollectionDays } from '../collection-calendar';
import type { CollectionExecutionContext } from '../interfaces/collection-context.interface';

type ActionType = 'renegotiation' | 'death_registration' | 'dispute';
interface ActionSnapshot {
  id: string;
  type: ActionType;
  status: string;
  [key: string]: unknown;
}
interface ActionRow {
  snapshot: ActionSnapshot;
}

const PENDING_RESULTS: Partial<
  Record<ActivityInteractionResult, { type: ActionType; observation: string }>
> = {
  renegotiation: {
    type: 'renegotiation',
    observation: 'Cliente solicitou renegociação.',
  },
  deceased: {
    type: 'death_registration',
    observation: 'Óbito informado durante a cobrança.',
  },
  dispute: {
    type: 'dispute',
    observation: 'Disputa/contestação informada durante a cobrança.',
  },
};

/** Escrita automática do portal, autorizada pelo registro da tarefa, na mesma transação. */
@Injectable()
export class ContractPendingActionsService {
  validateExpectedAgreementDate(
    result: ActivityInteractionResult,
    date: string | undefined,
    today: string,
  ): string | null {
    if (result !== ActivityInteractionResult.RENEGOTIATION) {
      if (date !== undefined)
        throw new BadRequestException('expected_agreement_date_unexpected');
      return null;
    }
    if (!date)
      throw new BadRequestException('expected_agreement_date_required');
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      date < addCollectionDays(today, 1) ||
      date > addCollectionDays(today, 10)
    ) {
      throw new BadRequestException('expected_agreement_date_out_of_window');
    }
    return date;
  }

  async openForInteraction(
    tx: Prisma.TransactionClient,
    collection: Pick<
      CollectionExecutionContext,
      'evaluated_at' | 'reference_date'
    >,
    input: {
      contractId: string;
      interactionId: string;
      userId: string;
      result: ActivityInteractionResult;
      recipientType: ActivityRecipientType;
      observation?: string;
      expectedAgreementDate: string | null;
    },
  ): Promise<{ id: string; type: ActionType } | null> {
    const mapping = PENDING_RESULTS[input.result];
    if (!mapping) return null;
    const recipientNote =
      input.result === ActivityInteractionResult.DECEASED &&
      input.recipientType === ActivityRecipientType.GUARANTOR
        ? 'Óbito informado para o avalista. '
        : '';
    // A interação mantém a nota integral; a descrição editável da ação respeita o limite do backoffice.
    const observation = (
      recipientNote + (input.observation?.trim() || mapping.observation)
    ).slice(0, 2000);
    const instant = collection.evaluated_at;

    // Materializa a expiração efetiva antes do upsert, preservando o histórico imutável.
    const expired = await tx.$queryRaw<ActionRow[]>`
      SELECT to_jsonb(a) AS snapshot FROM contract_pending_actions a
      WHERE a.contract_id = ${input.contractId}::uuid AND a.status = 'open'
        AND a.type = 'renegotiation' AND a.expected_agreement_date < ${collection.reference_date}::date
      FOR UPDATE OF a
    `;
    for (const { snapshot: before } of expired) {
      const [updated] = await tx.$queryRaw<ActionRow[]>`
        UPDATE contract_pending_actions SET status = 'expired', closed_at = ${instant}, closed_by = NULL,
          closure_reason = 'Data prevista para o acordo vencida.', updated_at = ${instant}
        WHERE id = ${before.id}::uuid RETURNING to_jsonb(contract_pending_actions) AS snapshot
      `;
      await this.recordEvent(
        tx,
        before,
        updated.snapshot,
        'expired',
        null,
        'Data prevista para o acordo vencida.',
        null,
        instant,
      );
    }

    const [existing] = await tx.$queryRaw<ActionRow[]>`
      SELECT to_jsonb(a) AS snapshot FROM contract_pending_actions a
      WHERE a.contract_id = ${input.contractId}::uuid AND a.type = ${mapping.type} AND a.status = 'open'
      FOR UPDATE OF a
    `;
    let action: ActionSnapshot;
    if (existing) {
      const [updated] = await tx.$queryRaw<ActionRow[]>`
        UPDATE contract_pending_actions SET observation = ${observation},
          expected_agreement_date = ${input.expectedAgreementDate}::date, updated_at = ${instant}
        WHERE id = ${existing.snapshot.id}::uuid RETURNING to_jsonb(contract_pending_actions) AS snapshot
      `;
      action = updated.snapshot;
    } else {
      const [config] = await tx.$queryRaw<{ value: string }[]>`
        SELECT value FROM system_configs WHERE key = 'CONTRACT_PENDING_ACTION_DUE_DAYS'
      `;
      const days = Number(config?.value);
      if (!Number.isInteger(days) || days < 1)
        throw new InternalServerErrorException(
          'pending_action_due_days_invalid',
        );
      const [created] = await tx.$queryRaw<ActionRow[]>`
        INSERT INTO contract_pending_actions
          (contract_id, type, status, origin, source_interaction_id, observation, expected_agreement_date,
           due_at, created_by, created_at, updated_at)
        VALUES (${input.contractId}::uuid, ${mapping.type}, 'open', 'portal', ${input.interactionId}::uuid,
          ${observation}, ${input.expectedAgreementDate}::date,
          ((${instant}::timestamptz AT TIME ZONE 'America/Sao_Paulo') + make_interval(days => ${days}::int)) AT TIME ZONE 'America/Sao_Paulo',
          ${input.userId}::uuid, ${instant}, ${instant})
        RETURNING to_jsonb(contract_pending_actions) AS snapshot
      `;
      action = created.snapshot;
    }
    await this.recordEvent(
      tx,
      existing?.snapshot ?? null,
      action,
      existing ? 'updated' : 'created',
      input.userId,
      observation,
      input.interactionId,
      instant,
    );
    // A executada já está completed. Só remanescentes pendentes são canceladas.
    await tx.$executeRaw`
      UPDATE activity_tasks SET status = 'cancelled', cancelled_at = ${instant}, cancellation_reason = 'contract_pending_action'
      WHERE contract_id = ${input.contractId}::uuid AND status = 'pending'
    `;
    return { id: action.id, type: action.type };
  }

  private async recordEvent(
    tx: Prisma.TransactionClient,
    before: ActionSnapshot | null,
    after: ActionSnapshot,
    eventType: 'created' | 'updated' | 'expired',
    actorId: string | null,
    justification: string,
    interactionId: string | null,
    instant: Date,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO contract_pending_action_events
        (action_id, event_type, actor_user_id, source_interaction_id, justification, previous_values, new_values, created_at)
      VALUES (${after.id}::uuid, ${eventType}, ${actorId}::uuid, ${interactionId}::uuid, ${justification},
        ${before ? JSON.stringify(before) : null}::jsonb, ${JSON.stringify(after)}::jsonb, ${instant})
    `;
  }
}
