import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { SimulationsService } from '../../simulations/simulations.service';
import { UpdateDraftSimulationDto } from '../dto/update-draft-simulation.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteDraftSimulationSnapshot } from '../interfaces/quote-draft-simulation-snapshot.interface';

/**
 * Passos cuja conferência depende do valor e da parcela: o Financeiro compara a
 * renda com a parcela e a Documentação exige comprovante de renda acima de um
 * limite. Voltam a "não concluídos" quando as condições mudam.
 */
const STEPS_DEPENDING_ON_SIMULATION = [
  QuoteDraftStep.FINANCIAL,
  QuoteDraftStep.DOCUMENTATION,
];

/**
 * Edição das condições comerciais de uma proposta em rascunho (AUREA-701).
 *
 * A proposta guarda uma cópia do que veio da simulação, inclusive a cotação do
 * seguro. Alterar produto, valor, prazo ou primeira parcela exige refazer a
 * Celcoin e a Caburé e manter proposta, simulação e `cabure_insurance_proposals`
 * consistentes, numa única transação. Se qualquer cotação falhar, nada é gravado.
 */
@Injectable()
export class QuoteDraftSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulations: SimulationsService,
  ) {}

  async update(
    quoteId: string,
    dto: UpdateDraftSimulationDto,
    actor: JwtPayload,
  ): Promise<QuoteDraftSimulationSnapshot> {
    const isAdmin = actor.permissions.includes(PermissionKey.ROLE_ADMIN);
    const quote = await this.findEditableDraft(quoteId, actor, isAdmin);

    // Data de nascimento da proposta, não a da simulação: o passo Cadastro pode
    // tê-la corrigido, e é ela que vale para a elegibilidade ao seguro.
    const preview = await this.simulations.previewFinancialForDraft(actor, {
      productId: dto.productId,
      amount: dto.amount,
      installments: dto.installments,
      firstInstallmentDate: dto.firstInstallmentDate,
      birthDate: quote.birth_date,
    });

    const updatedAt = new Date();
    const simulationResult = toStoredResult(preview.simulationResult);
    const simulationResultWithInsurance = toStoredResult(
      preview.insurance.simulationResult,
    );

    await this.prisma.$transaction(async (tx) => {
      // O update condicional impede gravar sobre uma proposta que foi enviada
      // enquanto as cotações eram refeitas.
      const updated = await tx.quotes.updateMany({
        where: {
          id: quoteId,
          quote_status: QuoteStatus.DRAFT,
          ...(isAdmin ? {} : { current_sales_agent_id: actor.sub }),
        },
        data: {
          finance_product_id: preview.product.id,
          finance_amount: preview.amount,
          installment_numbers: preview.installments,
          first_installment_date: preview.firstInstallmentDate,
          interest_rate: preview.interestRate,
          tac_amount: preview.tacRate,
          simulation_result: simulationResult,
          insurance_premium: preview.insurance.premium,
          cabure_quote_id: preview.insurance.cabureQuoteId,
          installment_amount_with_insurance:
            preview.insurance.installmentAmount,
          simulation_result_with_insurance: simulationResultWithInsurance,
          insurance_product_code: preview.insurance.productCode,
          updated_at: updatedAt,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'A proposta não está mais em rascunho e não pode ser alterada.',
        );
      }

      await tx.simulations.update({
        where: { id: quote.simulation_id },
        data: {
          finance_product_id: preview.product.id,
          finance_amount: preview.amount,
          interest_rate: preview.interestRate,
          tac_amount: preview.tacRate,
          installment_numbers: preview.installments,
          first_installment_date: preview.firstInstallmentDate,
          installment_amount: preview.installmentAmount,
          simulation_result:
            preview.simulationResult as unknown as Prisma.InputJsonValue,
          insurance_premium: preview.insurance.premium,
          cabure_quote_id: preview.insurance.cabureQuoteId,
          installment_amount_with_insurance:
            preview.insurance.installmentAmount,
          simulation_result_with_insurance: preview.insurance
            .simulationResult as unknown as Prisma.InputJsonValue,
          insurance_product_code: preview.insurance.productCode,
          updated_at: updatedAt,
        },
      });

      // Cotação de seguro nova: a linha criada ao iniciar a proposta passa a
      // apontar para ela, senão a aprovação usaria o prêmio antigo.
      if (quote.party_id) {
        await tx.$executeRaw`
          INSERT INTO public.cabure_insurance_proposals (
            quote_id, party_id, cabure_quote_id, premium, product_code, status
          )
          VALUES (
            ${quoteId}::uuid,
            ${quote.party_id}::uuid,
            ${preview.insurance.cabureQuoteId}::uuid,
            ${preview.insurance.premium},
            ${preview.insurance.productCode},
            'quoted'
          )
          ON CONFLICT (quote_id) DO UPDATE SET
            cabure_quote_id = EXCLUDED.cabure_quote_id,
            premium = EXCLUDED.premium,
            product_code = EXCLUDED.product_code,
            status = 'quoted',
            updated_at = now()
        `;
      }

      await tx.quote_draft_steps.deleteMany({
        where: {
          quote_id: quoteId,
          step: { in: STEPS_DEPENDING_ON_SIMULATION },
        },
      });
    });

    return {
      id: quoteId,
      simulationId: quote.simulation_id,
      productId: preview.product.id,
      productName: preview.product.product_name,
      interestRate: preview.interestRate,
      financeAmount: preview.amount,
      installmentNumbers: preview.installments,
      firstInstallmentDate: preview.firstInstallmentDate
        .toISOString()
        .slice(0, 10),
      installmentAmount: preview.installmentAmount,
      installmentAmountWithInsurance: preview.insurance.installmentAmount,
      insurancePremium: preview.insurance.premium,
      totalAmountOwed: preview.simulationResult.total_amount_owed,
    };
  }

  private async findEditableDraft(
    quoteId: string,
    actor: JwtPayload,
    isAdmin: boolean,
  ) {
    const quote = await this.prisma.quotes.findUnique({
      where: { id: quoteId },
      select: {
        quote_status: true,
        current_sales_agent_id: true,
        simulation_id: true,
        birth_date: true,
        party_id: true,
      },
    });

    if (!quote) throw new NotFoundException('Proposta não encontrada.');
    if (!isAdmin && quote.current_sales_agent_id !== actor.sub) {
      throw new ForbiddenException(
        'Somente o parceiro responsável pode alterar esta proposta.',
      );
    }
    if (quote.quote_status !== (QuoteStatus.DRAFT as string)) {
      throw new ConflictException(
        'A proposta não está mais em rascunho e não pode ser alterada.',
      );
    }
    if (!quote.simulation_id) {
      throw new BadRequestException(
        'Esta proposta não tem uma simulação vinculada para recalcular.',
      );
    }
    if (!quote.birth_date) {
      throw new BadRequestException(
        'Informe a data de nascimento no passo Cadastro antes de alterar a simulação.',
      );
    }

    return {
      ...quote,
      simulation_id: quote.simulation_id,
      birth_date: quote.birth_date,
    };
  }
}

/** Mesmo formato mínimo que `quotes.simulation_result` guarda (ver createDraft). */
function toStoredResult(result: {
  payment_amount: number;
  total_amount_owed: number;
}) {
  return {
    installment_amount: result.payment_amount,
    total_amount_owed: result.total_amount_owed,
    created_at: new Date(),
  };
}
