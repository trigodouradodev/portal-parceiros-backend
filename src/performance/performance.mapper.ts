import { Prisma } from '@prisma/client';
import {
  PerformanceAvailability,
  PerformanceIndicatorStatus,
  PerformanceLevelKey,
  PerformanceMonthsResponseDto,
  PerformanceResponseDto,
} from './dto/performance-response.dto';
import {
  PerformanceMonthRow,
  PerformanceRow,
  PerformanceNumeric,
  PerformanceTeamRow,
} from './interfaces/performance-row.interface';

const LEVEL_KEYS: Readonly<Record<string, PerformanceLevelKey>> = {
  BRONZE: PerformanceLevelKey.BRONZE,
  PRATA: PerformanceLevelKey.SILVER,
  OURO: PerformanceLevelKey.GOLD,
  PLATINUM: PerformanceLevelKey.PLATINUM,
  AUREA: PerformanceLevelKey.AUREA,
  HIBRIDO: PerformanceLevelKey.HYBRID,
  REEMBOLSO: PerformanceLevelKey.REIMBURSEMENT,
  COBRADOR: PerformanceLevelKey.COLLECTION_AGENT,
};

const EXCLUSIVE_LEVELS = new Set([
  PerformanceLevelKey.BRONZE,
  PerformanceLevelKey.SILVER,
  PerformanceLevelKey.GOLD,
  PerformanceLevelKey.PLATINUM,
]);

function performanceNumber(value: PerformanceNumeric): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || value.trim() === '') &&
    !Prisma.Decimal.isDecimal(value)
  ) {
    throw new Error('invalid_performance_number');
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('invalid_performance_number');
  return number;
}

function indicatorStatus(
  applicable: boolean,
  value: number | null,
): PerformanceIndicatorStatus {
  if (!applicable) return PerformanceIndicatorStatus.NOT_APPLICABLE;
  return value === null
    ? PerformanceIndicatorStatus.NO_MEASUREMENT
    : PerformanceIndicatorStatus.AVAILABLE;
}

export function mapPerformanceMonths(
  rows: PerformanceMonthRow[],
): PerformanceMonthsResponseDto {
  if (!rows[0]?.current_month)
    throw new Error('missing_performance_reference_month');
  return {
    currentMonth: rows[0].current_month,
    months: rows
      .filter((row) => row.month !== null)
      .map((row) => ({
        month: row.month!,
      })),
  };
}

