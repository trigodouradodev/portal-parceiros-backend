/**
 * Shapes brutos (snake_case) retornados pelas queries raw do ActivitiesService.
 * Não são contratos de API — são o resultado direto do Postgres.
 */

export interface TaskRow {
  id: string;
  installment_id: string;
  contract_id: string;
  ruler_stage_id: string | null;
  stage_code: string;
  channel: string;
  status: string;
  assigned_to: string | null;
}

export interface InteractionRow {
  id: string;
  task_id: string;
  installment_id: string;
  contract_id: string;
  channel: string;
  result: string;
  promise_date: Date | null;
  observation: string | null;
  user_id: string;
  created_at: Date;
}

export interface CreatedTaskRow {
  id: string;
  installment_id: string;
  contract_id: string;
  stage_code: string;
  channel: string;
  status: string;
  created_at: Date;
}
