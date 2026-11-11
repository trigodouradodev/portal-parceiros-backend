import { Prisma } from '@prisma/client';
import { COLLECTION_FIXED_HOLIDAYS } from './collection-calendar';

export const COLLECTION_TODAY = Prisma.sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`;

/** Predicado único para fila, ranking, detalhe e trava de originação. Requer alias at. */
export function collectibleTaskCondition(
  today: Prisma.Sql = COLLECTION_TODAY,
  instant: Prisma.Sql = Prisma.sql`CURRENT_TIMESTAMP`,
): Prisma.Sql {
  return Prisma.sql`(
    at.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM contracts ec
      JOIN companies ecp ON ecp.id = ec.company_id
      JOIN parties eclient ON eclient.id = ec.client_id
      LEFT JOIN parties eg ON eg.id = ec.guarantor_party_id
      JOIN LATERAL (
        SELECT * FROM public.activity_collection_overdue_installments(ec.id, ${today})
        WHERE reference_rank = 1
      ) debt ON true
      LEFT JOIN LATERAL (
        SELECT ai.result, ai.channel, ai.promise_date, ai.created_at, ai.days_overdue_at_execution
        FROM activity_interactions ai
        WHERE ai.contract_id = ec.id AND ai.installment_id = debt.installment_id
          AND ai.created_at <= ${instant}
        ORDER BY ai.created_at DESC, ai.id ASC LIMIT 1
      ) latest ON true
      WHERE ec.id = at.contract_id AND ec.status = 'disbursed' AND ecp.uses_celcoin_integration
        AND at.assigned_to = COALESCE(ec.current_collection_agent_id, ec.consultant_id)
        AND (NOT eclient.is_deceased OR (eg.id IS NOT NULL AND NOT eg.is_deceased))
        AND EXISTS (
          SELECT 1 FROM trigo_group_members gm
          JOIN trigo_groups g ON g.id = gm.group_id AND g.is_active AND NOT g.is_deleted
          JOIN trigo_group_permissions gp ON gp.group_id = g.id
          JOIN permissions p ON p.id = gp.permission_id
          WHERE gm.user_id = at.assigned_to AND p.permission_key = 'QUOTE_ACTIVITY_GATES'
        )
        AND NOT EXISTS (
          SELECT 1 FROM contract_pending_actions a WHERE a.contract_id = ec.id AND a.status = 'open'
            AND (a.type <> 'renegotiation' OR a.expected_agreement_date >= ${today})
        )
        AND debt.installment_id = at.installment_id AND NOT debt.collection_blocked
        AND debt.overdue_installment_count BETWEEN 1 AND 2 AND debt.days_overdue <= 30
        AND ${today} > (
          SELECT MIN(debt.due_date + grace_days.offset_days) FROM generate_series(0, 14) AS grace_days(offset_days)
          WHERE EXTRACT(DOW FROM (debt.due_date + grace_days.offset_days)) NOT IN (0, 6)
            AND to_char(debt.due_date + grace_days.offset_days, 'MM-DD') NOT IN (${Prisma.join(COLLECTION_FIXED_HOLIDAYS)})
        )
        AND (debt.overdue_installment_count <> 2 OR NOT EXISTS (
          SELECT 1 FROM activity_interactions done
          WHERE done.contract_id = ec.id AND done.installment_id = debt.installment_id
            AND done.overdue_installment_count_at_execution = 2 AND done.created_at <= ${instant}
        ))
        AND NOT COALESCE(latest.result = 'payment_promise' AND latest.promise_date >= ${today}, false)
        AND NOT COALESCE(
          latest.channel = 'visit' AND latest.days_overdue_at_execution > 5
          AND latest.result IN ('no_forecast', 'not_located', 'other')
          AND ${today} < (latest.created_at AT TIME ZONE 'America/Sao_Paulo')::date + 15, false
        )
        AND (latest.created_at AT TIME ZONE 'America/Sao_Paulo')::date IS DISTINCT FROM ${today}
    )
  )`;
}
