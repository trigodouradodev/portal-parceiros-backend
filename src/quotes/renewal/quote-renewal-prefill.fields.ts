import { Prisma } from '@prisma/client';

/**
 * Whitelist única do prefill de renovação.
 *
 * Campos da simulação, geolocalização e os passos 4 a 7 ficam deliberadamente
 * fora desta lista. Para incluir ou remover um dado do prefill, altere este
 * arquivo e cubra a mudança nos testes do serviço.
 */
export const RENEWAL_PREFILL_FIELD_WHITELIST = {
  registration: {
    gender: true,
    secondary_document: true,
    profession: true,
    business_activity_branch: true,
    business_activity_subcategory: true,
    economic_activity_categories: true,
    economic_activity_other: true,
    marital_status: true,
    spouse_document: true,
    children_count: true,
    household_members: true,
    housing_status: true,
    residence_duration: true,
    government_programs: true,
    owns_vehicle: true,
    vehicle_financed: true,
    credit_purpose: true,
  },
  income: {
    business_document: true,
    activity_duration: true,
    personal_income: true,
    income_source: true,
    has_multiple_income_sources: true,
    additional_incomes: true,
    available_income_proof: true,
  },
  address: {
    zipCode: true,
    streetName: true,
    streetNumber: true,
    streetComplement: true,
    streetDistrict: true,
    city: true,
    state: true,
    referencePoint: true,
  },
} as const;

export const RENEWAL_SOURCE_QUOTE_SELECT = {
  ...RENEWAL_PREFILL_FIELD_WHITELIST.registration,
  ...RENEWAL_PREFILL_FIELD_WHITELIST.income,

  // Endereço da proposta é usado somente se a party não tiver endereço.
  client_address: true,
} satisfies Prisma.quotesSelect;

export type RenewalSourceQuote = Prisma.quotesGetPayload<{
  select: typeof RENEWAL_SOURCE_QUOTE_SELECT;
}>;

export interface PartyAddressForRenewalPrefill {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string | null;
  zip_code: string;
  landmark: string | null;
}

type RenewalAddress = Record<
  keyof typeof RENEWAL_PREFILL_FIELD_WHITELIST.address,
  string | null
>;

export function buildRenewalPrefillUpdate(
  source: RenewalSourceQuote,
  partyAddress: PartyAddressForRenewalPrefill | null,
): Prisma.quotesUpdateInput {
  const address = partyAddress
    ? mapPartyAddress(partyAddress)
    : pickSourceQuoteAddress(source.client_address);

  return {
    is_renegotiation: true,

    // Cadastro
    gender: source.gender,
    secondary_document: source.secondary_document,
    profession: source.profession,
    business_activity_branch: source.business_activity_branch,
    business_activity_subcategory: source.business_activity_subcategory,
    economic_activity_categories:
      source.economic_activity_categories ?? Prisma.DbNull,
    economic_activity_other: source.economic_activity_other,
    marital_status: source.marital_status,
    spouse_document: source.spouse_document,
    children_count: source.children_count,
    household_members: source.household_members,
    housing_status: source.housing_status,
    residence_duration: source.residence_duration,
    government_programs: source.government_programs ?? Prisma.DbNull,
    owns_vehicle: source.owns_vehicle,
    vehicle_financed: source.vehicle_financed,
    credit_purpose: source.credit_purpose,

    // Atividade e renda
    business_document: source.business_document,
    activity_duration: source.activity_duration,
    personal_income: source.personal_income,
    income_source: source.income_source,
    has_multiple_income_sources: source.has_multiple_income_sources,
    additional_incomes:
      source.additional_incomes as unknown as Prisma.InputJsonValue,
    available_income_proof: source.available_income_proof,

    // Não inclui geolocation.
    client_address: address,
  };
}

function mapPartyAddress(
  address: PartyAddressForRenewalPrefill,
): RenewalAddress {
  return {
    zipCode: address.zip_code.replace(/\D/g, ''),
    streetName: address.street,
    streetNumber: address.number,
    streetComplement: address.complement ?? '',
    streetDistrict: address.neighborhood,
    city: address.city,
    state: address.state?.trim().toUpperCase() ?? '',
    referencePoint: address.landmark,
  };
}

function pickSourceQuoteAddress(value: Prisma.JsonValue): RenewalAddress {
  const address = asRecord(value);
  return {
    zipCode: stringOrEmpty(address?.zipCode),
    streetName: stringOrEmpty(address?.streetName),
    streetNumber: stringOrEmpty(address?.streetNumber),
    streetComplement: stringOrEmpty(address?.streetComplement),
    streetDistrict: stringOrEmpty(address?.streetDistrict),
    city: stringOrEmpty(address?.city),
    state: stringOrEmpty(address?.state),
    referencePoint: stringOrNull(address?.referencePoint),
  };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
