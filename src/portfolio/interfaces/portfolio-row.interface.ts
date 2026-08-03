import { Prisma } from '@prisma/client';

type Numeric = Prisma.Decimal | string | number | bigint | null;

export interface PortfolioSnapshotRow {
  portfolio_active_amount: Numeric;
  active_contracts: Numeric;
  delinquency_amount: Numeric;
  delinquent_contracts: Numeric;
  renegotiated_outstanding_amount: Numeric;
}
