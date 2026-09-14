export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  NOT_INFORMED = 'not_informed',
}

export enum EconomicActivityCategory {
  RETIRED_OR_PENSIONER = 'retired_or_pensioner',
  PUBLIC_SERVANT = 'public_servant',
  CLT_EMPLOYEE = 'clt_employee',
  BUSINESS_OWNER = 'business_owner',
  SELF_EMPLOYED_OR_INFORMAL = 'self_employed_or_informal',
  UNEMPLOYED = 'unemployed',
  OTHER = 'other',
}

export enum MaritalStatus {
  SINGLE = 'single',
  MARRIED = 'married',
  STABLE_UNION = 'stable_union',
  DIVORCED = 'divorced',
  WIDOWED = 'widowed',
}

export enum HousingStatus {
  OWNED_PAID_OFF = 'owned_paid_off',
  OWNED_FINANCED = 'owned_financed',
  RENTED = 'rented',
  CEDED = 'ceded',
}

export enum ResidenceDuration {
  LESS_THAN_6_MONTHS = 'less_than_6_months',
  SIX_MONTHS_TO_2_YEARS = '6_months_to_2_years',
  TWO_TO_5_YEARS = '2_to_5_years',
  MORE_THAN_5_YEARS = 'more_than_5_years',
}

export enum GovernmentProgram {
  NONE = 'none',
  BOLSA_FAMILIA = 'bolsa_familia',
  BPC = 'bpc',
  OTHER = 'other',
}

export enum CreditPurpose {
  BUSINESS_WORKING_CAPITAL = 'business_working_capital',
  INVENTORY_PURCHASE = 'inventory_purchase',
  WORK_EQUIPMENT_OR_VEHICLE = 'work_equipment_or_vehicle',
  RENOVATION_OR_CONSTRUCTION = 'renovation_or_construction',
  NEW_BUSINESS = 'new_business',
  DEBT_PAYOFF_OR_REFINANCING = 'debt_payoff_or_refinancing',
  PERSONAL_EXPENSE = 'personal_expense',
  HEALTH = 'health',
  EDUCATION = 'education',
  OTHER = 'other',
}
