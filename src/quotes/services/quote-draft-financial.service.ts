import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveQuoteFinancialDto } from '../dto/save-quote-financial.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import {
  ExpenseCategory,
  LoanCategory,
  LoanInstitution,
} from '../enums/quote-financial.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteFinancialSnapshot } from '../interfaces/quote-financial-snapshot.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

@Injectable()
export class QuoteDraftFinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
  ) {}

  async save(
    quoteId: string,
    dto: SaveQuoteFinancialDto,
    actor: JwtPayload,
  ): Promise<QuoteFinancialSnapshot> {
    const financial = normalizeFinancial(dto);

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
          debts: financial.expenses.map((expense) => ({
            category: expense.category,
            amount: expense.amount,
            observations: expense.description ?? '',
          })),
          loans: financial.loans.map((loan) => ({
            category: loan.category,
            amount: loan.installmentAmount,
            observations: loan.description ?? '',
            frequency: loan.frequency,
            institution: loan.institution,
          })),
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.quoteDraftSteps.throwSaveError(
          tx,
          quoteId,
          actor,
          isAdmin,
          'A etapa Financeiro',
        );
      }

      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.FINANCIAL,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.FINANCIAL,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        expenses: financial.expenses,
        loans: financial.loans,
      };
    });
  }
}

function normalizeFinancial(dto: SaveQuoteFinancialDto) {
  const expenses = dto.expenses.map((expense, index) => {
    const description = expense.description?.trim();
    if (expense.category === ExpenseCategory.OTHER && !description) {
      throw new BadRequestException(
        `Informe a descrição da despesa ${index + 1}.`,
      );
    }

    return {
      category: expense.category,
      amount: expense.amount,
      ...(description ? { description } : {}),
    };
  });

  const loans = dto.loans.map((loan, index) => {
    const description = loan.description?.trim();
    const needsDescription =
      loan.category === LoanCategory.OTHER ||
      loan.institution === LoanInstitution.OTHER;
    if (needsDescription && !description) {
      throw new BadRequestException(
        `Informe a descrição do empréstimo ${index + 1}.`,
      );
    }

    return {
      installmentAmount: loan.installmentAmount,
      frequency: loan.frequency,
      institution: loan.institution,
      category: loan.category,
      ...(description ? { description } : {}),
    };
  });

  return { expenses, loans };
}
