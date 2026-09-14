import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { normalizeCnpj } from '../../common/cnpj.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveQuoteIncomeDto } from '../dto/save-quote-income.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteIncomeSnapshot } from '../interfaces/quote-income-snapshot.interface';
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
    const income = normalizeIncome(dto);

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
          business_document: income.businessDocument,
          activity_duration: income.activityDuration,
          personal_income: income.declaredMonthlyIncome,
          income_source: income.incomeSource,
          has_multiple_income_sources: income.hasMultipleIncomeSources,
          secondary_income: income.secondaryIncome,
          available_income_proof: income.availableIncomeProof,
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
        ...(income.businessDocument === null
          ? {}
          : { businessDocument: income.businessDocument }),
        activityDuration: income.activityDuration,
        declaredMonthlyIncome: income.declaredMonthlyIncome,
        incomeSource: income.incomeSource,
        hasMultipleIncomeSources: income.hasMultipleIncomeSources,
        ...(income.secondaryIncome === null
          ? {}
          : { secondaryIncome: income.secondaryIncome }),
        availableIncomeProof: income.availableIncomeProof,
      };
    });
  }
}

type NormalizedIncome = Omit<
  SaveQuoteIncomeDto,
  'businessDocument' | 'secondaryIncome'
> & {
  businessDocument: string | null;
  secondaryIncome: number | null;
};

function normalizeIncome(dto: SaveQuoteIncomeDto): NormalizedIncome {
  const businessDocument = dto.businessDocument
    ? normalizeCnpj(dto.businessDocument)
    : null;

  if (
    dto.hasMultipleIncomeSources &&
    (typeof dto.secondaryIncome !== 'number' || dto.secondaryIncome <= 0)
  ) {
    throw new BadRequestException(
      'Informe uma renda secundária maior que zero.',
    );
  }

  return {
    ...dto,
    businessDocument,
    secondaryIncome: dto.hasMultipleIncomeSources
      ? (dto.secondaryIncome ?? null)
      : null,
  };
}