/** Adapta os valores oficiais do snapshot; não calcula taxas, metas, faixas ou remuneração. */
export function mapPerformance(row: PerformanceRow): PerformanceResponseDto {
  if (row.id_consultor === null) {
    return {
      month: row.requested_month,
      availability: PerformanceAvailability.NO_DATA,
      data: null,
    };
  }

  const normalizedLevel = row.nivel
    ?.trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
  const key =
    (normalizedLevel && LEVEL_KEYS[normalizedLevel]) ||
    PerformanceLevelKey.UNKNOWN;
  const exclusive = EXCLUSIVE_LEVELS.has(key);
  const unknown = key === PerformanceLevelKey.UNKNOWN;
  const hasOrigination = key !== PerformanceLevelKey.COLLECTION_AGENT;
  const hasRiskAndRate =
    exclusive || key === PerformanceLevelKey.AUREA || unknown;
  const hasReimbursement = [
    PerformanceLevelKey.HYBRID,
    PerformanceLevelKey.REIMBURSEMENT,
    PerformanceLevelKey.COLLECTION_AGENT,
    PerformanceLevelKey.UNKNOWN,
  ].includes(key);

  const originationAmount = hasOrigination
    ? performanceNumber(row.valor_originado_mes)
    : null;
  const rate = hasRiskAndRate ? performanceNumber(row.taxa_media_bonus) : null;
  const delinquencyRate = hasRiskAndRate
    ? performanceNumber(row.pct_inadimplencia_bonus)
    : null;
  const reimbursementAmount = hasReimbursement
    ? performanceNumber(row.valor_reembolso_mes)
    : null;

  return {
    month: row.requested_month,
    availability: PerformanceAvailability.AVAILABLE,
    data: {
      level: { key, label: row.nivel },
      remuneration: {
        fixedAmount: performanceNumber(row.valor_fixo_mensal),
        disbursementBonusAmount: performanceNumber(row.valor_bonus_desembolso),
        rateBonusAmount: performanceNumber(row.valor_bonus_taxa),
        riskBonusAmount: performanceNumber(row.valor_bonus_risco),
        agreementAmount: performanceNumber(row.valor_acordos),
        productionBonusAmount: performanceNumber(row.valor_bonus_producao),
        reimbursementBonusAmount: performanceNumber(row.valor_bonus_reembolso),
        totalAmount: performanceNumber(row.valor_remuneracao_total),
      },
      indicators: {
        origination: {
          status: indicatorStatus(hasOrigination, originationAmount),
          amount: originationAmount,
          targetAmount: exclusive
            ? performanceNumber(row.meta_originacao_mensal)
            : null,
          targetPercent: exclusive
            ? performanceNumber(row.pct_meta_atingido)
            : null,
          appliedBand: null,
        },
        interestRate: {
          status: indicatorStatus(hasRiskAndRate, rate),
          rate,
          simpleRate: hasRiskAndRate
            ? performanceNumber(row.taxa_media_simples)
            : null,
          weightedRate: hasRiskAndRate
            ? performanceNumber(row.taxa_media_ponderada)
            : null,
          appliedBand: null,
        },
        delinquency: {
          status: indicatorStatus(hasRiskAndRate, delinquencyRate),
          rate: delinquencyRate,
          portfolioRate: hasRiskAndRate
            ? performanceNumber(row.pct_inadimplencia)
            : null,
          overdueAmount: hasRiskAndRate
            ? performanceNumber(row.valor_inadimplencia)
            : null,
          portfolioAmount: hasRiskAndRate
            ? performanceNumber(row.valor_carteira_ativa)
            : null,
          disregardedOverdueAmount: hasRiskAndRate
            ? performanceNumber(row.valor_inadimplencia_desconsiderada)
            : null,
          disregardedPortfolioAmount: hasRiskAndRate
            ? performanceNumber(row.valor_carteira_desconsiderada)
            : null,
          appliedBand: null,
        },
        reimbursement: {
          status: indicatorStatus(hasReimbursement, reimbursementAmount),
          amount: reimbursementAmount,
        },
      },
    },
  };
}

/** Contribuição individual: não atribui nível, metas ou remuneração do titular. */
export function mapIndividualPerformance(
  month: string,
  row?: PerformanceTeamRow,
): PerformanceResponseDto {
  const number = (value: PerformanceNumeric | undefined) =>
    row ? performanceNumber(value ?? null) : 0;
  const amount = number(row?.valor_originado);
  const rate = number(row?.taxa_media);
  const reimbursement = number(row?.valor_reembolso_mes);
  return {
    month,
    availability: PerformanceAvailability.AVAILABLE,
    view: {
      mode: 'INDIVIDUAL',
      portfolioReference: row?.data_snapshot_parcelas ?? null,
      missingDetails: !row,
    },
    data: {
      level: { key: PerformanceLevelKey.UNKNOWN, label: null },
      contractsCount: row ? row.qtd_contratos : 0,
      remuneration: {
        fixedAmount: null,
        disbursementBonusAmount: null,
        rateBonusAmount: null,
        riskBonusAmount: null,
        agreementAmount: null,
        productionBonusAmount: null,
        reimbursementBonusAmount: null,
        totalAmount: null,
      },
      indicators: {
        origination: {
          status: indicatorStatus(true, amount),
          amount,
          targetAmount: null,
          targetPercent: null,
          appliedBand: null,
        },
        interestRate: {
          status: indicatorStatus(true, rate),
          rate,
          simpleRate: null,
          weightedRate: null,
          appliedBand: null,
        },
        delinquency: {
          status: PerformanceIndicatorStatus.AVAILABLE,
          rate: null,
          portfolioRate: null,
          overdueAmount: number(row?.valor_inadimplencia),
          portfolioAmount: number(row?.valor_carteira_ativa),
          disregardedOverdueAmount: number(
            row?.valor_inadimplencia_desconsiderada,
          ),
          disregardedPortfolioAmount: null,
          appliedBand: null,
        },
        reimbursement: {
          status: indicatorStatus(true, reimbursement),
          amount: reimbursement,
        },
      },
    },
  };
}
