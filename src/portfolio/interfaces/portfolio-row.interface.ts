import { Prisma } from '@prisma/client';

type Numeric = Prisma.Decimal | string | number | bigint | null;

export interface PortfolioSnapshotRow {
  portfolio_active_amount: Numeric;
  active_contracts: Numeric;
  delinquency_amount: Numeric;
  delinquent_contracts: Numeric;
  renegotiated_outstanding_amount: Numeric;
  scheduled_current_month_amount: Numeric;
}

export interface OriginationRow {
  month: string;
  origination_amount: Numeric;
  origination_contracts: Numeric;
  new_clients: Numeric;
  renewed_clients: Numeric;
  reactive_clients: Numeric;
  average_interest_rate: Numeric;
}

export interface ReceiptRow {
  current_month_amount: Numeric;
  advance_amount: Numeric;
  late_amount: Numeric;
}

export interface SettledRow {
  settled_contracts: Numeric;
}
