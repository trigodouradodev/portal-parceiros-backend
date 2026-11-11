import type { LockedTaskRow } from './activity-row.interface';

/** Fatos lidos após os locks, no relógio de execução do banco (São Paulo). */
export interface CollectionContextRow {
  evaluated_at: Date;
  reference_date: string;
  contract_status: string;
  uses_celcoin_integration: boolean;
  current_assigned_to: string | null;
  has_activity_gate_permission: boolean;
  has_open_pending_action: boolean;
  client_is_deceased: boolean;
  has_living_guarantor: boolean;
  reference_installment_id: string | null;
  reference_due_date: string | null;
  days_overdue: number | null;
  overdue_installment_count: number;
  collection_blocked: boolean;
  follow_up_completed: boolean;
  last_result: string | null;
  last_channel: string | null;
  last_execution_date: string | null;
  last_days_overdue: number | null;
  promise_date: string | null;
}

/** Contexto validado que pode ser salvo como snapshot da execução. */
export interface CollectionExecutionContext extends CollectionContextRow {
  reference_installment_id: string;
  reference_due_date: string;
  days_overdue: number;
}

export interface ActionableCollectionTask {
  task: LockedTaskRow;
  collection: CollectionExecutionContext;
}
