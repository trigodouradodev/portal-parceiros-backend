import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';

@Injectable()
export class QuoteDraftStepsService {
  completeWithinTransaction(
    tx: Prisma.TransactionClient,
    quoteId: string,
    step: QuoteDraftStep,
    updatedAt: Date,
  ) {
    return tx.quote_draft_steps.upsert({
      where: { quote_id_step: { quote_id: quoteId, step } },
      create: {
        quote_id: quoteId,
        step,
        completed_at: updatedAt,
        updated_at: updatedAt,
      },
      update: { updated_at: updatedAt },
      select: { completed_at: true, updated_at: true },
    });
  }

  async throwSaveError(
    tx: Prisma.TransactionClient,
    quoteId: string,
    actor: JwtPayload,
    isAdmin: boolean,
    stepLabel: string,
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
      `${stepLabel} não pode ser alterado no status ${quote.quote_status}.`,
    );
  }
}
