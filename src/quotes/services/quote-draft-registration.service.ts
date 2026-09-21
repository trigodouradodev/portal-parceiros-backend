import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { cpfDigits, isValidCpf } from '../../common/cpf.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveQuoteRegistrationDto } from '../dto/save-quote-registration.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  EconomicActivityCategory,
  GovernmentProgram,
  MaritalStatus,
  requiresProfession,
} from '../enums/quote-registration.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteRegistrationSnapshot } from '../interfaces/quote-registration-snapshot.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

const MIN_AGE = 18;
const MAX_AGE = 120;

@Injectable()
export class QuoteDraftRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
  ) {}

  /** Salva atomicamente o primeiro passo editável do wizard. */
  async save(
    quoteId: string,
    dto: SaveQuoteRegistrationDto,
    actor: JwtPayload,
  ): Promise<QuoteRegistrationSnapshot> {
    const registration = normalizeRegistration(dto);

    return this.prisma.$transaction(async (tx) => {
      const updatedAt = new Date();
      const isAdmin = actor.permissions.includes(PermissionKey.ROLE_ADMIN);
      const result = await tx.quotes.updateMany({
        where: {
          id: quoteId,
          quote_status: QuoteStatus.DRAFT,
          ...(isAdmin ? {} : { current_sales_agent_id: actor.sub }),
        },
        data: {
          client_name: registration.name,
          birth_date: registration.birthDate,
          email: registration.email,
          telephone: registration.telephone,
          is_renegotiation: registration.isRenegotiation,
          gender: registration.gender,
          secondary_document: registration.secondaryDocument,
          profession: registration.profession,
          business_activity_branch: registration.businessActivityBranch,
          business_activity_subcategory:
            registration.businessActivitySubcategory,
          economic_activity_categories: registration.economicActivityCategories,
          economic_activity_other: registration.economicActivityOther,
          marital_status: registration.maritalStatus,
          spouse_document: registration.spouseDocument,
          children_count: registration.childrenCount,
          household_members: registration.householdMembers,
          housing_status: registration.housingStatus,
          residence_duration: registration.residenceDuration,
          government_programs: registration.governmentPrograms,
          owns_vehicle: registration.ownsVehicle,
          vehicle_financed: registration.vehicleFinanced,
          credit_purpose: registration.creditPurpose,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.quoteDraftSteps.throwSaveError(
          tx,
          quoteId,
          actor,
          isAdmin,
          'O cadastro',
        );
      }

      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.REGISTRATION,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.REGISTRATION,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        name: registration.name,
        birthDate: toDateOnly(registration.birthDate),
        email: registration.email,
        telephone: registration.telephone,
        isRenegotiation: registration.isRenegotiation,
        gender: registration.gender,
        secondaryDocument: registration.secondaryDocument,
        ...(registration.profession === null
          ? {}
          : { profession: registration.profession }),
        businessActivityBranch: registration.businessActivityBranch,
        businessActivitySubcategory: registration.businessActivitySubcategory,
        economicActivityCategories: registration.economicActivityCategories,
        ...(registration.economicActivityOther === null
          ? {}
          : { economicActivityOther: registration.economicActivityOther }),
        maritalStatus: registration.maritalStatus,
        ...(registration.spouseDocument === null
          ? {}
          : { spouseDocument: registration.spouseDocument }),
        childrenCount: registration.childrenCount,
        householdMembers: registration.householdMembers,
        housingStatus: registration.housingStatus,
        residenceDuration: registration.residenceDuration,
        governmentPrograms: registration.governmentPrograms,
        ownsVehicle: registration.ownsVehicle,
        ...(registration.vehicleFinanced === null
          ? {}
          : { vehicleFinanced: registration.vehicleFinanced }),
        creditPurpose: registration.creditPurpose,
      };
    });
  }
}

type NormalizedRegistration = Omit<
  SaveQuoteRegistrationDto,
  | 'birthDate'
  | 'profession'
  | 'economicActivityOther'
  | 'spouseDocument'
  | 'vehicleFinanced'
> & {
  birthDate: Date;
  profession: string | null;
  economicActivityOther: string | null;
  spouseDocument: string | null;
  vehicleFinanced: boolean | null;
};

function normalizeRegistration(
  dto: SaveQuoteRegistrationDto,
): NormalizedRegistration {
  const name = dto.name.trim();
  if (name.length < 3) {
    throw new BadRequestException('Informe o nome do tomador.');
  }

  const birthDate = parseDateOnly(dto.birthDate);
  const age = differenceInUtcYears(birthDate, utcToday());
  if (age < MIN_AGE || age > MAX_AGE) {
    throw new BadRequestException('O tomador deve ter entre 18 e 120 anos.');
  }

  const telephone = normalizePhone(dto.telephone);

  const professionRequired = requiresProfession(dto.economicActivityCategories);
  const profession = professionRequired ? (dto.profession?.trim() ?? '') : null;
  if (professionRequired && (!profession || profession.length < 2)) {
    throw new BadRequestException('Informe a profissão.');
  }

  const hasOtherActivity = dto.economicActivityCategories.includes(
    EconomicActivityCategory.OTHER,
  );
  const economicActivityOther = hasOtherActivity
    ? (dto.economicActivityOther?.trim() ?? '')
    : null;
  if (
    hasOtherActivity &&
    (!economicActivityOther || economicActivityOther.length < 2)
  ) {
    throw new BadRequestException(
      'Informe a categoria de atividade econômica em Outros.',
    );
  }

  const hasSpouse =
    dto.maritalStatus === MaritalStatus.MARRIED ||
    dto.maritalStatus === MaritalStatus.STABLE_UNION;
  let spouseDocument: string | null = null;
  if (hasSpouse) {
    if (!dto.spouseDocument || !isValidCpf(dto.spouseDocument)) {
      throw new BadRequestException('CPF do cônjuge inválido.');
    }
    spouseDocument = cpfDigits(dto.spouseDocument);
  }

  if (
    dto.governmentPrograms.includes(GovernmentProgram.NONE) &&
    dto.governmentPrograms.length > 1
  ) {
    throw new BadRequestException(
      'Nenhum não pode ser combinado com outro programa de governo.',
    );
  }

  if (dto.ownsVehicle && typeof dto.vehicleFinanced !== 'boolean') {
    throw new BadRequestException('Informe se o veículo possui financiamento.');
  }

  return {
    ...dto,
    name,
    birthDate,
    email: dto.email.trim().toLowerCase(),
    telephone,
    secondaryDocument: dto.secondaryDocument.trim(),
    profession,
    economicActivityOther,
    spouseDocument,
    vehicleFinanced: dto.ownsVehicle ? (dto.vehicleFinanced ?? null) : null,
  };
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    throw new BadRequestException('Celular inválido.');
  }
  return digits;
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
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

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
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
