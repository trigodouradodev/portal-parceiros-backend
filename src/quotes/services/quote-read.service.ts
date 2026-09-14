import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { BrazilState } from '../../common/brazil-state.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../scope/scope.service';
import { ListQuotesQueryDto } from '../dto/list-quotes-query.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  IncomeProofType,
  QuoteAttachmentType,
} from '../enums/quote-documentation.enum';
import {
  ExpenseCategory,
  LoanCategory,
  LoanFrequency,
  LoanInstitution,
} from '../enums/quote-financial.enum';
import { GuarantorRelationship } from '../enums/quote-guarantor.enum';
import {
  ActivityDuration,
  AvailableIncomeProof,
  IncomeSource,
} from '../enums/quote-income.enum';
import {
  CustomerRelationshipDuration,
  CustomerRelationshipOrigin,
  PartnerAssessment,
} from '../enums/quote-partner-opinion.enum';
import {
  CreditPurpose,
  EconomicActivityCategory,
  Gender,
  GovernmentProgram,
  HousingStatus,
  MaritalStatus,
  ResidenceDuration,
} from '../enums/quote-registration.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteDetail } from '../interfaces/quote-detail.interface';
import {
  QuoteAttachmentSnapshot,
  QuoteDocumentationAttachments,
} from '../interfaces/quote-documentation.interface';
import { QuoteExpenseSnapshot } from '../interfaces/quote-financial-snapshot.interface';
import { QuoteLoanSnapshot } from '../interfaces/quote-financial-snapshot.interface';
import { QuoteListItem, QuotesPage } from '../interfaces/quote-list.interface';

const LIST_SELECT = {
  id: true,
  simulation_id: true,
  quote_status: true,
  client_name: true,
  document: true,
  finance_product_id: true,
  finance_amount: true,
  current_sales_agent_id: true,
  created_at: true,
  updated_at: true,
  finance_products: { select: { product_name: true } },
  trigo_users_quotes_current_sales_agent_idTotrigo_users: {
    select: { full_name: true },
  },
  quote_draft_steps: {
    select: { step: true },
    orderBy: [{ completed_at: 'asc' as const }, { step: 'asc' as const }],
  },
} satisfies Prisma.quotesSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  party_id: true,
  birth_date: true,
  email: true,
  telephone: true,
  interest_rate: true,
  installment_numbers: true,
  first_installment_date: true,
  simulation_result: true,
  is_renegotiation: true,
  gender: true,
  secondary_document: true,
  profession: true,
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
  business_document: true,
  activity_duration: true,
  personal_income: true,
  income_source: true,
  has_multiple_income_sources: true,
  secondary_income: true,
  available_income_proof: true,
  client_address: true,
  geolocation: true,
  customer_relationship_duration: true,
  customer_relationship_origin: true,
  customer_relationship_other: true,
  referrer_document: true,
  partner_assessment: true,
  informal_debt_signs: true,
  financial_urgency_signs: true,
  observations: true,
  guarantor: true,
  debts: true,
  loans: true,
  document_attachment: true,
  proof_of_residence_attachment: true,
  activity_photos_attachment: true,
  proof_of_income_attachment: true,
  simulations: { select: { installment_amount: true } },
} satisfies Prisma.quotesSelect;

type QuoteListRow = Prisma.quotesGetPayload<{ select: typeof LIST_SELECT }>;
type QuoteDetailRow = Prisma.quotesGetPayload<{ select: typeof DETAIL_SELECT }>;

