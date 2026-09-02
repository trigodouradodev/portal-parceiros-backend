export enum ActivityDuration {
  LESS_THAN_6_MONTHS = 'less_than_6_months',
  SIX_MONTHS_TO_1_YEAR = '6_months_to_1_year',
  ONE_TO_3_YEARS = '1_to_3_years',
  THREE_TO_5_YEARS = '3_to_5_years',
  MORE_THAN_5_YEARS = 'more_than_5_years',
}

export enum IncomeSource {
  SALARY = 'salary',
  OWN_BUSINESS = 'own_business',
  BENEFIT = 'benefit',
  RENT = 'rent',
  MIXED_INCOME = 'mixed_income',
}

export enum AvailableIncomeProof {
  PAYSLIP = 'payslip',
  BANK_STATEMENT = 'bank_statement',
  DAS_MEI = 'das_mei',
  INSS_BENEFIT = 'inss_benefit',
  NONE = 'none',
}
