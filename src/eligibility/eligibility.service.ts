import { BadRequestException, Injectable } from '@nestjs/common';
import { cpfDigits, isValidCpf } from '../common/cpf.util';
import { CheckEligibilityDto } from './dto/check-eligibility.dto';
import { EligibilityResult } from './interfaces/eligibility-result.interface';

const MIN_AGE = 18;
const MAX_AGE = 120;

@Injectable()
export class EligibilityService {
  /**
   * Consulta elegibilidade do cliente. Hoje: CPF com DV válido + idade
   * 18–120. O ponto de troca para a Receita Federal é o `eligible` abaixo —
   * o contrato HTTP não muda.
   */
  check(dto: CheckEligibilityDto): EligibilityResult {
    const name = dto.name.trim();
    if (name.length < 3) {
      throw new BadRequestException('Informe o nome.');
    }

    const document = cpfDigits(dto.document);
    if (!isValidCpf(document)) {
      throw new BadRequestException('CPF inválido.');
    }

    const birthDate = this.parseDateOnly(dto.birthDate);
    this.assertAdultAge(birthDate);

    return {
      eligible: true,
      name,
      document,
      birthDate: toSqlDate(birthDate),
    };
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException('Data de nascimento inválida.');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('Data de nascimento inválida.');
    }
    return date;
  }

  private assertAdultAge(birthDate: Date): void {
    const age = differenceInUtcYears(birthDate, utcToday());
    if (age < MIN_AGE || age > MAX_AGE) {
      throw new BadRequestException('O cliente deve ter entre 18 e 120 anos.');
    }
  }
}

function toSqlDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function differenceInUtcYears(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const monthDelta = to.getUTCMonth() - from.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && to.getUTCDate() < from.getUTCDate())
  ) {
    years -= 1;
  }
  return years;
}
