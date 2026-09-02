import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
} from '../enums/quote-registration.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteRegistrationSnapshot } from '../interfaces/quote-registration-snapshot.interface';

@Injectable()
export class QuoteDraftRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

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
          is_renegotiation: registration.isRenegotiation,
          gender: registration.gender,
          secondary_document: registration.secondaryDocument,
          profession: registration.profession,
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
        await this.throwSaveError(tx, quoteId, actor, isAdmin);
      }

      const progress = await tx.quote_draft_steps.upsert({
        where: {
          quote_id_step: {
            quote_id: quoteId,
            step: QuoteDraftStep.REGISTRATION,
          },
        },
        create: {
          quote_id: quoteId,
          step: QuoteDraftStep.REGISTRATION,
          completed_at: updatedAt,
          updated_at: updatedAt,
        },
        update: { updated_at: updatedAt },
        select: { completed_at: true, updated_at: true },
      });

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.REGISTRATION,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        isRenegotiation: registration.isRenegotiation,
        gender: registration.gender,
        secondaryDocument: registration.secondaryDocument,
        profession: registration.profession,
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

  private async throwSaveError(
    tx: Prisma.TransactionClient,
    quoteId: string,
    actor: JwtPayload,
    isAdmin: boolean,
  ): Promise<never> {
    const quote = await tx.quotes.findUnique({
      where: { id: quoteId },
      select: {
        quote_status: true,
        current_sales_agent_id: true,
      },
    });

    if (!quote) {
      throw new NotFoundException('Proposta não encontrada.');
    }

    if (!isAdmin && quote.current_sales_agent_id !== actor.sub) {
      throw new ForbiddenException(
        'Somente o parceiro responsável pode editar esta proposta.',
      );
    }

    throw new ConflictException(
      `O cadastro não pode ser alterado no status ${quote.quote_status}.`,
    );
  }
}

type NormalizedRegistration = Omit<
  SaveQuoteRegistrationDto,
  'economicActivityOther' | 'spouseDocument' | 'vehicleFinanced'
> & {
  economicActivityOther: string | null;
  spouseDocument: string | null;
  vehicleFinanced: boolean | null;
};

function normalizeRegistration(
  dto: SaveQuoteRegistrationDto,
): NormalizedRegistration {
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
    secondaryDocument: dto.secondaryDocument.trim(),
    profession: dto.profession.trim(),
    economicActivityOther,
    spouseDocument,
    vehicleFinanced: dto.ownsVehicle ? (dto.vehicleFinanced ?? null) : null,
  };
}
