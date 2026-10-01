import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { normalizeCpf } from '../../common/cpf.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveQuotePartnerOpinionDto } from '../dto/save-quote-partner-opinion.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { CustomerRelationshipOrigin } from '../enums/quote-partner-opinion.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuotePartnerOpinionSnapshot } from '../interfaces/quote-partner-opinion-snapshot.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

@Injectable()
export class QuoteDraftPartnerOpinionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
  ) {}

  async save(
    quoteId: string,
    dto: SaveQuotePartnerOpinionDto,
    actor: JwtPayload,
  ): Promise<QuotePartnerOpinionSnapshot> {
    const opinion = normalizePartnerOpinion(dto);

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
          customer_relationship_duration: opinion.relationshipDuration,
          customer_relationship_origin: opinion.relationshipOrigin,
          customer_relationship_other: opinion.relationshipOriginOther,
          referrer_document: opinion.referrerDocument,
          partner_assessment: opinion.assessment,
          informal_debt_signs: opinion.hasInformalDebtSigns,
          financial_urgency_signs: opinion.hasFinancialUrgencySigns,
          observations: opinion.opinion,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.quoteDraftSteps.throwSaveError(
          tx,
          quoteId,
          actor,
          isAdmin,
          'O parecer do parceiro',
        );
      }

      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.PARTNER_OPINION,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.PARTNER_OPINION,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        relationshipDuration: opinion.relationshipDuration,
        relationshipOrigin: opinion.relationshipOrigin,
        ...(opinion.relationshipOriginOther
          ? { relationshipOriginOther: opinion.relationshipOriginOther }
          : {}),
        ...(opinion.referrerDocument
          ? { referrerDocument: opinion.referrerDocument }
          : {}),
        assessment: opinion.assessment,
        hasInformalDebtSigns: opinion.hasInformalDebtSigns,
        hasFinancialUrgencySigns: opinion.hasFinancialUrgencySigns,
        opinion: opinion.opinion,
      };
    });
  }
}

type NormalizedPartnerOpinion = Omit<
  SaveQuotePartnerOpinionDto,
  'relationshipOriginOther' | 'referrerDocument'
> & {
  relationshipOriginOther: string | null;
  referrerDocument: string | null;
};

function normalizePartnerOpinion(
  dto: SaveQuotePartnerOpinionDto,
): NormalizedPartnerOpinion {
  const needsOther =
    dto.relationshipOrigin === CustomerRelationshipOrigin.OTHER;
  const needsReferrer =
    dto.relationshipOrigin ===
    CustomerRelationshipOrigin.AUREA_CUSTOMER_REFERRAL;

  if (needsOther && !dto.relationshipOriginOther?.trim()) {
    throw new BadRequestException(
      'Informe como o parceiro conheceu o cliente.',
    );
  }
  if (needsReferrer && !dto.referrerDocument?.trim()) {
    throw new BadRequestException('Informe o CPF de quem indicou o cliente.');
  }

  return {
    ...dto,
    relationshipOriginOther: needsOther
      ? (dto.relationshipOriginOther?.trim() ?? null)
      : null,
    referrerDocument: needsReferrer
      ? normalizeCpf(dto.referrerDocument ?? '')
      : null,
    opinion: dto.opinion.trim(),
  };
}
