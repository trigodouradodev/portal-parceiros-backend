import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuoteActivityPermissionsService } from '../activities/quote-activity-permissions.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { normalizeCpf } from '../common/cpf.util';
import { normalizeBrazilianPhone } from '../common/phone.util';
import { CabureService } from '../cabure/cabure.service';
import { checkInsuranceEligibility } from '../cabure/insurance-eligibility';
import { CelcoinSimulationService } from '../celcoin/celcoin-simulation.service';
import { CelcoinSimulationResult } from '../celcoin/interfaces/celcoin-simulation.interface';
import { EligibilityService } from '../eligibility/eligibility.service';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListSimulationsQueryDto } from './dto/list-simulations-query.dto';
import { SimulateDto } from './dto/simulate.dto';
import { SimulationStatus } from './enums/simulation-status.enum';
import { SimulationSnapshot } from './interfaces/simulation.interface';
import { SimulateResult } from './interfaces/simulate-result.interface';

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
  max_tac_rate: Prisma.Decimal | number | string;
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
  installment_numbers: number;
  first_installment_date: Date;
  installment_amount: Prisma.Decimal | number | string;
  insurance_premium: Prisma.Decimal | number | string | null;
  installment_amount_with_insurance: Prisma.Decimal | number | string | null;
  created_at: Date;
  status?: string;
}

interface EditableSimulationRow {
  id: string;
  document: string;
  converted: boolean;
}

interface PreparedSimulation {
  name: string;
  document: string;
  telephone: string;
  email: string;
  birthDate: Date;
  firstInstallmentDate: Date;
  product: LinkedProduct;
  amount: number;
  installments: number;
  interestRate: number;
  tacRate: number;
  installmentAmount: number;
  simulationResult: CelcoinSimulationResult;
  insurance: InsurancePreview;
}

/**
 * Prêmio do seguro prestamista e o efeito dele na parcela, já calculado
 * pela Celcoin (financiado, com juros — mesmo mecanismo do TAC). `null`
 * quando o cliente não é elegível ou a Caburé/Celcoin falharam ao cotar —
 * nunca bloqueia a simulação de crédito em si.
 */
interface InsurancePreview {
  premium: number | null;
  cabureQuoteId: string | null;
  productCode: string | null;
  installmentAmount: number | null;
  simulationResult: CelcoinSimulationResult | null;
}

const UNAVAILABLE_INSURANCE: InsurancePreview = {
  premium: null,
  cabureQuoteId: null,
  productCode: null,
  installmentAmount: null,
  simulationResult: null,
};

type FinancialSimulationInput = Pick<
  SimulateDto,
  | 'productId'
  | 'amount'
  | 'installments'
  | 'firstInstallmentDate'
  | 'interestRate'
> & { birthDate: Date };