@Injectable()
export class QuoteReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async list(
    actor: JwtPayload,
    query: ListQuotesQueryDto = new ListQuotesQueryDto(),
  ): Promise<QuotesPage> {
    const scopeWhere = await this.resolveScopeWhere(actor);
    if (scopeWhere === null) return emptyPage(query.page, query.limit);

    const search = query.search?.trim();
    const searchDocument = digits(search);
    const where: Prisma.quotesWhereInput = {
      ...scopeWhere,
      ...(search
        ? {
            OR: [
              {
                client_name: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              ...(searchDocument
                ? [{ document: { contains: searchDocument } }]
                : []),
            ],
          }
        : {}),
      ...(query.status ? { quote_status: query.status.trim() } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.quotes.count({ where }),
      this.prisma.quotes.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    const totalPages = Math.ceil(total / query.limit);

    return {
      items: rows.map((row) => this.toListItem(row, actor)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
      },
    };
  }

  async findById(quoteId: string, actor: JwtPayload): Promise<QuoteDetail> {
    const scopeWhere = await this.resolveScopeWhere(actor);
    if (scopeWhere === null) throw quoteNotFound();

    const row = await this.prisma.quotes.findFirst({
      where: { id: quoteId, ...scopeWhere },
      select: DETAIL_SELECT,
    });
    if (!row) throw quoteNotFound();

    return this.toDetail(row, actor);
  }

  private async resolveScopeWhere(
    actor: JwtPayload,
  ): Promise<Prisma.quotesWhereInput | null> {
    if (
      actor.permissions.includes(PermissionKey.ROLE_ADMIN) ||
      actor.permissions.includes(PermissionKey.QUOTE_VIEW_ALL)
    ) {
      return {};
    }

    const viewerScope = await this.scope.getViewerScopeIds(actor.sub);
    if (viewerScope.userIds.length === 0) return null;
    return { current_sales_agent_id: { in: viewerScope.userIds } };
  }

  private toListItem(row: QuoteListRow, actor: JwtPayload): QuoteListItem {
    return {
      id: row.id,
      simulationId: row.simulation_id,
      status: row.quote_status,
      name: row.client_name,
      document: row.document,
      productId: row.finance_product_id,
      productName: row.finance_products.product_name,
      financeAmount: Number(row.finance_amount),
      consultant: {
        id: row.current_sales_agent_id,
        name: row.trigo_users_quotes_current_sales_agent_idTotrigo_users
          .full_name,
      },
      completedSteps: mapCompletedSteps(row.quote_draft_steps),
      canEdit: canEdit(row, actor),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  private toDetail(row: QuoteDetailRow, actor: JwtPayload): QuoteDetail {
    const simulationResult = asRecord(row.simulation_result);
    const address = asRecord(row.client_address);
    const geolocation = asRecord(row.geolocation);

    return {
      ...this.toListItem(row, actor),
      partyId: row.party_id,
      birthDate: toDateOnly(row.birth_date),
      email: row.email,
      telephone: row.telephone,
      interestRate:
        row.interest_rate === null ? null : Number(row.interest_rate),
      installmentNumbers: row.installment_numbers,
      firstInstallmentDate: toDateOnly(row.first_installment_date) ?? '',
      installmentAmount:
        row.simulations === null
          ? numberOrNull(simulationResult?.payment_amount)
          : Number(row.simulations.installment_amount),
      totalAmountOwed: numberOrNull(simulationResult?.total_amount_owed),
      registration: {
        isRenegotiation: row.is_renegotiation,
        gender: row.gender as Gender | null,
        secondaryDocument: row.secondary_document,
        profession: row.profession,
        economicActivityCategories: stringArray(
          row.economic_activity_categories,
        ) as EconomicActivityCategory[],
        economicActivityOther: row.economic_activity_other,
        maritalStatus: row.marital_status as MaritalStatus | null,
        spouseDocument: row.spouse_document,
        childrenCount: row.children_count,
        householdMembers: row.household_members,
        housingStatus: row.housing_status as HousingStatus | null,
        residenceDuration: row.residence_duration as ResidenceDuration | null,
        governmentPrograms: stringArray(
          row.government_programs,
        ) as GovernmentProgram[],
        ownsVehicle: row.owns_vehicle,
        vehicleFinanced: row.vehicle_financed,
        creditPurpose: row.credit_purpose as CreditPurpose | null,
      },
      income: {
        businessDocument: row.business_document,
        activityDuration: row.activity_duration as ActivityDuration | null,
        declaredMonthlyIncome: Number(row.personal_income),
        incomeSource: row.income_source as IncomeSource | null,
        hasMultipleIncomeSources: row.has_multiple_income_sources,
        secondaryIncome:
          row.secondary_income === null ? null : Number(row.secondary_income),
        availableIncomeProof:
          row.available_income_proof as AvailableIncomeProof | null,
      },
      address: {
        zipCode: stringOrEmpty(address?.zipCode),
        streetName: stringOrEmpty(address?.streetName),
        streetNumber: stringOrEmpty(address?.streetNumber),
        streetComplement: stringOrEmpty(address?.streetComplement),
        streetDistrict: stringOrEmpty(address?.streetDistrict),
        city: stringOrEmpty(address?.city),
        state: enumOrNull(address?.state, BrazilState),
        referencePoint: stringOrNull(address?.referencePoint),
        geolocation: mapGeolocation(geolocation),
      },
      partnerOpinion: {
        relationshipDuration:
          row.customer_relationship_duration as CustomerRelationshipDuration | null,
        relationshipOrigin:
          row.customer_relationship_origin as CustomerRelationshipOrigin | null,
        relationshipOriginOther: row.customer_relationship_other,
        referrerDocument: row.referrer_document,
        assessment: row.partner_assessment as PartnerAssessment | null,
        hasInformalDebtSigns: row.informal_debt_signs,
        hasFinancialUrgencySigns: row.financial_urgency_signs,
        opinion: row.observations,
      },
      guarantor: mapGuarantor(row.guarantor),
      financial: {
        expenses: mapExpenses(row.debts),
        loans: mapLoans(row.loans),
      },
      documentation: mapDocumentation(row),
    };
  }
}

function emptyPage(page: number, limit: number): QuotesPage {
  return {
    items: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    },
  };
}

function quoteNotFound(): NotFoundException {
  return new NotFoundException('Proposta não encontrada.');
}

function canEdit(
  row: { quote_status: string; current_sales_agent_id: string },
  actor: JwtPayload,
): boolean {
  if (row.quote_status !== String(QuoteStatus.DRAFT)) return false;
  if (actor.permissions.includes(PermissionKey.ROLE_ADMIN)) return true;
  return (
    actor.permissions.includes(PermissionKey.QUOTE_CREATE) &&
    row.current_sales_agent_id === actor.sub
  );
}

function mapCompletedSteps(rows: { step: string }[]): QuoteDraftStep[] {
  return rows
    .map(({ step }) => step)
    .filter((step): step is QuoteDraftStep =>
      Object.values(QuoteDraftStep).includes(step as QuoteDraftStep),
    );
}

function mapGeolocation(value: Record<string, unknown> | null) {
  if (!value) return null;
  const latitude = numberOrNull(value.latitude);
  const longitude = numberOrNull(value.longitude);
  const precision = stringOrNull(value.precision);
  if (latitude === null || longitude === null || precision === null)
    return null;
  return { latitude, longitude, precision };
}

function mapGuarantor(value: unknown): QuoteDetail['guarantor'] {
  const guarantor = asRecord(value);
  const address = asRecord(guarantor?.address);
  if (!guarantor || !address) return null;

  const name = stringOrNull(guarantor.name);
  const document = stringOrNull(guarantor.document);
  const birthDate = stringOrNull(guarantor.birthDate);
  const email = stringOrNull(guarantor.email);
  const telephone = stringOrNull(guarantor.telephone);
  if (!name || !document || !birthDate || !email || !telephone) return null;

  return {
    name,
    document,
    birthDate,
    email,
    telephone,
    address: {
      zipCode: stringOrEmpty(address.zipCode),
      streetName: stringOrEmpty(address.streetName),
      streetNumber: stringOrEmpty(address.streetNumber),
      streetComplement: stringOrEmpty(address.streetComplement),
      streetDistrict: stringOrEmpty(address.streetDistrict),
      city: stringOrEmpty(address.city),
      state: enumOrNull(address.state, BrazilState),
    },
    relationship: enumOrNull(guarantor.relationship, GuarantorRelationship),
  };
}

function mapExpenses(value: unknown): QuoteExpenseSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const expense = asRecord(item);
    const category = stringOrNull(expense?.category);
    const amount = numberOrNull(expense?.amount);
    if (!category || amount === null) return [];
    const description = stringOrNull(
      expense?.description ?? expense?.observations,
    );
    return [
      {
        category: category as ExpenseCategory,
        amount,
        ...(description ? { description } : {}),
      },
    ];
  });
}

