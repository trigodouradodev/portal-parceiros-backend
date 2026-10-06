import {
  BadRequestException,
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
import { QuoteDraftStep } from './enums/quote-draft-step.enum';
import { QuoteStatusResponse } from './interfaces/quote-status-response.interface';
import { QuoteDraftDocumentationService } from './services/quote-draft-documentation.service';
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

const REQUIRED_DRAFT_STEPS = Object.values(QuoteDraftStep);

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteEvents: QuoteEventsService,
    private readonly quoteActivityPermissions: QuoteActivityPermissionsService,
    private readonly documentation: QuoteDraftDocumentationService,
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
            insurance_premium: true,
            cabure_quote_id: true,
            installment_amount_with_insurance: true,
            simulation_result_with_insurance: true,
            insurance_product_code: true,
            finance_products: { select: { product_name: true } },
            parties: {
              select: {
                addresses: {
                  orderBy: [
                    { is_primary: { sort: 'desc', nulls: 'last' } },
                    { created_at: 'desc' },
                  ],
                  take: 1,
                  select: {
                    street: true,
                    number: true,
                    complement: true,
                    neighborhood: true,
                    city: true,
                    state: true,
                    zip_code: true,
                    landmark: true,
                  },
                },
              },
            },
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

        const partyAddress = simulation.parties?.addresses[0];
        const initialAddress = toQuoteAddress(partyAddress);
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
            client_address: initialAddress,
            finance_amount: simulation.finance_amount,
            personal_income: 0,
            familiar_income: 0,
            activity_income: 0,
            income_model_version: 1,
            income_entries: [],
            first_installment_date: simulation.first_installment_date,
            installment_numbers: simulation.installment_numbers,
            payment_pix_type: 'CPF',
            payment_pix_code: '',
            signature_type: 'EMAIL',
            current_sales_agent_id: actor.sub,
            created_by: actor.sub,
            quote_status: QuoteStatus.DRAFT,
            document_attachment: [],
            proof_of_residence_attachment: [],
            proof_of_income_attachment: [],
            activity_photos_attachment: [],
            interest_rate: simulation.interest_rate,
            loans: [],
            debts: [],
            income_observations: '',
            finance_product_id: simulation.finance_product_id,
            tac_amount: 0,
            birth_date: simulation.birth_date,
            party_id: simulation.party_id,
            simulation_id: simulation.id,
            // `simulations.simulation_result` guarda a resposta BRUTA da
            // Celcoin (dezenas de campos, inclusive `payment_amount`) — é
            // formato de auditoria, não o contrato que `quotes` usa.
            // `quotes.simulation_result` pertence ao Backoffice
            // (trigo-connector), que só entende o formato mínimo abaixo
            // (`installment_amount`, não `payment_amount`). Copiar o blob
            // bruto pra cá já quebrou uma tela real do Backoffice (parcela
            // sem juros) — normaliza no momento em que a quote nasce.
            ...(simulation.simulation_result === null
              ? {}
              : {
                  simulation_result: {
                    installment_amount: extractSimulationNumber(
                      simulation.simulation_result,
                      'payment_amount',
                    ),
                    total_amount_owed: extractSimulationNumber(
                      simulation.simulation_result,
                      'total_amount_owed',
                    ),
                    created_at: new Date(),
                  },
                }),
            insurance_premium: simulation.insurance_premium,
            cabure_quote_id: simulation.cabure_quote_id,
            installment_amount_with_insurance:
              simulation.installment_amount_with_insurance,
            ...(simulation.simulation_result_with_insurance === null
              ? {}
              : {
                  simulation_result_with_insurance: {
                    installment_amount: extractSimulationNumber(
                      simulation.simulation_result_with_insurance,
                      'payment_amount',
                    ),
                    total_amount_owed: extractSimulationNumber(
                      simulation.simulation_result_with_insurance,
                      'total_amount_owed',
                    ),
                    created_at: new Date(),
                  },
                }),
            insurance_product_code: simulation.insurance_product_code,
          },
          select: { id: true, created_at: true },
        });

        // Adianta pra agora a gravação que hoje só acontece dentro de
        // buildInsuranceOffer (trigo-api) na primeira vez que o cliente vê
        // a proposta — reaproveitando o prêmio e a cotação já obtidos na
        // simulação, sem cotar a Caburé de novo. `getCabureInsuranceProposal`
        // do trigo-api encontra essa linha e usa o prêmio direto, sem
        // precisar de nenhuma mudança lá para o caminho feliz.
        if (simulation.cabure_quote_id && simulation.party_id) {
          await tx.$queryRaw`
            INSERT INTO public.cabure_insurance_proposals (
              quote_id,
              party_id,
              cabure_quote_id,
              premium,
              product_code,
              status
            )
            VALUES (
              ${quote.id}::uuid,
              ${simulation.party_id}::uuid,
              ${simulation.cabure_quote_id}::uuid,
              ${simulation.insurance_premium},
              ${simulation.insurance_product_code},
              'quoted'
            )
            ON CONFLICT (quote_id) DO NOTHING
            RETURNING id
          `;
        }

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
          ...(partyAddress ? { address: initialAddress } : {}),
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

      const completedSteps = await tx.quote_draft_steps.findMany({
        where: { quote_id: quoteId },
        select: { step: true },
      });
      const completed = new Set(completedSteps.map(({ step }) => step));
      const missingSteps = REQUIRED_DRAFT_STEPS.filter(
        (step) => !completed.has(step),
      );
      if (missingSteps.length > 0) {
        throw new BadRequestException({
          message: 'Complete todas as etapas antes de enviar a proposta.',
          missingSteps,
        });
      }

      await this.documentation.validateForSubmission(quoteId, tx);

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

function toQuoteAddress(address?: {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string | null;
  zip_code: string;
  landmark: string | null;
}) {
  if (!address) return EMPTY_ADDRESS;

  return {
    zipCode: address.zip_code.replace(/\D/g, ''),
    streetName: address.street,
    streetNumber: address.number,
    streetComplement: address.complement ?? '',
    streetDistrict: address.neighborhood,
    city: address.city,
    state: address.state?.trim().toUpperCase() ?? '',
    referencePoint: address.landmark,
  };
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
