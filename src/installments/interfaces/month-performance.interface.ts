export interface MonthPerformance {
  /** Mês de referência (mês corrente) no formato 'YYYY-MM'. */
  month: string;
  /** Contratos desembolsados no mês. */
  origination: {
    count: number;
    amount: number;
  };
  /**
   * Média simples da interest_rate (loan_terms) dos contratos originados no
   * mês, em percentual (0–100, 2 casas). Ex.: 10.43 = 10,43%. `null` quando
   * não houve originação no período.
   */
  averageRate: number | null;
  /**
   * Inadimplência da carteira (snapshot atual) pela regra de arrasto:
   * contratos com atraso > 30d entram com o saldo devedor TOTAL; com atraso
   * 1–30d entram só com as parcelas vencidas; razão sobre o saldo em aberto.
   */
  delinquency: {
    /** Percentual (0–100). */
    rate: number;
    /** Valor inadimplente ponderado pela regra de arrasto. */
    overdueAmount: number;
    /** Saldo total em aberto da carteira (denominador). */
    portfolioOpenAmount: number;
  };
  /**
   * Contratos originados no mês de clientes que já tiveram pelo menos um
   * contrato com status 'closed' (novo ciclo de crédito — renovação).
   */
  renewals: number;
}
