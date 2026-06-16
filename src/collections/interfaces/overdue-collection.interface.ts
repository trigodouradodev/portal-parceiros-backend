/** Parcela vencida mais antiga de um contrato (driver do atraso). */
export interface OverdueInstallmentSummary {
  id: string;
  installmentNumber: number;
  /** Vencimento da parcela (data, sem hora). */
  dueDate: Date;
  /** Dias de atraso = CURRENT_DATE - due_date. */
  daysOverdue: number;
  pendingAmount: number;
  totalAmount: number;
  status: string;
  /** Nº de followups registrados para essa parcela. */
  followupCount: number;
  /** Status do followup mais recente da parcela (se houver). */
  latestFollowupStatus?: string;
}

/** Contrato atrasado, representado pela sua parcela vencida mais antiga. */
export interface OverdueContract {
  contractId: string;
  contractNumber: string;
  /** Total de parcelas do contrato (para "parcela X de Y"). */
  totalInstallments: number;
  clientName: string;
  clientTaxId: string;
  consultantName?: string;
  companyName?: string;
  collectionAgent?: { id: string; name: string };
  firstOverdueInstallment: OverdueInstallmentSummary;
}

export interface OverdueCollectionPage {
  contracts: OverdueContract[];
  pagination: {
    page: number;
    limit: number;
    totalContracts: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}
