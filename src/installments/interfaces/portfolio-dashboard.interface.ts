export interface RenewalMonthBucket {
  /** Mês de vencimento da última parcela, no formato 'YYYY-MM'. */
  month: string;
  count: number;
}

export interface PortfolioDashboard {
  /** Contratos disbursed/active com pelo menos uma parcela em aberto. */
  activeContracts: number;
  /** Contratos disbursed/active com parcela em aberto vencendo hoje. */
  dueTodayContracts: number;
  /** Contratos disbursed/active com pelo menos uma parcela em aberto vencida. */
  overdueContracts: number;
  /**
   * Contratos ativos cuja última parcela vence nos próximos 4 meses
   * (mês atual + 3), agrupados por mês de vencimento.
   */
  upcomingRenewals: {
    total: number;
    byMonth: RenewalMonthBucket[];
  };
}
