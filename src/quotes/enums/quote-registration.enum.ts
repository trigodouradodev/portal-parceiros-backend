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

/**
 * Categorias em que profissão faz sentido como dado próprio da pessoa —
 * CLT e Servidor Público porque Ramo de atividade pode ser o setor do
 * empregador (distinto do cargo da pessoa); Aposentado e Desempregado
 * porque não têm Ramo de atividade em curso para descrever a ocupação.
 * Empresário/Autônomo ficam de fora: a Subcategoria já descreve a
 * atividade de forma estruturada.
 */
export const PROFESSION_REQUIRED_CATEGORIES = [
  EconomicActivityCategory.CLT_EMPLOYEE,
  EconomicActivityCategory.PUBLIC_SERVANT,
  EconomicActivityCategory.RETIRED_OR_PENSIONER,
  EconomicActivityCategory.UNEMPLOYED,
];

export function requiresProfession(
  categories: EconomicActivityCategory[],
): boolean {
  // Chamada a partir de @ValidateIf antes de economicActivityCategories ter
  // sido validado como array — payload malformado não pode virar exceção.
  if (!Array.isArray(categories)) return false;
  return categories.some((category) =>
    PROFESSION_REQUIRED_CATEGORIES.includes(category),
  );
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

/**
 * Ramo de atividade do cliente (AUREA-XXX). Taxonomia alinhada com
 * `analytics.vw_dim_cliente_ocupacao.subgrupo_ocupacional`, coletada aqui de
 * forma estruturada para não depender da cascata de regex sobre a profissão
 * em texto livre (cobertura hoje de ~88%, com casos ambíguos).
 */
export enum BusinessActivityBranch {
  RETAIL_COMMERCE = 'retail_commerce',
  FOOD = 'food',
  AGRICULTURE_RURAL = 'agriculture_rural',
  CONSTRUCTION = 'construction',
  TRANSPORTATION = 'transportation',
  HEALTH_AND_CARE = 'health_and_care',
  EDUCATION = 'education',
  BEAUTY_AND_AESTHETICS = 'beauty_and_aesthetics',
  AUTOMOTIVE = 'automotive',
  INDUSTRY_AND_LOGISTICS = 'industry_and_logistics',
  DOMESTIC_SERVICES = 'domestic_services',
  SECURITY = 'security',
  ADMINISTRATIVE_OFFICE = 'administrative_office',
}

/**
 * Subcategoria de atividade — desambigua dentro de cada `BusinessActivityBranch`
 * (ex.: "Construção Civil" → pedreiro vs. eletricista vs. empreiteiro), com
 * valor sempre exigido junto do ramo. Taxonomia baseada na CNAE (IBGE/Receita
 * Federal) e na lista de atividades permitidas para MEI (CGSIM), adaptada
 * para linguagem de negócio. `OTHER` é o valor de escape comum a todo ramo.
 */
export enum BusinessActivitySubcategory {
  // Comércio / Varejo
  CLOTHING_AND_FASHION = 'clothing_and_fashion',
  COSMETICS_AND_PERFUMERY = 'cosmetics_and_perfumery',
  FOOD_AND_BEVERAGE_COMMERCE = 'food_and_beverage_commerce',
  STREET_VENDING = 'street_vending',
  BEVERAGE_DISTRIBUTOR = 'beverage_distributor',
  GENERAL_COMMERCE = 'general_commerce',

  // Alimentação
  RESTAURANT_OR_SNACK_BAR = 'restaurant_or_snack_bar',
  BAKERY_OR_CONFECTIONERY = 'bakery_or_confectionery',
  HOME_MEALS_OR_CATERING = 'home_meals_or_catering',
  FOOD_TRUCK_OR_STREET_FOOD = 'food_truck_or_street_food',
  EVENTS_CATERING = 'events_catering',

  // Agro / Rural
  CROP_FARMING = 'crop_farming',
  LIVESTOCK = 'livestock',
  POULTRY_OR_SWINE = 'poultry_or_swine',
  FISHING_OR_AQUACULTURE = 'fishing_or_aquaculture',

  // Construção Civil
  BRICKLAYER_OR_LABORER = 'bricklayer_or_laborer',
  ELECTRICIAN_OR_PLUMBER = 'electrician_or_plumber',
  SMALL_CONTRACTOR = 'small_contractor',
  PAINTER = 'painter',
  CARPENTRY_OR_MASONRY_WORK = 'carpentry_or_masonry_work',

  // Transporte
  APP_DRIVER = 'app_driver',
  TAXI_DRIVER = 'taxi_driver',
  DELIVERY_OR_MOTORCYCLE_COURIER = 'delivery_or_motorcycle_courier',
  FREIGHT_TRANSPORT = 'freight_transport',
  SCHOOL_OR_CHARTER_TRANSPORT = 'school_or_charter_transport',

  // Saúde e Cuidados
  ELDERLY_OR_HOME_CAREGIVER = 'elderly_or_home_caregiver',
  NURSING_TECHNICIAN = 'nursing_technician',
  THERAPIST_OR_PHYSIOTHERAPIST = 'therapist_or_physiotherapist',
  DOMESTIC_CARE_WORKER = 'domestic_care_worker',

  // Educação
  PRIVATE_TUTOR = 'private_tutor',
  DAYCARE_OR_SMALL_SCHOOL = 'daycare_or_small_school',
  LANGUAGE_OR_VOCATIONAL_COURSE = 'language_or_vocational_course',

  // Beleza e Estética
  HAIR_SALON_OR_BARBERSHOP = 'hair_salon_or_barbershop',
  MANICURE_OR_PEDICURE = 'manicure_or_pedicure',
  MOBILE_HAIRDRESSER = 'mobile_hairdresser',
  MAKEUP_OR_EYEBROW_DESIGN = 'makeup_or_eyebrow_design',
  BODY_AESTHETICS_CLINIC = 'body_aesthetics_clinic',

  // Automotivo
  AUTO_REPAIR_SHOP = 'auto_repair_shop',
  AUTO_PARTS = 'auto_parts',
  CAR_WASH_OR_DETAILING = 'car_wash_or_detailing',
  BODY_SHOP_OR_PAINT = 'body_shop_or_paint',

  // Indústria / Logística
  SMALL_MANUFACTURING = 'small_manufacturing',
  GARMENT_OR_SEWING_PRODUCTION = 'garment_or_sewing_production',
  CARPENTRY_OR_METALWORK_PRODUCTION = 'carpentry_or_metalwork_production',
  WAREHOUSING_OR_LOGISTICS = 'warehousing_or_logistics',

  // Serviços Domésticos
  DAY_LABORER_CLEANING = 'day_laborer_cleaning',
  LIVE_IN_OR_MONTHLY_HOUSEKEEPER = 'live_in_or_monthly_housekeeper',
  LAUNDRY_OR_IRONING = 'laundry_or_ironing',
  CLEANING_TEAM_OR_COMPANY = 'cleaning_team_or_company',

  // Segurança
  SECURITY_GUARD_EMPLOYEE = 'security_guard_employee',
  FREELANCE_SECURITY = 'freelance_security',
  SECURITY_COMPANY_OWNER = 'security_company_owner',

  // Administrativo / Escritório
  FREELANCE_ADMIN_ASSISTANT = 'freelance_admin_assistant',
  ACCOUNTING_OFFICE = 'accounting_office',
  VIRTUAL_ASSISTANT_OR_FREELANCER = 'virtual_assistant_or_freelancer',
  REAL_ESTATE_OR_INSURANCE_BROKER = 'real_estate_or_insurance_broker',

  // Comum a qualquer ramo
  OTHER = 'other',
}

/**
 * Subcategorias válidas por ramo — usada para rejeitar combinações
 * inconsistentes (ex.: branch "food" com subcategory "general_commerce").
 * `OTHER` é aceito em qualquer ramo, então não precisa estar listado aqui.
 */
export const BUSINESS_ACTIVITY_SUBCATEGORIES_BY_BRANCH: Record<
  BusinessActivityBranch,
  BusinessActivitySubcategory[]
> = {
  [BusinessActivityBranch.RETAIL_COMMERCE]: [
    BusinessActivitySubcategory.CLOTHING_AND_FASHION,
    BusinessActivitySubcategory.COSMETICS_AND_PERFUMERY,
    BusinessActivitySubcategory.FOOD_AND_BEVERAGE_COMMERCE,
    BusinessActivitySubcategory.STREET_VENDING,
    BusinessActivitySubcategory.BEVERAGE_DISTRIBUTOR,
    BusinessActivitySubcategory.GENERAL_COMMERCE,
  ],
  [BusinessActivityBranch.FOOD]: [
    BusinessActivitySubcategory.RESTAURANT_OR_SNACK_BAR,
    BusinessActivitySubcategory.BAKERY_OR_CONFECTIONERY,
    BusinessActivitySubcategory.HOME_MEALS_OR_CATERING,
    BusinessActivitySubcategory.FOOD_TRUCK_OR_STREET_FOOD,
    BusinessActivitySubcategory.EVENTS_CATERING,
  ],
  [BusinessActivityBranch.AGRICULTURE_RURAL]: [
    BusinessActivitySubcategory.CROP_FARMING,
    BusinessActivitySubcategory.LIVESTOCK,
    BusinessActivitySubcategory.POULTRY_OR_SWINE,
    BusinessActivitySubcategory.FISHING_OR_AQUACULTURE,
  ],
  [BusinessActivityBranch.CONSTRUCTION]: [
    BusinessActivitySubcategory.BRICKLAYER_OR_LABORER,
    BusinessActivitySubcategory.ELECTRICIAN_OR_PLUMBER,
    BusinessActivitySubcategory.SMALL_CONTRACTOR,
    BusinessActivitySubcategory.PAINTER,
    BusinessActivitySubcategory.CARPENTRY_OR_MASONRY_WORK,
  ],
  [BusinessActivityBranch.TRANSPORTATION]: [
    BusinessActivitySubcategory.APP_DRIVER,
    BusinessActivitySubcategory.TAXI_DRIVER,
    BusinessActivitySubcategory.DELIVERY_OR_MOTORCYCLE_COURIER,
    BusinessActivitySubcategory.FREIGHT_TRANSPORT,
    BusinessActivitySubcategory.SCHOOL_OR_CHARTER_TRANSPORT,
  ],
  [BusinessActivityBranch.HEALTH_AND_CARE]: [
    BusinessActivitySubcategory.ELDERLY_OR_HOME_CAREGIVER,
    BusinessActivitySubcategory.NURSING_TECHNICIAN,
    BusinessActivitySubcategory.THERAPIST_OR_PHYSIOTHERAPIST,
    BusinessActivitySubcategory.DOMESTIC_CARE_WORKER,
  ],
  [BusinessActivityBranch.EDUCATION]: [
    BusinessActivitySubcategory.PRIVATE_TUTOR,
    BusinessActivitySubcategory.DAYCARE_OR_SMALL_SCHOOL,
    BusinessActivitySubcategory.LANGUAGE_OR_VOCATIONAL_COURSE,
  ],
  [BusinessActivityBranch.BEAUTY_AND_AESTHETICS]: [
    BusinessActivitySubcategory.HAIR_SALON_OR_BARBERSHOP,
    BusinessActivitySubcategory.MANICURE_OR_PEDICURE,
    BusinessActivitySubcategory.MOBILE_HAIRDRESSER,
    BusinessActivitySubcategory.MAKEUP_OR_EYEBROW_DESIGN,
    BusinessActivitySubcategory.BODY_AESTHETICS_CLINIC,
  ],
  [BusinessActivityBranch.AUTOMOTIVE]: [
    BusinessActivitySubcategory.AUTO_REPAIR_SHOP,
    BusinessActivitySubcategory.AUTO_PARTS,
    BusinessActivitySubcategory.CAR_WASH_OR_DETAILING,
    BusinessActivitySubcategory.BODY_SHOP_OR_PAINT,
  ],
  [BusinessActivityBranch.INDUSTRY_AND_LOGISTICS]: [
    BusinessActivitySubcategory.SMALL_MANUFACTURING,
    BusinessActivitySubcategory.GARMENT_OR_SEWING_PRODUCTION,
    BusinessActivitySubcategory.CARPENTRY_OR_METALWORK_PRODUCTION,
    BusinessActivitySubcategory.WAREHOUSING_OR_LOGISTICS,
  ],
  [BusinessActivityBranch.DOMESTIC_SERVICES]: [
    BusinessActivitySubcategory.DAY_LABORER_CLEANING,
    BusinessActivitySubcategory.LIVE_IN_OR_MONTHLY_HOUSEKEEPER,
    BusinessActivitySubcategory.LAUNDRY_OR_IRONING,
    BusinessActivitySubcategory.CLEANING_TEAM_OR_COMPANY,
  ],
  [BusinessActivityBranch.SECURITY]: [
    BusinessActivitySubcategory.SECURITY_GUARD_EMPLOYEE,
    BusinessActivitySubcategory.FREELANCE_SECURITY,
    BusinessActivitySubcategory.SECURITY_COMPANY_OWNER,
  ],
  [BusinessActivityBranch.ADMINISTRATIVE_OFFICE]: [
    BusinessActivitySubcategory.FREELANCE_ADMIN_ASSISTANT,
    BusinessActivitySubcategory.ACCOUNTING_OFFICE,
    BusinessActivitySubcategory.VIRTUAL_ASSISTANT_OR_FREELANCER,
    BusinessActivitySubcategory.REAL_ESTATE_OR_INSURANCE_BROKER,
  ],
};

export function isSubcategoryValidForBranch(
  branch: BusinessActivityBranch | undefined,
  subcategory: BusinessActivitySubcategory | undefined,
): boolean {
  if (subcategory === BusinessActivitySubcategory.OTHER) return true;
  if (!branch || !subcategory) return false;
  return (
    BUSINESS_ACTIVITY_SUBCATEGORIES_BY_BRANCH[branch]?.includes(subcategory) ??
    false
  );
}
