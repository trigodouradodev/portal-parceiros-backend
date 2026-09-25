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
  if (ageToday < 18) {
    return { eligible: false, reason: 'MENOR_DE_IDADE' };
  }

  const coverageStart = firstInstallmentDate ?? now;
  const coverageEnd = new Date(coverageStart);
  coverageEnd.setMonth(coverageEnd.getMonth() + loanPeriodMonths);

  const ageAtCoverageEnd = fullYearsBetween(birthDate, coverageEnd);
  if (ageAtCoverageEnd > 70) {
    return { eligible: false, reason: 'MAX_AGE_AT_CONTRACT_END' };
  }

  return { eligible: true };
}

export function fullYearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && to.getDate() < from.getDate())) {
    years--;
  }
  return years;
}
