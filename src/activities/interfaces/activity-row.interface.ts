import { Prisma } from '@prisma/client';

/**
 * Shapes brutos (snake_case) retornados pelas queries raw do ActivitiesService.
 * Não são contratos de API — são o resultado direto do Postgres.
 */

/** Linha lockada da tarefa (o mínimo p/ validar e executar uma ação). */
export interface LockedTaskRow {
  id: string;
  installment_id: string;
  contract_id: string;
  task_type: string;
  status: string;
  assigned_to: string | null;
  was_postponed: boolean;
  was_rescheduled: boolean;
}

/** Linha retornada pelas ações de tarefa (postergar/reagendar). */
export interface TaskActionRow {
  id: string;
  installment_id: string;
  contract_id: string;
  segment_code: string;
  task_type: string;
  status: string;
  expire_date: Date;
  was_postponed: boolean;
  was_rescheduled: boolean;
}

/** Interação recém-criada (retorno do INSERT). */
export interface InteractionRow {
  id: string;
  task_id: string;
  installment_id: string;
  contract_id: string;
  task_type: string;
  channel: string;
  recipient_type: string;
  recipient_contact_id: string | null;
  result: string;
  promise_date: Date | null;
  observation: string | null;
  user_id: string;
  created_at: Date;
}

/** Linha bruta de um card da fila (tarefa + contexto do contrato/cliente). */
export interface QueueRow {
  task_id: string;
  segment_code: string;
  task_type: string;
  status: string;
  is_active: boolean;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  expire_date: Date;
  was_postponed: boolean;
  was_rescheduled: boolean;
  priority: number | null;
  tone: string | null;
  installment_id: string;
  installment_number: number;
  due_date: Date;
  days_overdue: number;
  pending_amount: Prisma.Decimal | string | number;
  total_amount: Prisma.Decimal | string | number;
  contract_id: string;
  contract_number: string;
  total_installments: number;
  company_name: string | null;
  client_name: string;
  client_tax_id: string;
  client_phone: string | null;
  last_result: string | null;
  last_channel: string | null;
  last_created_at: Date | null;
}
