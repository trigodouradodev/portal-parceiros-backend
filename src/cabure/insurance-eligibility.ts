// Regra portada de trigo-api/src/proposal/insurance-eligibility.ts (medida
// em ambiente contra a API da Caburé): o corte de idade é na data de FIM da
// vigência, não hoje. Como a vigência depende do prazo, o mesmo cliente
// pode ter seguro disponível num prazo e não em outro da mesma simulação -
// nunca tratar como sim/não fixo por cliente.
//
// coverageFrom = agora (momento da simulação) - ancorado aqui, não na data
// da primeira parcela, porque é isso que a Caburé de fato usa.
// coverageUntil = (firstInstallmentDate ?? agora) + prazoMeses.
//
// Cópia deliberada, não import entre repositórios (portal-parceiros-backend
// e trigo-api não se importam entre si) — as duas cópias precisam ficar
// sincronizadas se a regra mudar (data de corte, faixa de idade).
/** Idade mínima hoje e máxima ao fim da vigência (regra da Caburé). */
export const INSURANCE_MIN_AGE = 18;
export const INSURANCE_MAX_AGE_AT_COVERAGE_END = 70;

export interface InsuranceEligibilityResult {
  eligible: boolean;
  reason?: 'MENOR_DE_IDADE' | 'MAX_AGE_AT_CONTRACT_END' | 'SEM_DATA_NASCIMENTO';
}

export function checkInsuranceEligibility(
  birthDate: Date | null,
  loanPeriodMonths: number,
  firstInstallmentDate: Date | null,
): InsuranceEligibilityResult {
  if (!birthDate) {
    return { eligible: false, reason: 'SEM_DATA_NASCIMENTO' };
  }

  const now = new Date();

  const ageToday = fullYearsBetween(birthDate, now);
  if (ageToday < INSURANCE_MIN_AGE) {
    return { eligible: false, reason: 'MENOR_DE_IDADE' };
  }

  const ageAtCoverageEnd = ageAtInsuranceCoverageEnd(
    birthDate,
    loanPeriodMonths,
    firstInstallmentDate,
  );
  if (ageAtCoverageEnd > INSURANCE_MAX_AGE_AT_COVERAGE_END) {
    return { eligible: false, reason: 'MAX_AGE_AT_CONTRACT_END' };
  }

  return { eligible: true };
}

/** Idade do cliente na data de fim da vigência (primeira parcela + prazo). */
export function ageAtInsuranceCoverageEnd(
  birthDate: Date,
  loanPeriodMonths: number,
  firstInstallmentDate: Date | null,
): number {
  const coverageEnd = new Date(firstInstallmentDate ?? new Date());
  coverageEnd.setMonth(coverageEnd.getMonth() + loanPeriodMonths);
  return fullYearsBetween(birthDate, coverageEnd);
}

export function fullYearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && to.getDate() < from.getDate())) {
    years--;
  }
  return years;
}
