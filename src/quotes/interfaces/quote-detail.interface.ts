import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrazilState } from '../../common/brazil-state.enum';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  AvailableIncomeProof,
  ActivityDuration,
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
import { QuoteDocumentationAttachments } from './quote-documentation.interface';
import {
  QuoteExpenseSnapshot,
  QuoteLoanSnapshot,
} from './quote-financial-snapshot.interface';
import { QuoteGeolocationSnapshot } from './quote-address-snapshot.interface';
import { GuarantorRelationship } from '../enums/quote-guarantor.enum';
import { QuoteConsultantSummary } from './quote-list.interface';

export class QuoteRegistrationDetail {
  @ApiProperty()
  isRenegotiation: boolean;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  gender: Gender | null;

  @ApiPropertyOptional({ nullable: true })
  secondaryDocument: string | null;

  @ApiProperty()
  profession: string;

  @ApiProperty({ enum: EconomicActivityCategory, isArray: true })
  economicActivityCategories: EconomicActivityCategory[];

  @ApiPropertyOptional({ nullable: true })
  economicActivityOther: string | null;

  @ApiPropertyOptional({ enum: MaritalStatus, nullable: true })
  maritalStatus: MaritalStatus | null;

  @ApiPropertyOptional({ nullable: true })
  spouseDocument: string | null;

  @ApiPropertyOptional({ nullable: true })
  childrenCount: number | null;

  @ApiPropertyOptional({ nullable: true })
  householdMembers: number | null;

  @ApiPropertyOptional({ enum: HousingStatus, nullable: true })
  housingStatus: HousingStatus | null;

  @ApiPropertyOptional({ enum: ResidenceDuration, nullable: true })
  residenceDuration: ResidenceDuration | null;

  @ApiProperty({ enum: GovernmentProgram, isArray: true })
  governmentPrograms: GovernmentProgram[];

  @ApiPropertyOptional({ nullable: true })
  ownsVehicle: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  vehicleFinanced: boolean | null;

  @ApiPropertyOptional({ enum: CreditPurpose, nullable: true })
  creditPurpose: CreditPurpose | null;
}

export class QuoteIncomeDetail {
  @ApiPropertyOptional({ nullable: true })
  businessDocument: string | null;

  @ApiPropertyOptional({ enum: ActivityDuration, nullable: true })
  activityDuration: ActivityDuration | null;

  @ApiProperty()
  declaredMonthlyIncome: number;

  @ApiPropertyOptional({ enum: IncomeSource, nullable: true })
  incomeSource: IncomeSource | null;

  @ApiPropertyOptional({ nullable: true })
  hasMultipleIncomeSources: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  secondaryIncome: number | null;

  @ApiPropertyOptional({ enum: AvailableIncomeProof, nullable: true })
  availableIncomeProof: AvailableIncomeProof | null;
}

export class QuoteAddressDetail {
  @ApiProperty()
  zipCode: string;

  @ApiProperty()
  streetName: string;

  @ApiProperty()
  streetNumber: string;

  @ApiProperty()
  streetComplement: string;

  @ApiProperty()
  streetDistrict: string;

  @ApiProperty()
  city: string;

  @ApiPropertyOptional({ enum: BrazilState, nullable: true })
  state: BrazilState | null;

  @ApiPropertyOptional({ nullable: true })
  referencePoint: string | null;

  @ApiPropertyOptional({ type: QuoteGeolocationSnapshot, nullable: true })
  geolocation: QuoteGeolocationSnapshot | null;
}

export class QuotePartnerOpinionDetail {
  @ApiPropertyOptional({ enum: CustomerRelationshipDuration, nullable: true })
  relationshipDuration: CustomerRelationshipDuration | null;

  @ApiPropertyOptional({ enum: CustomerRelationshipOrigin, nullable: true })
  relationshipOrigin: CustomerRelationshipOrigin | null;

  @ApiPropertyOptional({ nullable: true })
  relationshipOriginOther: string | null;

  @ApiPropertyOptional({ nullable: true })
  referrerDocument: string | null;

  @ApiPropertyOptional({ enum: PartnerAssessment, nullable: true })
  assessment: PartnerAssessment | null;

  @ApiPropertyOptional({ nullable: true })
  hasInformalDebtSigns: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  hasFinancialUrgencySigns: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  opinion: string | null;
}

export class QuoteGuarantorAddressDetail {
  @ApiProperty()
  zipCode: string;

  @ApiProperty()
  streetName: string;

  @ApiProperty()
  streetNumber: string;

  @ApiProperty()
  streetComplement: string;

  @ApiProperty()
  streetDistrict: string;

  @ApiProperty()
  city: string;

  @ApiPropertyOptional({ enum: BrazilState, nullable: true })
  state: BrazilState | null;
}

export class QuoteGuarantorDetail {
  @ApiProperty()
  name: string;

  @ApiProperty()
  document: string;

  @ApiProperty({ format: 'date' })
  birthDate: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  telephone: string;

  @ApiProperty({ type: () => QuoteGuarantorAddressDetail })
  address: QuoteGuarantorAddressDetail;

  @ApiPropertyOptional({ enum: GuarantorRelationship, nullable: true })
  relationship: GuarantorRelationship | null;
}

export class QuoteFinancialDetail {
  @ApiProperty({ type: [QuoteExpenseSnapshot] })
  expenses: QuoteExpenseSnapshot[];

  @ApiProperty({ type: [QuoteLoanSnapshot] })
  loans: QuoteLoanSnapshot[];
}

export class QuoteDetail {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  simulationId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  partyId: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  canEdit: boolean;

  @ApiProperty({ type: QuoteConsultantSummary })
  consultant: QuoteConsultantSummary;

  @ApiProperty({ enum: QuoteDraftStep, isArray: true })
  completedSteps: QuoteDraftStep[];

  @ApiPropertyOptional({ nullable: true })
  createdAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  updatedAt: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty()
  document: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  birthDate: string | null;

  @ApiProperty()
  email: string;

  @ApiProperty()
  telephone: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiPropertyOptional({ nullable: true })
  interestRate: number | null;

  @ApiProperty()
  financeAmount: number;

  @ApiProperty()
  installmentNumbers: number;

  @ApiProperty({ format: 'date' })
  firstInstallmentDate: string;

  @ApiPropertyOptional({ nullable: true })
  installmentAmount: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalAmountOwed: number | null;

  @ApiProperty({ type: QuoteRegistrationDetail })
  registration: QuoteRegistrationDetail;

  @ApiProperty({ type: QuoteIncomeDetail })
  income: QuoteIncomeDetail;

  @ApiProperty({ type: QuoteAddressDetail })
  address: QuoteAddressDetail;

  @ApiProperty({ type: QuotePartnerOpinionDetail })
  partnerOpinion: QuotePartnerOpinionDetail;

  @ApiPropertyOptional({ type: QuoteGuarantorDetail, nullable: true })
  guarantor: QuoteGuarantorDetail | null;

  @ApiProperty({ type: QuoteFinancialDetail })
  financial: QuoteFinancialDetail;

  @ApiProperty({ type: QuoteDocumentationAttachments })
  documentation: QuoteDocumentationAttachments;
}
