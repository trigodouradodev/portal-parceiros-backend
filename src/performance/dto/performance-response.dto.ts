import { ApiProperty } from '@nestjs/swagger';

export enum PerformanceIndicatorStatus {
  AVAILABLE = 'AVAILABLE',
  NO_MEASUREMENT = 'NO_MEASUREMENT',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum PerformanceAvailability {
  AVAILABLE = 'AVAILABLE',
  NO_DATA = 'NO_DATA',
}

export enum PerformanceLevelKey {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  AUREA = 'AUREA',
  HYBRID = 'HYBRID',
  REIMBURSEMENT = 'REIMBURSEMENT',
  COLLECTION_AGENT = 'COLLECTION_AGENT',
  UNKNOWN = 'UNKNOWN',
}

export class PerformanceMonthDto {
  @ApiProperty({ example: '2026-09' })
  month: string;
}

export class PerformanceMonthsResponseDto {
  @ApiProperty({ example: '2026-10', description: 'Mês corrente em Brasília.' })
  currentMonth: string;

  @ApiProperty({ type: [PerformanceMonthDto] })
  months: PerformanceMonthDto[];
}

export class PerformanceLevelDto {
  @ApiProperty({ enum: PerformanceLevelKey })
  key: PerformanceLevelKey;

  @ApiProperty({ type: String, nullable: true, example: 'Bronze' })
  label: string | null;
}

/** Reservada para a faixa efetivamente preservada pelo Analytics no futuro. */
export class AppliedPerformanceBandDto {
  @ApiProperty()
  minValue: number;

  @ApiProperty()
  minInclusive: boolean;

  @ApiProperty({ type: Number, nullable: true })
  maxValue: number | null;

  @ApiProperty()
  maxInclusive: boolean;

  @ApiProperty()
  bonusPercent: number;
}

export class PerformanceOriginationDto {
  @ApiProperty({ enum: PerformanceIndicatorStatus })
  status: PerformanceIndicatorStatus;

  @ApiProperty({ type: Number, nullable: true })
  amount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  targetAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  targetPercent: number | null;

  @ApiProperty({
    type: AppliedPerformanceBandDto,
    nullable: true,
    description: 'Null enquanto a fonte não informar a faixa aplicada.',
  })
  appliedBand: AppliedPerformanceBandDto | null;
}

export class PerformanceInterestRateDto {
  @ApiProperty({ enum: PerformanceIndicatorStatus })
  status: PerformanceIndicatorStatus;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Taxa considerada no bônus, na escala 0–100.',
  })
  rate: number | null;

  @ApiProperty({ type: Number, nullable: true })
  simpleRate: number | null;

  @ApiProperty({ type: Number, nullable: true })
  weightedRate: number | null;

  @ApiProperty({ type: AppliedPerformanceBandDto, nullable: true })
  appliedBand: AppliedPerformanceBandDto | null;
}

export class PerformanceDelinquencyDto {
  @ApiProperty({ enum: PerformanceIndicatorStatus })
  status: PerformanceIndicatorStatus;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Inadimplência considerada no bônus, na escala 0–100.',
  })
  rate: number | null;

  @ApiProperty({ type: Number, nullable: true })
  portfolioRate: number | null;

  @ApiProperty({ type: Number, nullable: true })
  overdueAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  portfolioAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  disregardedOverdueAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  disregardedPortfolioAmount: number | null;

  @ApiProperty({ type: AppliedPerformanceBandDto, nullable: true })
  appliedBand: AppliedPerformanceBandDto | null;
}

export class PerformanceReimbursementDto {
  @ApiProperty({ enum: PerformanceIndicatorStatus })
  status: PerformanceIndicatorStatus;

  @ApiProperty({ type: Number, nullable: true })
  amount: number | null;
}

export class PerformanceIndicatorsDto {
  @ApiProperty({ type: PerformanceOriginationDto })
  origination: PerformanceOriginationDto;

  @ApiProperty({ type: PerformanceInterestRateDto })
  interestRate: PerformanceInterestRateDto;

  @ApiProperty({ type: PerformanceDelinquencyDto })
  delinquency: PerformanceDelinquencyDto;

  @ApiProperty({ type: PerformanceReimbursementDto })
  reimbursement: PerformanceReimbursementDto;
}

/** Valores oficiais da view. Null não é convertido em zero nem entra em somas. */
export class PerformanceRemunerationDto {
  @ApiProperty({ type: Number, nullable: true })
  fixedAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  disbursementBonusAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  rateBonusAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  riskBonusAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  agreementAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  productionBonusAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  reimbursementBonusAmount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  totalAmount: number | null;
}

export class PerformanceDataDto {
  @ApiProperty({ type: PerformanceLevelDto })
  level: PerformanceLevelDto;

  @ApiProperty({ type: PerformanceRemunerationDto })
  remuneration: PerformanceRemunerationDto;

  @ApiProperty({ type: PerformanceIndicatorsDto })
  indicators: PerformanceIndicatorsDto;
}

export class PerformanceResponseDto {
  @ApiProperty({ example: '2026-09' })
  month: string;

  @ApiProperty({ enum: PerformanceAvailability })
  availability: PerformanceAvailability;

  @ApiProperty({ type: PerformanceDataDto, nullable: true })
  data: PerformanceDataDto | null;
}
