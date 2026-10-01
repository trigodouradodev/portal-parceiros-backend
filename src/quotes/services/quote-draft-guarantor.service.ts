import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PermissionKey } from '../../auth/permissions/permission-keys';
import { normalizeCpf } from '../../common/cpf.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveQuoteGuarantorDto } from '../dto/save-quote-guarantor.dto';
import { QuoteDraftStep } from '../enums/quote-draft-step.enum';
import { QuoteStatus } from '../enums/quote-status.enum';
import { QuoteGuarantorSnapshot } from '../interfaces/quote-guarantor-snapshot.interface';
import { QuoteDraftStepsService } from './quote-draft-steps.service';

const MIN_AGE = 18;
const MAX_AGE_EXCLUSIVE = 120;

@Injectable()
export class QuoteDraftGuarantorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteDraftSteps: QuoteDraftStepsService,
  ) {}

  async save(
    quoteId: string,
    dto: SaveQuoteGuarantorDto,
    actor: JwtPayload,
  ): Promise<QuoteGuarantorSnapshot> {
    const guarantor = normalizeGuarantor(dto);

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
          guarantor,
          updated_at: updatedAt,
        },
      });

      if (result.count === 0) {
        await this.quoteDraftSteps.throwSaveError(
          tx,
          quoteId,
          actor,
          isAdmin,
          'O avalista',
        );
      }

      const quote = await tx.quotes.findUnique({
        where: { id: quoteId },
        select: { document: true },
      });
      if (
        quote?.document &&
        normalizeCpf(quote.document) === guarantor.document
      ) {
        throw new BadRequestException(
          'O avalista não pode ser a mesma pessoa que o tomador da proposta.',
        );
      }

      const progress = await this.quoteDraftSteps.completeWithinTransaction(
        tx,
        quoteId,
        QuoteDraftStep.GUARANTOR,
        updatedAt,
      );

      return {
        id: quoteId,
        status: QuoteStatus.DRAFT,
        step: QuoteDraftStep.GUARANTOR,
        completedAt: progress.completed_at,
        updatedAt: progress.updated_at,
        ...guarantor,
      };
    });
  }
}

function normalizeGuarantor(dto: SaveQuoteGuarantorDto) {
  const birthDate = parseDateOnly(dto.birthDate);
  const age = differenceInUtcYears(birthDate, utcToday());
  if (age < MIN_AGE || age >= MAX_AGE_EXCLUSIVE) {
    throw new BadRequestException('O avalista deve ter entre 18 e 119 anos.');
  }

  const telephoneDigits = dto.telephone.replace(/\D/g, '');
  const nationalTelephone =
    telephoneDigits.startsWith('55') && telephoneDigits.length > 11
      ? telephoneDigits.slice(2)
      : telephoneDigits;
  if (!/^\d{10,11}$/.test(nationalTelephone)) {
    throw new BadRequestException('Telefone do avalista inválido.');
  }

  return {
    name: dto.name.trim(),
    document: normalizeCpf(dto.document),
    birthDate: toSqlDate(birthDate),
    email: dto.email.trim().toLowerCase(),
    telephone: `+55${nationalTelephone}`,
    address: {
      zipCode: dto.address.zipCode.replace(/\D/g, ''),
      streetName: dto.address.streetName.trim(),
      streetNumber: dto.address.streetNumber.trim(),
      streetComplement: dto.address.streetComplement?.trim() ?? '',
      streetDistrict: dto.address.streetDistrict.trim(),
      city: dto.address.city.trim(),
      state: dto.address.state,
    },
    relationship: dto.relationship,
  };
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

function toSqlDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
