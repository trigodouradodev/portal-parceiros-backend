import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { normalizeCpf } from '../common/cpf.util';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSimulationDto } from './dto/create-simulation.dto';
import { SimulationSnapshot } from './interfaces/simulation.interface';

const ALLOWED_DUE_DAYS = [5, 10, 15, 20];
const FIRST_INSTALLMENT_MAX_DAYS = 45;
const MIN_AGE = 18;
const MAX_AGE = 120;

interface LinkedProduct {
  id: string;
  product_name: string;
  min_installment_count: number;
  max_installment_count: number;
  min_interest_rate: Prisma.Decimal | number | string;
  max_interest_rate: Prisma.Decimal | number | string;
  enabled: boolean;
}

interface SimulationRow {
  id: string;
  finance_product_id: string;
  product_name: string;
  client_name: string;
  document: string;
  birth_date: Date;
  email: string;
  telephone: string;
  finance_amount: Prisma.Decimal | number | string;
  interest_rate: Prisma.Decimal | number | string;
  installment_numbers: number;
  first_installment_date: Date;
  installment_amount: Prisma.Decimal | number | string;
  simulation_result: unknown;
  created_at: Date;
}

@Injectable()
export class SimulationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteActivityPermissions: QuoteActivityPermissionsService,
    private readonly partiesService: PartiesService,
  ) {}

  async listSimulations(userId: string): Promise<SimulationSnapshot[]> {
    const rows = await this.prisma.$queryRaw<SimulationRow[]>`
      SELECT
        s.id,
        s.finance_product_id,
        fp.product_name,
        s.client_name,
        s.document,
        s.birth_date,
        s.email,
        s.telephone,
        s.finance_amount,
        s.interest_rate,
        s.installment_numbers,
        s.first_installment_date,
        s.installment_amount,
        s.simulation_result,
        s.created_at
      FROM public.simulations s
      JOIN public.finance_products fp ON fp.id = s.finance_product_id
      WHERE s.user_id = ${userId}::uuid
      ORDER BY s.created_at DESC, s.id DESC
    `;

    return rows.map((row) => this.toSnapshot(row));
  }

  async createSimulation(
    user: JwtPayload,
    dto: CreateSimulationDto,
  ): Promise<SimulationSnapshot> {
    const gates = await this.quoteActivityPermissions.getPermissions({
      userId: user.sub,
      permissions: user.permissions,
    });
    if (!gates.canSimulateQuote) {
      throw new ForbiddenException(
        'Você possui ações de cobrança pendentes que impedem a simulação de proposta.',
      );
    }

    const document = normalizeCpf(dto.document);
    const telephone = this.normalizePhone(dto.telephone);
    const birthDate = this.parseDateOnly(dto.birthDate, 'Data de nascimento');
    this.assertAdultAge(birthDate);
    const firstInstallmentDate = this.parseDateOnly(
      dto.firstInstallmentDate,
      'Data da primeira parcela',
    );
    this.assertAllowedDueDate(firstInstallmentDate);

    const product = await this.findLinkedProduct(user.sub, dto.productId);
    if (!product || !product.enabled) {
      throw new BadRequestException(
        'Produto não encontrado ou não vinculado ao parceiro.',
      );
    }

    if (
      dto.installments < product.min_installment_count ||
      dto.installments > product.max_installment_count
    ) {
      throw new BadRequestException(
        `Número de parcelas deve estar entre ${product.min_installment_count} e ${product.max_installment_count}.`,
      );
    }

    const minRate = toNum(product.min_interest_rate);
    const maxRate = toNum(product.max_interest_rate);
    const interestRate = dto.interestRate ?? maxRate;
    if (interestRate < minRate || interestRate > maxRate) {
      throw new BadRequestException(
        `Taxa de juros deve estar entre ${minRate} e ${maxRate}.`,
      );
    }

    const installmentAmount = calcInstallment(
      dto.amount,
      dto.installments,
      interestRate,
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const partyId = await this.partiesService.resolveForSimulation(
        {
          name: dto.name,
          document,
          email: dto.email,
          telephone,
        },
        tx,
      );

      const [createdSimulation] = await tx.$queryRaw<
        Omit<SimulationRow, 'product_name'>[]
      >`
        INSERT INTO public.simulations (
          user_id,
          party_id,
          finance_product_id,
          client_name,
          document,
          birth_date,
          email,
          telephone,
          finance_amount,
          interest_rate,
          installment_numbers,
          first_installment_date,
          installment_amount
        )
        VALUES (
          ${user.sub}::uuid,
          ${partyId}::uuid,
          ${product.id}::uuid,
          ${dto.name.trim()},
          ${document},
          ${toSqlDate(birthDate)}::date,
          ${dto.email.trim().toLowerCase()},
          ${telephone},
          ${dto.amount},
          ${interestRate},
          ${dto.installments},
          ${toSqlDate(firstInstallmentDate)}::date,
          ${installmentAmount}
        )
        RETURNING
          id,
          finance_product_id,
          client_name,
          document,
          birth_date,
          email,
          telephone,
          finance_amount,
          interest_rate,
          installment_numbers,
          first_installment_date,
          installment_amount,
          simulation_result,
          created_at
      `;

      return createdSimulation;
    });

    if (!row) {
      throw new BadRequestException('Não foi possível persistir a simulação.');
    }

    return this.toSnapshot({
      ...row,
      product_name: product.product_name,
    });
  }

  private async findLinkedProduct(
    userId: string,
    productId: string,
  ): Promise<LinkedProduct | undefined> {
    const [product] = await this.prisma.$queryRaw<LinkedProduct[]>`
      SELECT
        fp.id,
        fp.product_name,
        fp.min_installment_count,
        fp.max_installment_count,
        fp.min_interest_rate,
        fp.max_interest_rate,
        fp.enabled
      FROM public.consultant_finance_products cfp
      JOIN public.finance_products fp ON fp.id = cfp.finance_product_id
      WHERE cfp.consultant_id = ${userId}::uuid
        AND fp.id = ${productId}::uuid
      LIMIT 1
    `;
    return product;
  }

  private toSnapshot(row: SimulationRow): SimulationSnapshot {
    const createdAt = new Date(row.created_at);
    const firstInstallmentDate = new Date(row.first_installment_date);

    return {
      id: row.id,
      createdAt: createdAt.toISOString(),
      name: row.client_name,
      birthDate: toSqlDate(new Date(row.birth_date)),
      email: row.email,
      telephone: row.telephone,
      document: row.document,
      productId: row.finance_product_id,
      productName: row.product_name,
      interestRate: toNum(row.interest_rate),
      amount: toNum(row.finance_amount),
      installments: Number(row.installment_numbers),
      firstInstallmentDate: toSqlDate(firstInstallmentDate),
      installmentAmount: toNum(row.installment_amount),
      simulationResult: row.simulation_result ?? undefined,
    };
  }

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      throw new BadRequestException('Celular inválido.');
    }
    return digits;
  }

  private parseDateOnly(value: string, label: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`${label} inválida.`);
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
      throw new BadRequestException(`${label} inválida.`);
    }
    return date;
  }

  private assertAdultAge(birthDate: Date): void {
    const today = utcToday();
    const age = differenceInUtcYears(birthDate, today);
    if (age < MIN_AGE || age >= MAX_AGE) {
      throw new BadRequestException('O tomador deve ter entre 18 e 120 anos.');
    }
  }

  private assertAllowedDueDate(dueDate: Date): void {
    if (!ALLOWED_DUE_DAYS.includes(dueDate.getUTCDate())) {
      throw new BadRequestException(
        'A primeira parcela deve cair no dia 5, 10, 15 ou 20.',
      );
    }

    const today = utcToday();
    if (dueDate.getTime() < today.getTime()) {
      throw new BadRequestException(
        'A data da primeira parcela deve ser hoje ou futura.',
      );
    }

    const maxDate = addUtcDays(today, FIRST_INSTALLMENT_MAX_DAYS);
    if (dueDate.getTime() > maxDate.getTime()) {
      throw new BadRequestException(
        `A primeira parcela deve estar em até ${FIRST_INSTALLMENT_MAX_DAYS} dias.`,
      );
    }
  }
}

function toNum(value: Prisma.Decimal | number | string): number {
  return Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Price: `i` já é taxa mensal decimal (0.0339), como em finance_products. */
export function calcInstallment(
  amount: number,
  installments: number,
  monthlyRate: number,
): number {
  if (amount <= 0 || installments <= 0) return 0;
  if (monthlyRate <= 0) return round2(amount / installments);
  const installment =
    (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -installments));
  return round2(installment);
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

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
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
