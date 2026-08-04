import {
  BonusBand,
  BonusPillar,
  PartnerProgram,
} from './interfaces/partner-program.interface';
import { PermanenceMilestone } from './interfaces/performance-row.interface';

/**
 * Fixtures dos specs do módulo de performance.
 *
 * Espelham o seed real de `partner_bonus_bands`, `partner_levels`,
 * `partner_permanence_milestones` e da config
 * `PERFORMANCE_WELCOME_BONUS_AMOUNT`. Se o seed mudar, os specs que dependem
 * das fronteiras oficiais devem falhar — é essa a intenção.
 */

/** Faixas do pilar de desembolso: % da meta atingida. */
export const DISBURSEMENT_BANDS: BonusBand[] = [
  {
    minValue: 0,
    minInclusive: true,
    maxValue: 100,
    maxInclusive: false,
    bonusPercent: 0,
  },
  {
    minValue: 100,
    minInclusive: true,
    maxValue: 110,
    maxInclusive: false,
    bonusPercent: 10,
  },
  {
    minValue: 110,
    minInclusive: true,
    maxValue: 120,
    maxInclusive: false,
    bonusPercent: 15,
  },
  {
    minValue: 120,
    minInclusive: true,
    maxValue: null,
    maxInclusive: false,
    bonusPercent: 20,
  },
];

/** Faixas do pilar de risco: % de inadimplência (quanto menor, melhor). */
export const RISK_BANDS: BonusBand[] = [
  {
    minValue: 0,
    minInclusive: true,
    maxValue: 2,
    maxInclusive: true,
    bonusPercent: 50,
  },
  {
    minValue: 2,
    minInclusive: false,
    maxValue: 3.5,
    maxInclusive: true,
    bonusPercent: 33,
  },
  {
    minValue: 3.5,
    minInclusive: false,
    maxValue: 5,
    maxInclusive: true,
    bonusPercent: 15,
  },
  {
    minValue: 5,
    minInclusive: false,
    maxValue: null,
    maxInclusive: false,
    bonusPercent: 0,
  },
];

/**
 * Faixas do pilar de taxa média. A segunda é o intervalo de ponto único
 * `[9.5 , 9.5]` — taxa exatamente 9,5% destrava +10%, menos que a faixa logo
 * acima. É intencional no material comercial (RN05), não erro de transcrição.
 */
export const RATE_BANDS: BonusBand[] = [
  {
    minValue: 0,
    minInclusive: true,
    maxValue: 9.5,
    maxInclusive: false,
    bonusPercent: 0,
  },
  {
    minValue: 9.5,
    minInclusive: true,
    maxValue: 9.5,
    maxInclusive: true,
    bonusPercent: 10,
  },
  {
    minValue: 9.5,
    minInclusive: false,
    maxValue: 10,
    maxInclusive: true,
    bonusPercent: 20,
  },
  {
    minValue: 10,
    minInclusive: false,
    maxValue: null,
    maxInclusive: false,
    bonusPercent: 30,
  },
];

export const MILESTONES: PermanenceMilestone[] = [
  { month: 6, multiplier: 1 },
  { month: 12, multiplier: 2 },
  { month: 18, multiplier: 3 },
];

export const WELCOME_BONUS_AMOUNT = 4000;

/** Programa completo, como `loadProgram` devolveria com o seed real. */
export const PROGRAM: PartnerProgram = {
  welcomeBonusAmount: WELCOME_BONUS_AMOUNT,
  levels: [
    {
      key: 'BRONZE',
      label: 'Bronze',
      monthlyTarget: 100000,
      monthlyFixed: 4000,
    },
    {
      key: 'SILVER',
      label: 'Prata',
      monthlyTarget: 150000,
      monthlyFixed: 6000,
    },
    { key: 'GOLD', label: 'Ouro', monthlyTarget: 200000, monthlyFixed: 8000 },
    {
      key: 'PLATINUM',
      label: 'Platinum',
      monthlyTarget: 300000,
      monthlyFixed: 12000,
    },
  ],
  bonusPillars: [
    { pillar: BonusPillar.DISBURSEMENT, bands: DISBURSEMENT_BANDS },
    { pillar: BonusPillar.RISK, bands: RISK_BANDS },
    { pillar: BonusPillar.RATE, bands: RATE_BANDS },
  ],
  permanenceMilestones: MILESTONES,
};

/** Data `date` do Postgres (meia-noite UTC), como o driver entrega. */
export function pgDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
