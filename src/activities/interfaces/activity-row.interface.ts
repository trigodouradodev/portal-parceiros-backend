import { Prisma } from '@prisma/client';

/**
 * Shapes brutos (snake_case) retornados pelas queries raw do ActivitiesService.
 * Não são contratos de API — são o resultado direto do Postgres.
 */

/** Colunas do endereço retornadas pelo select do Prisma (detalhe da parcela). */
export interface RawAddress {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string | null;
  zip_code: string;
}

/**
 * Shape do objeto `quotes.guarantor` (jsonb). Chaves em camelCase, espelhando o
 * type da proposta no backoffice. Nada é garantido: o jsonb é escrito lá e não
 * tem constraint — todo campo é tratado como possivelmente ausente.
 */
export interface RawGuarantor {
  name?: string;
  document?: string;
  telephone?: string;
  email?: string;
  birthDate?: string;
  address?: {
    zipCode?: string;
    streetName?: string;
    streetNumber?: string;
    streetComplement?: string;
    streetDistrict?: string;
    city?: string;
    state?: string;
    referencePoint?: string;
  };
}

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
  reschedule_count: number;
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
  reschedule_count: number;
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
  is_recommended: boolean;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  expire_date: Date;
  was_postponed: boolean;
  was_rescheduled: boolean;
  reschedule_count: number;
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