function mapLoans(value: unknown): QuoteLoanSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const loan = asRecord(item);
    const installmentAmount = numberOrNull(
      loan?.installmentAmount ?? loan?.amount,
    );
    const frequency = stringOrNull(loan?.frequency);
    const institution = stringOrNull(loan?.institution);
    const category = stringOrNull(loan?.category);
    if (installmentAmount === null || !frequency || !institution || !category) {
      return [];
    }
    const description = stringOrNull(loan?.description ?? loan?.observations);
    return [
      {
        installmentAmount,
        frequency: frequency as LoanFrequency,
        institution: institution as LoanInstitution,
        category: category as LoanCategory,
        ...(description ? { description } : {}),
      },
    ];
  });
}

function mapDocumentation(row: QuoteDetailRow): QuoteDocumentationAttachments {
  return {
    identificationDocuments: mapAttachments(
      row.document_attachment,
      QuoteAttachmentType.IDENTIFICATION_DOCUMENT,
    ),
    proofOfResidence: mapAttachments(
      row.proof_of_residence_attachment,
      QuoteAttachmentType.PROOF_OF_RESIDENCE,
    ),
    activityPhotos: mapAttachments(
      row.activity_photos_attachment,
      QuoteAttachmentType.ACTIVITY_PHOTO,
    ),
    proofOfIncome: mapAttachments(
      row.proof_of_income_attachment,
      QuoteAttachmentType.PROOF_OF_INCOME,
    ),
  };
}

function mapAttachments(
  value: unknown,
  attachmentType: QuoteAttachmentType,
): QuoteAttachmentSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const attachment = asRecord(item);
    const id = stringOrNull(attachment?.id);
    const filename = stringOrNull(attachment?.filename);
    const mimetype = stringOrNull(attachment?.mimetype);
    const size = numberOrNull(attachment?.size);
    const createdAt = dateStringOrNull(attachment?.createdAt);
    if (!id || !filename || !mimetype || size === null || !createdAt) return [];

    const incomeProofType = stringOrNull(attachment?.incomeProofType);
    return [
      {
        id,
        attachmentType,
        filename,
        mimetype,
        size,
        createdAt,
        ...(incomeProofType
          ? { incomeProofType: incomeProofType as IncomeProofType }
          : {}),
      },
    ];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function stringOrEmpty(value: unknown): string {
  return stringOrNull(value) ?? '';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateStringOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return stringOrNull(value);
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toDateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function digits(value?: string): string {
  return value?.replace(/\D/g, '') ?? '';
}

function enumOrNull<T extends Record<string, string>>(
  value: unknown,
  enumObject: T,
): T[keyof T] | null {
  if (typeof value !== 'string') return null;
  return Object.values(enumObject).includes(value)
    ? (value as T[keyof T])
    : null;
}