@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteActivityPermissions: QuoteActivityPermissionsService,
    private readonly partiesService: PartiesService,
    private readonly celcoinSimulation: CelcoinSimulationService,
    private readonly eligibilityService: EligibilityService,
    private readonly cabureService: CabureService,
  ) {}

  async listSimulations(
    userId: string,
    query: ListSimulationsQueryDto = {},
  ): Promise<SimulationSnapshot[]> {
    const whereClause = this.buildListWhereClause(userId, query);
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
        s.installment_numbers,
        s.first_installment_date,
        s.installment_amount,
        s.insurance_premium,
        s.installment_amount_with_insurance,
        s.created_at,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.quotes q
            WHERE q.simulation_id = s.id
          ) THEN ${SimulationStatus.CONVERTED}
          ELSE ${SimulationStatus.AVAILABLE}
        END AS status
      FROM public.simulations s
      JOIN public.finance_products fp ON fp.id = s.finance_product_id
      WHERE ${whereClause}
      ORDER BY s.created_at DESC, s.id DESC
    `;

    return rows.map((row) => this.toSnapshot(row));
  }

  async simulate(user: JwtPayload, dto: SimulateDto): Promise<SimulateResult> {
    const eligibility = this.eligibilityService.evaluate(dto);
    if (!eligibility.eligible) {
      return { eligible: false, simulation: null };
    }

    await this.assertCanSimulate(user);
    if (dto.simulationId) {
      await this.assertSimulationIsEditable(
        user.sub,
        dto.simulationId,
        dto.document,
      );
    }
    const prepared = await this.prepareSimulation(user, dto);
    const simulation = dto.simulationId
      ? await this.updateSimulation(user, dto.simulationId, prepared)
      : await this.createSimulation(user, prepared);

    return { eligible: true, simulation };
  }

  private async createSimulation(
    user: JwtPayload,
    prepared: PreparedSimulation,
  ): Promise<SimulationSnapshot> {
    const row = await this.prisma.$transaction(async (tx) => {
      const partyId = await this.partiesService.resolveForSimulation(
        {
          name: prepared.name,
          document: prepared.document,
          birthDate: prepared.birthDate,
          email: prepared.email,
          telephone: prepared.telephone,
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
        tac_amount,
        installment_numbers,
        first_installment_date,
        installment_amount,
        simulation_result,
        insurance_premium,
        cabure_quote_id,
        installment_amount_with_insurance,
        simulation_result_with_insurance,
        insurance_product_code
      )
      VALUES (
        ${user.sub}::uuid,
        ${partyId}::uuid,
        ${prepared.product.id}::uuid,
        ${prepared.name},
        ${prepared.document},
        ${toSqlDate(prepared.birthDate)}::date,
        ${prepared.email},
        ${prepared.telephone},
        ${prepared.amount},
        ${prepared.interestRate},
        ${prepared.tacRate},
        ${prepared.installments},
        ${toSqlDate(prepared.firstInstallmentDate)}::date,
        ${prepared.installmentAmount},
        ${JSON.stringify(prepared.simulationResult)}::jsonb,
        ${prepared.insurance.premium},
        ${prepared.insurance.cabureQuoteId}::uuid,
        ${prepared.insurance.installmentAmount},
        ${
          prepared.insurance.simulationResult === null
            ? null
            : JSON.stringify(prepared.insurance.simulationResult)
        }::jsonb,
        ${prepared.insurance.productCode}
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
        installment_numbers,
        first_installment_date,
        installment_amount,
        insurance_premium,
        installment_amount_with_insurance,
        created_at,
        ${SimulationStatus.AVAILABLE} AS status
      `;

      return createdSimulation;
    });

    if (!row) {
      throw new BadRequestException('Não foi possível persistir a simulação.');
    }

    return this.toSnapshot({
      ...row,
      product_name: prepared.product.product_name,
    });
  }

  private async updateSimulation(
    user: JwtPayload,
    id: string,
    prepared: PreparedSimulation,
  ): Promise<SimulationSnapshot> {
    const row = await this.prisma.$transaction(async (tx) => {
      const partyId = await this.partiesService.resolveForSimulation(
        {
          name: prepared.name,
          document: prepared.document,
          birthDate: prepared.birthDate,
          email: prepared.email,
          telephone: prepared.telephone,
        },
        tx,
      );

      const [updatedSimulation] = await tx.$queryRaw<
        Omit<SimulationRow, 'product_name'>[]
      >`
        UPDATE public.simulations s
        SET
          party_id = ${partyId}::uuid,
          finance_product_id = ${prepared.product.id}::uuid,
          client_name = ${prepared.name},
          document = ${prepared.document},
          birth_date = ${toSqlDate(prepared.birthDate)}::date,
          email = ${prepared.email},
          telephone = ${prepared.telephone},
          finance_amount = ${prepared.amount},
          interest_rate = ${prepared.interestRate},
          tac_amount = ${prepared.tacRate},
          installment_numbers = ${prepared.installments},
          first_installment_date = ${toSqlDate(prepared.firstInstallmentDate)}::date,
          installment_amount = ${prepared.installmentAmount},
          simulation_result = ${JSON.stringify(prepared.simulationResult)}::jsonb,
          insurance_premium = ${prepared.insurance.premium},
          cabure_quote_id = ${prepared.insurance.cabureQuoteId}::uuid,
          installment_amount_with_insurance = ${prepared.insurance.installmentAmount},
          simulation_result_with_insurance = ${
            prepared.insurance.simulationResult === null
              ? null
              : JSON.stringify(prepared.insurance.simulationResult)
          }::jsonb,
          insurance_product_code = ${prepared.insurance.productCode},
          updated_at = NOW()
        WHERE s.id = ${id}::uuid
          AND s.user_id = ${user.sub}::uuid
          AND NOT EXISTS (
            SELECT 1
            FROM public.quotes q
            WHERE q.simulation_id = s.id
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
          installment_numbers,
          first_installment_date,
          installment_amount,
          insurance_premium,
          installment_amount_with_insurance,
          created_at,
          ${SimulationStatus.AVAILABLE} AS status
      `;

      return updatedSimulation;
    });

    if (!row) {
      throw new ConflictException(
        'A simulação já foi convertida em proposta e não pode ser editada.',
      );
    }

    return this.toSnapshot({
      ...row,
      product_name: prepared.product.product_name,
    });
  }

  private async prepareSimulation(
    user: JwtPayload,
    dto: SimulateDto,
  ): Promise<PreparedSimulation> {
    const name = dto.name.trim();
    if (name.length < 3) {
      throw new BadRequestException('Informe o nome do tomador.');
    }

    const document = normalizeCpf(dto.document);
    const telephone = normalizeBrazilianPhone(dto.telephone);
    const birthDate = this.parseDateOnly(dto.birthDate, 'Data de nascimento');
    this.assertAdultAge(birthDate);
    const financial = await this.prepareFinancialPreview(user, {
      productId: dto.productId,
      amount: dto.amount,
      installments: dto.installments,
      firstInstallmentDate: dto.firstInstallmentDate,
      interestRate: dto.interestRate,
      birthDate,
    });

    return {
      name,
      document,
      telephone,
      email: dto.email.trim().toLowerCase(),
      birthDate,
      firstInstallmentDate: financial.firstInstallmentDate,
      product: financial.product,
      amount: financial.amount,
      installments: financial.installments,
      interestRate: financial.interestRate,
      tacRate: financial.tacRate,
      installmentAmount: financial.installmentAmount,
      simulationResult: financial.simulationResult,
      insurance: financial.insurance,
    };
  }

  private async prepareFinancialPreview(
    user: JwtPayload,
    dto: FinancialSimulationInput,
  ): Promise<{
    product: LinkedProduct;
    amount: number;
    installments: number;
    interestRate: number;
    tacRate: number;
    firstInstallmentDate: Date;
    installmentAmount: number;
    simulationResult: CelcoinSimulationResult;
    insurance: InsurancePreview;
  }> {
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

    const tacRate = toNum(product.max_tac_rate) || 0;
    const simulationResult =
      await this.celcoinSimulation.simulateRequestedAmount({
        requestedAmount: dto.amount,
        interestRate,
        installments: dto.installments,
        firstPaymentDate: toSqlDate(firstInstallmentDate),
        tacRate,
      });

    const insurance = await this.prepareInsurancePreview({
      amount: dto.amount,
      interestRate,
      tacRate,
      installments: dto.installments,
      birthDate: dto.birthDate,
      firstInstallmentDate,
    });

    return {
      product,
      amount: dto.amount,
      installments: dto.installments,
      interestRate,
      tacRate,
      firstInstallmentDate,
      installmentAmount: simulationResult.payment_amount,
      simulationResult,
      insurance,
    };
  }

  /**
   * Cota o seguro prestamista na Caburé (se o cliente for elegível) e roda
   * a Celcoin uma segunda vez com o prêmio em `insurance_amount`, pra obter
   * a parcela real financiada com seguro — mesmo mecanismo que a Celcoin já
   * usaria pra TAC. Nunca lança: qualquer falha (elegibilidade sem dado,
   * Caburé fora do ar, Celcoin recusando a segunda simulação) volta como
   * seguro indisponível, sem impedir a simulação de crédito em si.
   */
  private async prepareInsurancePreview(input: {
    amount: number;
    interestRate: number;
    tacRate: number;
    installments: number;
    birthDate: Date;
    firstInstallmentDate: Date;
  }): Promise<InsurancePreview> {
    const eligibility = checkInsuranceEligibility(
      input.birthDate,
      input.installments,
      input.firstInstallmentDate,
    );
    if (!eligibility.eligible) {
      return UNAVAILABLE_INSURANCE;
    }

    try {
      const cabureQuote = await this.cabureService.quote(
        input.amount,
        input.installments,
      );

      const simulationResult =
        await this.celcoinSimulation.simulateRequestedAmount({
          requestedAmount: input.amount,
          interestRate: input.interestRate,
          installments: input.installments,
          firstPaymentDate: toSqlDate(input.firstInstallmentDate),
          tacRate: input.tacRate,
          insuranceAmount: cabureQuote.premium,
        });

      return {
        premium: cabureQuote.premium,
        cabureQuoteId: cabureQuote.id,
        productCode: cabureQuote.productCode,
        installmentAmount: simulationResult.payment_amount,
        simulationResult,
      };
    } catch (error) {
      this.logger.warn(
        `Falha ao cotar seguro prestamista na simulação: ${String(error)}`,
      );
      return UNAVAILABLE_INSURANCE;
    }
  }

  private async assertCanSimulate(user: JwtPayload): Promise<void> {
    const gates = await this.quoteActivityPermissions.getPermissions({
      userId: user.sub,
      permissions: user.permissions,
    });
    if (!gates.canSimulateQuote) {
      throw new ForbiddenException(
        'Você possui ações de cobrança pendentes que impedem a simulação de proposta.',
      );
    }
  }

  private buildListWhereClause(
    userId: string,
    query: ListSimulationsQueryDto,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`s.user_id = ${userId}::uuid`];

    const name = query.name?.trim();
    if (name) {
      conditions.push(Prisma.sql`s.client_name ILIKE ${`%${name}%`}`);
    }

    const document = query.document?.replace(/\D/g, '') ?? '';
    if (document) {
      conditions.push(Prisma.sql`s.document LIKE ${`%${document}%`}`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private async assertSimulationIsEditable(
    userId: string,
    simulationId: string,
    document: string,
  ): Promise<void> {
    const [simulation] = await this.prisma.$queryRaw<EditableSimulationRow[]>`
      SELECT
        s.id,
        s.document,
        EXISTS (
          SELECT 1
          FROM public.quotes q
          WHERE q.simulation_id = s.id
        ) AS converted
      FROM public.simulations s
      WHERE s.id = ${simulationId}::uuid
        AND s.user_id = ${userId}::uuid
      LIMIT 1
    `;

    if (!simulation) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    if (simulation.converted) {
      throw new ConflictException(
        'A simulação já foi convertida em proposta e não pode ser editada.',
      );
    }

    if (simulation.document !== normalizeCpf(document)) {
      throw new BadRequestException(
        'O CPF não pode ser alterado em uma simulação existente.',
      );
    }
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
        fp.max_tac_rate,
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
      status:
        row.status === SimulationStatus.CONVERTED
          ? SimulationStatus.CONVERTED
          : SimulationStatus.AVAILABLE,
      name: row.client_name,
      birthDate: toSqlDate(new Date(row.birth_date)),
      email: row.email,
      telephone: row.telephone,
      document: row.document,
      productId: row.finance_product_id,
      productName: row.product_name,
      amount: toNum(row.finance_amount),
      installments: Number(row.installment_numbers),
      firstInstallmentDate: toSqlDate(firstInstallmentDate),
      installmentAmount: toNum(row.installment_amount),
      ...(row.insurance_premium == null
        ? {}
        : { insurancePremium: toNum(row.insurance_premium) }),
      ...(row.installment_amount_with_insurance == null
        ? {}
        : {
            installmentAmountWithInsurance: toNum(
              row.installment_amount_with_insurance,
            ),
          }),
    };
  }

  private parseDateOnly(value: string, label: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
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
    if (age < MIN_AGE || age > MAX_AGE) {
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
