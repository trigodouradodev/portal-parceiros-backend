import { BadRequestException } from '@nestjs/common';
import {
  ageAtInsuranceCoverageEnd,
  checkInsuranceEligibility,
  INSURANCE_MAX_AGE_AT_COVERAGE_END,
} from './insurance-eligibility';

/** Código estável do 400 para o frontend e a rastreabilidade. */
export const INSURANCE_AGE_INELIGIBLE = 'INSURANCE_AGE_INELIGIBLE';

export interface InsuranceAgeInput {
  birthDate: Date | null;
  installments: number;
  firstInstallmentDate: Date | null;
}

/**
 * Toda proposta do novo fluxo do Portal nasce com seguro prestamista, então a
 * idade do cliente precisa caber na regra da Caburé (maior de 18 hoje e, no
 * máximo, 70 anos ao fim da vigência) **ao criar a proposta** e sempre que a
 * data de nascimento é alterada. Recusa com 400 e orienta o prazo máximo.
 */
export function assertInsuranceAgeEligible(input: InsuranceAgeInput): void {
  const { birthDate, installments, firstInstallmentDate } = input;
  const result = checkInsuranceEligibility(
    birthDate,
    installments,
    firstInstallmentDate,
  );
  if (result.eligible) return;

  throw new BadRequestException({
    statusCode: 400,
    code: INSURANCE_AGE_INELIGIBLE,
    reason: result.reason,
    message: buildMessage(input, result.reason),
  });
}

function buildMessage(
  { birthDate, installments, firstInstallmentDate }: InsuranceAgeInput,
  reason: string | undefined,
): string {
  if (reason === 'SEM_DATA_NASCIMENTO' || !birthDate) {
    return 'Informe a data de nascimento do cliente para contratar o seguro.';
  }
  if (reason === 'MENOR_DE_IDADE') {
    return 'O cliente é menor de idade e não pode contratar o seguro.';
  }

  const age = ageAtInsuranceCoverageEnd(
    birthDate,
    installments,
    firstInstallmentDate,
  );
  const base = `O seguro prestamista cobre clientes de até ${INSURANCE_MAX_AGE_AT_COVERAGE_END} anos ao fim da vigência, e com ${installments} parcelas o cliente teria ${age} anos.`;
  const maxInstallments = maxEligibleInstallments(
    birthDate,
    installments,
    firstInstallmentDate,
  );
  return maxInstallments
    ? `${base} Reduza o prazo para até ${maxInstallments} parcelas.`
    : `${base} Nenhum prazo atende a esta idade.`;
}

/** Maior prazo menor que o pedido que ainda cabe na regra, ou null. */
function maxEligibleInstallments(
  birthDate: Date,
  requested: number,
  firstInstallmentDate: Date | null,
): number | null {
  for (let months = requested - 1; months >= 1; months--) {
    if (
      checkInsuranceEligibility(birthDate, months, firstInstallmentDate)
        .eligible
    ) {
      return months;
    }
  }
  return null;
}
