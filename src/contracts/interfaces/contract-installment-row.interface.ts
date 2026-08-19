/** Linha bruta do `$queryRaw` que lista as parcelas de um contrato (AUREA-346). */
export interface ContractInstallmentRow {
  installment_number: number;
  due_date: Date;
  total_amount: string | number;
  pending_amount: string | number;
  payment_date: Date | null;
  display_status: string;
}
