import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toNum } from '../common/query.util';
import { PartnerProfile } from './interfaces/partner-profile.interface';
import { PartnerProgram } from './interfaces/partner-program.interface';
import { CurrentPerformance } from './interfaces/current-performance.interface';
import {
  BonusBandRow,
  DelinquencyRow,
  EnrollmentRow,
  OriginationRow,
  PermanenceMilestone,
  ProgramLevelRow,
} from './interfaces/performance-row.interface';
import {
  mapCurrentPerformance,
  mapPartnerProfile,
  mapPartnerProgram,
} from './performance.mapper';
import {
  findBandCoverageDefect,
  partnershipMonthNumber,
} from './performance.util';

/** Chave em `system_configs` do bônus de boas-vindas (R$). */
const WELCOME_BONUS_CONFIG_KEY = 'PERFORMANCE_WELCOME_BONUS_AMOUNT';

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Identidade, nível contratado e posição na trilha de permanência do parceiro
   * logado — insumo da barra de identidade e do ponto de partida do simulador.
   *
   * Não tem scope hierárquico: é dado próprio do viewer. O gate é estar inscrito
   * no programa; quem não está recebe 404 e a tela esconde a aba Desempenho.
   */
  async getPartnerProfile(
    userId: string,
    permissions: string[],
  ): Promise<PartnerProfile> {
    const enrollment = await this.findCurrentEnrollment(userId);
    if (!enrollment) throw new NotFoundException('partner_not_enrolled');

    // Parceria com início no futuro (cadastro antecipado pelo backoffice) ainda
    // não começou: mesma resposta de quem não está no programa, pra tela não
    // exibir "mês 0" nem liberar bônus de boas-vindas antes da hora.
    if (enrollment.started_at > enrollment.reference_date) {
      throw new NotFoundException('partner_not_enrolled');
    }

    const milestones = await this.findPermanenceMilestones();
    return mapPartnerProfile(userId, permissions, enrollment, milestones);
  }

  /**
   * Parâmetros do Programa de Parceiros Exclusivos: níveis, faixas dos 3 pilares
   * de bônus, marcos de permanência e o bônus de boas-vindas.
   *
   * Serve o simulador do front, que precisa avaliar as MESMAS faixas que o
   * cálculo real usa — sem isso as fronteiras ficariam hardcoded em dois
   * repositórios, livres para divergir.
   *
   * Sem cache de propósito: as tabelas são minúsculas e o motivo de estarem no
   * banco é o backoffice poder mudar sem deploy, o que um cache em memória
   * anularia. Se aparecer na latência, um TTL curto resolve.
   */
  getProgram(): Promise<PartnerProgram> {
    return this.loadProgram();
  }

  /**
   * Desempenho real do mês corrente do parceiro logado: originação contra a
   * meta, inadimplência da carteira e taxa média praticada — cada um já com o
   * bônus que destravou — mais a comissão resultante.
   *
   * As metas são individuais: sem expansão de subárvore, nada de ScopeService.
   * Originação e taxa média olham só o que ele originou (`consultant_id`); a
   * carteira da inadimplência inclui também o que ele cobra
   * (`current_collection_agent_id`). A assimetria é intencional.
   */
  async getCurrentPerformance(userId: string): Promise<CurrentPerformance> {
    const enrollment = await this.findCurrentEnrollment(userId);
    if (!enrollment) throw new NotFoundException('partner_not_enrolled');
    if (enrollment.started_at > enrollment.reference_date) {
      throw new NotFoundException('partner_not_enrolled');
    }

    const [program, origination, delinquency] = await Promise.all([
      this.loadProgram(),
      this.findMonthOrigination(userId),
      this.findPortfolioDelinquency(userId),
    ]);

    return mapCurrentPerformance({
      origination,
      delinquency,
      program,
      monthlyTarget: toNum(enrollment.monthly_target),
      monthlyFixed: toNum(enrollment.monthly_fixed),
      monthNumber: partnershipMonthNumber(
        enrollment.started_at,
        enrollment.reference_date,
      ),
    });
  }

  /** Lê os parâmetros do programa e valida as réguas antes de devolver. */
  private async loadProgram(): Promise<PartnerProgram> {
    const [welcomeBonusAmount, levels, bands, milestones] = await Promise.all([
      this.findWelcomeBonusAmount(),
      this.findActiveLevels(),
      this.findBonusBands(),
      this.findPermanenceMilestones(),
    ]);

    const program = mapPartnerProgram(
      welcomeBonusAmount,
      levels,
      bands,
      milestones,
    );

    // As faixas são editáveis em runtime, então validar só no boot não protegeria
    // o cenário que motivou tirá-las do código. Régua defeituosa falha alto: bem
    // melhor que pagar bônus errado em silêncio.
    for (const pillar of program.bonusPillars) {
      const defect = findBandCoverageDefect(pillar.bands);
      if (defect) {
        throw new InternalServerErrorException(
          `Faixas de bônus mal cadastradas em partner_bonus_bands ` +
            `(pilar ${pillar.pillar}): ${defect}.`,
        );
      }
    }

    if (program.levels.length === 0) {
      throw new InternalServerErrorException(
        'Nenhum nível ativo em partner_levels.',
      );
    }
    if (program.permanenceMilestones.length === 0) {
      throw new InternalServerErrorException(
        'Nenhum marco em partner_permanence_milestones.',
      );
    }

    return program;
  }

  /**
   * Bônus de boas-vindas (R$) da config `PERFORMANCE_WELCOME_BONUS_AMOUNT`.
   *
   * `system_configs.value` é texto livre, então chave ausente, valor não numérico
   * e valor negativo são erros de configuração e falham alto. Cair para 0 seria
   * pior que erro: 0 é indistinguível de "não é o 1º mês de parceria" e o valor
   * simplesmente desapareceria da tela.
   */
  private async findWelcomeBonusAmount(): Promise<number> {
    const config = await this.prisma.system_configs.findUnique({
      where: { key: WELCOME_BONUS_CONFIG_KEY },
      select: { value: true },
    });
    if (!config) {
      throw new InternalServerErrorException(
        `Config ${WELCOME_BONUS_CONFIG_KEY} ausente em system_configs.`,
      );
    }
    const amount = Number(config.value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new InternalServerErrorException(
        `Config ${WELCOME_BONUS_CONFIG_KEY} inválida: '${config.value}'.`,
      );
    }
    return amount;
  }

  /** Níveis ativos, em ordem crescente de meta (base da tabela comparativa). */
  private findActiveLevels(): Promise<ProgramLevelRow[]> {
    return this.prisma.partner_levels.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
      select: {
        key: true,
        name: true,
        monthly_target_amount: true,
        monthly_fixed_amount: true,
      },
    });
  }

  /**
   * Faixas de bônus dos 3 pilares.
   *
   * Ordenadas por `sort_order`, e não por `min_value`: a faixa de ponto único da
   * taxa (`[9.5 , 9.5]`) compartilha o `min_value` com a faixa seguinte
   * (`(9.5 , 10]`), então valor não é ordem total e o desempate ficaria a cargo
   * do plano de execução. `sort_order` é único por pilar e carrega a ordem
   * pretendida; se ele for cadastrado incoerente com os limites, a validação de
   * cobertura acusa.
   */
  private findBonusBands(): Promise<BonusBandRow[]> {
    return this.prisma.partner_bonus_bands.findMany({
      orderBy: [{ pillar: 'asc' }, { sort_order: 'asc' }],
      select: {
        pillar: true,
        min_value: true,
        min_inclusive: true,
        max_value: true,
        max_inclusive: true,
        bonus_percent: true,
      },
    });
  }

  /**
   * Originação do mês corrente e taxa média praticada nela.
   *
   * Só o que o parceiro originou (`consultant_id`) — a meta é individual, sem
   * subárvore. Status `disbursed`/`closed` são os desembolsos válidos: `closed`
   * entra porque um contrato quitado dentro do próprio mês continua sendo
   * originação daquele mês.
   *
   * `avg_rate` é média simples de `loan_terms.interest_rate`, em fração; volta
   * null quando não houve originação no mês.
   */
  private async findMonthOrigination(userId: string): Promise<OriginationRow> {
    const [row] = await this.prisma.$queryRaw<OriginationRow[]>`
      SELECT
        to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM') AS month,
        date_trunc('month', CURRENT_DATE)::date               AS period_start,
        CURRENT_DATE                                          AS period_end,
        COUNT(*)                                              AS origination_count,
        COALESCE(SUM(c.total_amount), 0)                      AS origination_amount,
        AVG(lt.interest_rate)                                 AS avg_rate
      FROM contracts c
      JOIN loan_terms lt ON lt.id = c.loan_terms_id
      WHERE c.status IN ('disbursed', 'closed')
        AND c.consultant_id = ${userId}::uuid
        AND c.disbursement_date >= date_trunc('month', CURRENT_DATE)
        AND c.disbursement_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    `;
    return row;
  }

  /**
   * Inadimplência da carteira: saldo já vencido e saldo total em aberto.
   *
   * Inadimplência simples por valor, "de hoje pra trás" — parcela em aberto com
   * `due_date < CURRENT_DATE`. NÃO usa a regra de arrasto que o dashboard aplica
   * (atraso > 30d puxando o saldo inteiro do contrato): são modelos diferentes
   * de propósito, e aqui as faixas de bônus são apertadas demais para o arrasto.
   *
   * Carteira inclui o que ele cobra, não só o que originou — por isso o OR com
   * `current_collection_agent_id`.
   *
   * Saldo = `total_amount - total_paid` (espelha o dashboard; não usa
   * `pending_amount`, que pondera desconto e pagamento em curso).
   */
  private async findPortfolioDelinquency(
    userId: string,
  ): Promise<DelinquencyRow> {
    const [row] = await this.prisma.$queryRaw<DelinquencyRow[]>`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN i.status IN ('not_paid', 'partially_paid')
             AND i.due_date < CURRENT_DATE
            THEN i.total_amount - i.total_paid
            ELSE 0
          END
        ), 0) AS overdue_amount,
        COALESCE(SUM(
          CASE
            WHEN i.status IN ('not_paid', 'partially_paid')
            THEN i.total_amount - i.total_paid
            ELSE 0
          END
        ), 0) AS open_amount
      FROM contracts c
      JOIN installments i ON i.contract_id = c.id
      WHERE c.status IN ('disbursed', 'active')
        AND (
          c.consultant_id = ${userId}::uuid
          OR c.current_collection_agent_id = ${userId}::uuid
        )
    `;
    return row;
  }

  /**
   * Inscrição vigente do parceiro (linha com `effective_to IS NULL`), com os
   * termos do nível, o início da parceria e a data de referência do banco.
   *
   * Em SQL cru de propósito. O banco tem índice único PARCIAL
   * (`UNIQUE (user_id) WHERE effective_to IS NULL`) e a introspecção do Prisma
   * traduz isso como `@unique` global em `user_id`, modelando
   * `trigo_users.partner_enrollments` como relação 1:1. Não bate com o desenho:
   * o parceiro pode ter N linhas fechadas (histórico de promoção de nível) mais
   * uma aberta. `findUnique` por `user_id` ou navegar pela relação correria o
   * risco de devolver a linha FECHADA em vez da vigente — nível e meta errados,
   * sem erro nenhum. Todo `npm run db:pull` regenera esse `@unique`, então não é
   * um conserto pontual no schema.
   */
  private async findCurrentEnrollment(
    userId: string,
  ): Promise<EnrollmentRow | null> {
    const [row] = await this.prisma.$queryRaw<EnrollmentRow[]>`
      SELECT
        u.full_name,
        l.key                   AS level_key,
        l.name                  AS level_name,
        l.monthly_target_amount AS monthly_target,
        l.monthly_fixed_amount  AS monthly_fixed,
        (
          SELECT MIN(effective_from)
          FROM partner_enrollments
          WHERE user_id = e.user_id
        )                       AS started_at,
        CURRENT_DATE            AS reference_date
      FROM partner_enrollments e
      JOIN partner_levels l ON l.id = e.partner_level_id
      JOIN trigo_users u    ON u.id = e.user_id
      WHERE e.user_id = ${userId}::uuid
        AND e.effective_to IS NULL
        AND u.is_deleted = false
        AND u.is_active = true
    `;
    return row ?? null;
  }

  /**
   * Marcos da trilha de permanência (6/12/18), em ordem crescente.
   *
   * Sem cache de propósito: são 3 linhas, e o motivo de estarem no banco em vez
   * de constante é o backoffice poder mudar sem deploy — cachear em memória
   * traria de volta a necessidade de restart.
   */
  private async findPermanenceMilestones(): Promise<PermanenceMilestone[]> {
    const rows = await this.prisma.partner_permanence_milestones.findMany({
      orderBy: { month_number: 'asc' },
      select: { month_number: true, fixed_multiplier: true },
    });
    return rows.map((row) => ({
      month: row.month_number,
      multiplier: toNum(row.fixed_multiplier),
    }));
  }
}
