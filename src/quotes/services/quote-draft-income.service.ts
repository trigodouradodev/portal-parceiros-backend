import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QuoteIncomeEntryDto,
  SaveQuoteIncomeDto,
} from '../dto/save-quote-income.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { IncomeEntryRole, IncomeSource } from '../enums/quote-income.enum';
import {
  EconomicActivityCategory,
  isSubcategoryValidForBranch,
  requiresProfession,
} from '../enums/quote-registration.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import {
  QuoteIncomeEntrySnapshot,
  QuoteIncomeSnapshot,
} from '../interfaces/quote-income-snapshot.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

@Injectable()
export class QuoteDraftIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
  ) {}

  async save(
    quoteId: string,
    dto: SaveQuoteIncomeDto,
    actor: JwtPayload,
  ): Promise<QuoteIncomeSnapshot> {
    const incomes = normalizeIncomes(dto);
    const primary = incomes[0];
    const secondaryIncomes = incomes.slice(1);
    const activityIncome = secondaryIncomes
      .filter((income) => income.source !== IncomeSource.FAMILY_INCOME)
      .reduce((total, income) => total + income.amount, 0);
    const familiarIncome = secondaryIncomes
      .filter((income) => income.source === IncomeSource.FAMILY_INCOME)
      .reduce((total, income) => total + income.amount, 0);

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
          income_model_version: 1,
          income_entries: incomes as unknown as Prisma.InputJsonValue,
          profession: primary.profession ?? null,
          economic_activity_categories: [primary.economicActivity],
          economic_activity_other: primary.economicActivityOther ?? null,
          business_activity_branch: primary.businessActivityBranch,
          business_activity_subcategory: primary.businessActivitySubcategory,
          business_document: null,
          activity_duration: primary.activityDuration,
          personal_income: primary.amount,
          activity_income: activityIncome,
          familiar_income: familiarIncome,
          income_source: primary.source,
          // Espelhos transitórios para consumidores da V1 anterior. Serão
          // removidos somente na migration de limpeza pós-rollout.
          has_multiple_income_sources: incomes.length > 1,
          additional_incomes: secondaryIncomes.map((income) => ({
            source: income.source,
            amount: income.amount,
          })) as unknown as Prisma.InputJsonValue,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.quoteDraftSteps.throwSaveError(
          tx,
          quoteId,
          actor,
          isAdmin,
          'A etapa Atividade e renda',
        );
      }

      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.INCOME,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.INCOME,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        incomeModelVersion: 1,
        incomes,
      };
    });
  }
}

function normalizeIncomes(dto: SaveQuoteIncomeDto): QuoteIncomeEntrySnapshot[] {
  if (dto.incomes[0]?.role !== IncomeEntryRole.PRIMARY) {
    throw new BadRequestException('A primeira renda deve ser a principal.');
  }
  if (
    dto.incomes
      .slice(1)
      .some((income) => income.role !== IncomeEntryRole.SECONDARY)
  ) {
    throw new BadRequestException(
      'Somente a primeira renda pode ser marcada como principal.',
    );
  }
  if (
    new Set(dto.incomes.map((income) => income.id)).size !== dto.incomes.length
  ) {
    throw new BadRequestException(
      'Cada renda deve possuir um identificador único.',
    );
  }

  return dto.incomes.map((income, index) =>
    normalizeIncomeEntry(income, index),
  );
}

function normalizeIncomeEntry(
  income: QuoteIncomeEntryDto,
  index: number,
): QuoteIncomeEntrySnapshot {
  if (
    income.role === IncomeEntryRole.PRIMARY &&
    income.source === IncomeSource.FAMILY_INCOME
  ) {
    throw new BadRequestException(
      'Renda Familiar é permitida apenas como renda secundária.',
    );
  }

  if (
    !isSubcategoryValidForBranch(
      income.businessActivityBranch,
      income.businessActivitySubcategory,
    )
  ) {
    throw new BadRequestException(
      `A subcategoria da renda ${index + 1} não pertence ao ramo selecionado.`,
    );
  }

  const professionRequired = requiresProfession([income.economicActivity]);
  const profession = professionRequired ? income.profession?.trim() : undefined;
  if (professionRequired && (!profession || profession.length < 2)) {
    throw new BadRequestException(`Informe a profissão da renda ${index + 1}.`);
  }

  const hasOtherActivity =
    income.economicActivity === EconomicActivityCategory.OTHER;
  const economicActivityOther = hasOtherActivity
    ? income.economicActivityOther?.trim()
    : undefined;
  if (
    hasOtherActivity &&
    (!economicActivityOther || economicActivityOther.length < 2)
  ) {
    throw new BadRequestException(
      `Informe a atividade econômica da renda ${index + 1}.`,
    );
  }

  const isFamilyIncome = income.source === IncomeSource.FAMILY_INCOME;
  if (isFamilyIncome && !income.familyRelationship) {
    throw new BadRequestException(
      `Informe o grau de parentesco da renda ${index + 1}.`,
    );
  }

  return {
    id: income.id.trim(),
    role: income.role,
    economicActivity: income.economicActivity,
    ...(economicActivityOther ? { economicActivityOther } : {}),
    ...(profession ? { profession } : {}),
    businessActivityBranch: income.businessActivityBranch,
    businessActivitySubcategory: income.businessActivitySubcategory,
    activityDuration: income.activityDuration,
    amount: income.amount,
    source: income.source,
    ...(isFamilyIncome && income.familyRelationship
      ? { familyRelationship: income.familyRelationship }
      : {}),
  };
}
