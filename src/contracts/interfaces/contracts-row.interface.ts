import { Prisma } from '@prisma/client';

type Numeric = Prisma.Decimal | string | number | bigint | null;

export interface ContractListRow {
  id: string;
  contract_number: string;
  client_name: string;
  company_name: string | null;
  consultant_name: string | null;
  product_name: string | null;
  disbursed_amount: Numeric;
  projected_amount: Numeric;
  outstanding_balance: Numeric;
  total_installments: number;
  disbursement_date: Date | null;
  next_due_date: Date | null;
}
