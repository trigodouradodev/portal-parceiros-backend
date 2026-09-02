import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../auth/permissions/permission-keys';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteEventType } from '../quote-events/enums/quote-event-type.enum';
import { QuoteEventsService } from '../quote-events/quote-events.service';
import { QuoteStatus } from './enums/quote-status.enum';
import { QuoteStatusResponse } from './interfaces/quote-status-response.interface';
import { QuoteDraftSnapshot } from './interfaces/quote-draft-snapshot.interface';

const EMPTY_ADDRESS = {
  zipCode: '',
  streetName: '',
  streetNumber: '',
  streetComplement: '',
  streetDistrict: '',
  city: '',
  state: '',
  referencePoint: null,
};

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteEvents: QuoteEventsService,
    private readonly quoteActivityPermissions: QuoteActivityPermissionsService,
  ) {}

  /**
   * Converte uma simulação do parceiro em uma única quote draft, preservando o
   * snapshot financeiro que foi efetivamente calculado pela Celcoin.
   */
  async createDraftFromSimulation(
    simulationId: string,
    actor: JwtPayload,
  ): Promise<QuoteDraftSnapshot> {
    const gates = await this.quoteActivityPermissions.getPermissions({
      userId: actor.sub,
      permissions: actor.permissions,
    });
    if (!gates.canCreateQuote) {
      throw new ForbiddenException(
        'Você possui ações de cobrança pendentes que impedem iniciar uma proposta.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const simulation = await tx.simulations.findFirst({
          where: { id: simulationId, user_id: actor.sub },
          select: {
            id: true,
            party_id: true,
            finance_product_id: true,
            client_name: true,
            document: true,
            birth_date: true,
            email: true,
            telephone: true,
            finance_amount: true,
            interest_rate: true,
            installment_numbers: true,
            first_installment_date: true,
            installment_amount: true,
            simulation_result: true,
            finance_products: { select: { product_name: true } },
          },
        });
        if (!simulation) {
          throw new NotFoundException(
            'Simulação não encontrada para o parceiro autenticado.',
          );
        }

        const existing = await tx.quotes.findUnique({
          where: { simulation_id: simulationId },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException('A simulação já originou uma proposta.');
        }

        const quote = await tx.quotes.create({
          data: {
            is_renegotiation: false,
            quote_type: 'CPF',
            document: simulation.document,
            client_name: simulation.client_name,
            activity_type: 'CLT',
            profession: '',
            email: simulation.email,
            telephone: simulation.telephone,
            client_address: EMPTY_ADDRESS,
            finance_amount: simulation.finance_amount,
            personal_income: 0,
            familiar_income: 0,
            activity_income: 0,
            first_installment_date: simulation.first_installment_date,
            installment_numbers: simulation.installment_numbers,
            payment_pix_type: 'CPF',
            payment_pix_code: '',
            signature_type: 'EMAIL',
            current_sales_agent_id: actor.sub,
            quote_status: QuoteStatus.DRAFT,
            document_attachment: [],
            proof_of_residence_attachment: [],
            proof_of_income_attachment: [],
            interest_rate: simulation.interest_rate,
            loans: [],
            debts: [],
            income_observations: '',
            finance_product_id: simulation.finance_product_id,
            tac_amount: 0,
            birth_date: simulation.birth_date,
            party_id: simulation.party_id,
            simulation_id: simulation.id,
            ...(simulation.simulation_result === null
              ? {}
              : {
                  simulation_result: simulation.simulation_result,
                }),
          },
          select: { id: true, created_at: true },
        });

        await this.quoteEvents.createWithinTransaction(tx, {
          quoteId: quote.id,
          actorUserId: actor.sub,
          type: QuoteEventType.DRAFT_CREATED,
          metadata: { simulationId: simulation.id },
        });

        const totalAmountOwed = extractSimulationNumber(
          simulation.simulation_result,
          'total_amount_owed',
        );
        return {
          id: quote.id,
          simulationId: simulation.id,
          status: QuoteStatus.DRAFT,
          createdAt: (quote.created_at ?? new Date()).toISOString(),
          name: simulation.client_name,
          document: simulation.document,
          birthDate: toDateOnly(simulation.birth_date),
          email: simulation.email,
          telephone: simulation.telephone,
          productId: simulation.finance_product_id,
          productName: simulation.finance_products.product_name,
          interestRate: Number(simulation.interest_rate),
          financeAmount: Number(simulation.finance_amount),
          installmentNumbers: simulation.installment_numbers,
          firstInstallmentDate: toDateOnly(simulation.first_installment_date),
          installmentAmount: Number(simulation.installment_amount),
          ...(totalAmountOwed === undefined ? {} : { totalAmountOwed }),
        };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('A simulação já originou uma proposta.');
      }
      throw error;
    }
  }

  /**
   * Confirma que o parceiro terminou o draft e entrega a proposta para o
   * cliente revisar. O update condicional impede duas submissões concorrentes.
   */
  async submitDraftForClientReview(
    quoteId: string,
    actor: JwtPayload,
  ): Promise<QuoteStatusResponse> {
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
          quote_status: QuoteStatus.CLIENT_REVIEW,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.throwSubmitError(tx, quoteId, actor, isAdmin);
      }

      await this.quoteEvents.createWithinTransaction(tx, {
        quoteId,
        actorUserId: actor.sub,
        type: QuoteEventType.DRAFT_SUBMITTED,
        metadata: {
          previousStatus: QuoteStatus.DRAFT,
          newStatus: QuoteStatus.CLIENT_REVIEW,
        },
      });

      return {
        id: quoteId,
        status: QuoteStatus.CLIENT_REVIEW,
        updatedAt,
      };
    });
  }

  private async throwSubmitError(
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
        'Somente o parceiro responsável pode finalizar esta proposta.',
      );
    }

    throw new ConflictException(
      `A proposta não pode ser enviada para revisão a partir do status ${quote.quote_status}.`,
    );
  }
}

function extractSimulationNumber(
  value: unknown,
  key: string,
): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const number = (value as Record<string, unknown>)[key];
  return typeof number === 'number' && Number.isFinite(number)
    ? number
    : undefined;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  );
}
