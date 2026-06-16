import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ViewerScope {
  /**
   * trigo_users.id do viewer + todos os subordinados recursivos
   * (incluindo o próprio viewer). Já filtra is_deleted=false.
   */
  userIds: string[];
  /**
   * @deprecated Pós-consolidação (Opção B, ver docs/CONSOLIDACAO-TRIGO-USERS.md)
   * o ownership de negócio guarda `trigo_users.id` diretamente. Estes dois
   * campos são ALIASES de `userIds` mantidos por compatibilidade com os
   * consumidores que ainda filtram `contracts.consultant_id IN consultantIds`
   * etc. — agora corretos porque a coluna também é `trigo_users.id`. Serão
   * removidos quando todos os consumidores migrarem para `userIds`.
   */
  consultantIds: string[];
  /** @deprecated alias de `userIds` — ver `consultantIds`. */
  collectionAgentIds: string[];
}

export interface ScopeViewer {
  userId: string;
  permissions: string[];
}

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a árvore de visibilidade de um viewer para listagens com escopo
   * por hierarquia (V2 RBAC):
   *   - Consultor parceiro: próprios + de consultores/agentes subordinados
   *   - Gerente: toda a equipe (consultores + agentes subordinados, recursivo)
   *   - Diretor: toda a hierarquia abaixo dele
   *   - Consultor sem subordinados / Agente: apenas os próprios
   *
   * O utility NÃO checa permissões de "ver tudo" (ROLE_ADMIN, *_VIEW_ALL).
   * O caller é quem decide: se o viewer tem visão global, pula o utility
   * e não aplica nenhum filtro de scope. Se não tem, usa os ids retornados
   * pra filtrar `consultant_id IN consultantIds` e/ou
   * `collection_agent_id IN collectionAgentIds`.
   *
   * Walk-down via CTE recursiva em trigo_users.manager_id. Guard contra
   * self-ref (alguém apontando manager_id pra si mesmo — caso encontrado em
   * dados legados de PROD). is_deleted filtrado em cada nível.
   */
  async getViewerScopeIds(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ViewerScope> {
    // Pós-consolidação: o ownership de negócio guarda trigo_users.id, então o
    // scope é simplesmente a árvore de trigo_users (userIds). consultantIds /
    // collectionAgentIds viram aliases de userIds (ver ViewerScope).
    const userIds = await this.expandUserSubtree([userId], tx);
    return {
      userIds,
      consultantIds: userIds,
      collectionAgentIds: userIds,
    };
  }

  /**
   * Expande um conjunto de trigo_users.id para incluir todos os subordinados
   * recursivos via trigo_users.manager_id. Inclui os próprios userIds de
   * entrada. Usa CTE recursiva com guard contra self-ref.
   *
   * Helper genérico usado pelos resolvers de filtro em cascata
   * (managerId, consultantId, collectionAgentId).
   */
  async expandUserSubtree(
    userIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE subordinates AS (
        SELECT id
        FROM trigo_users
        WHERE id = ANY(${userIds}::uuid[]) AND is_deleted = false

        UNION

        SELECT tu.id
        FROM trigo_users tu
        JOIN subordinates s ON tu.manager_id = s.id
        WHERE tu.is_deleted = false
          AND tu.id <> s.id
      )
      SELECT id FROM subordinates
    `;
    return rows.map((row) => row.id);
  }

  /**
   * Filtro managerId em cascata: dada uma lista de trigo_users.id de
   * gerentes, retorna os consultants.id e collection_agents.id de TODA a
   * árvore abaixo desses gerentes (subordinados recursivos via
   * trigo_users.manager_id). Inclui o próprio user se ele for consultor/agente.
   *
   * Retorna `null` se a entrada for vazia (sinaliza "sem filtro de gestor").
   * Retorna listas vazias se a árvore não tiver nenhum consultor/agente ativo
   * (caller deve tratar como "zero resultados").
   */
  async resolveManagerFilter(
    managerUserIds: string[],
  ): Promise<{ consultantIds: string[]; collectionAgentIds: string[] } | null> {
    if (managerUserIds.length === 0) return null;
    // Pós-consolidação: managerId já é trigo_users.id. A árvore inteira sob os
    // gestores é a própria expansão recursiva; ownership (consultant_id /
    // current_collection_agent_id) guarda trigo_users.id, então os dois lados
    // do filtro usam o MESMO conjunto. consultantIds/collectionAgentIds aqui
    // são aliases da subárvore (ver ViewerScope).
    const subtree = await this.expandUserSubtree(managerUserIds);
    return { consultantIds: subtree, collectionAgentIds: subtree };
  }

  /**
   * Filtro consultantId em cascata: dada uma lista de consultants.id, expande
   * para incluir todos os subordinados (Especialistas de um Parceiro, etc.).
   *
   * Walk: consultants.id → consultants.user_id → CTE recursiva em
   * trigo_users.manager_id → consultants.id da árvore.
   *
   * Os IDs originais são preservados na resposta para tolerar casos onde o
   * consultant não tem user_id vinculado (dados legados).
   */
  async resolveConsultantFilter(
    consultantUserIds: string[],
  ): Promise<string[]> {
    // Pós-consolidação: o input já é trigo_users.id (o FE manda o id do
    // dropdown, que agora é trigo_users.id). Expandir a subárvore basta.
    return this.expandUserSubtree(consultantUserIds);
  }

  /**
   * Filtro collectionAgentId em cascata. Pós-consolidação é idêntico ao de
   * consultor (ambos são trigo_users.id) — mantido por clareza de chamada.
   */
  async resolveCollectionAgentFilter(
    agentUserIds: string[],
  ): Promise<string[]> {
    return this.expandUserSubtree(agentUserIds);
  }

  /**
   * Verifica se o viewer tem acesso a um contrato específico.
   *
   * Regra:
   *   - Sem viewer → true (fail-open pra callers internos sistêmicos)
   *   - ROLE_ADMIN ou CONTRACT_VIEW_ALL → true (vê tudo)
   *   - Caso contrário, verifica se o contrato está na árvore do viewer:
   *     contracts.consultant_id ∈ scope.consultantIds OU
   *     contracts.current_collection_agent_id ∈ scope.collectionAgentIds
   *
   * Usado para gating de operações em path `/api/.../:contractId/*` (renego,
   * manual payment, etc) onde o middleware checa só a permissão da ação mas
   * não valida ownership do contrato.
   *
   * Retorna `false` também se o contrato simplesmente não existe — o caller
   * é responsável por distinguir 404 vs 403 (recomendado: tratar igual pra
   * não revelar existência).
   */
  async canViewContract(
    contractId: string,
    viewer?: ScopeViewer,
  ): Promise<boolean> {
    if (!viewer) return true;
    const canViewAll =
      viewer.permissions.includes('ROLE_ADMIN') ||
      viewer.permissions.includes('CONTRACT_VIEW_ALL');
    if (canViewAll) {
      // Ainda precisa verificar existência? Não — se ID inválido a query
      // posterior do caller falha naturalmente. Aqui só validamos permissão.
      return true;
    }
    const scope = await this.getViewerScopeIds(viewer.userId);
    if (
      scope.consultantIds.length === 0 &&
      scope.collectionAgentIds.length === 0
    ) {
      return false;
    }
    const or: Prisma.contractsWhereInput[] = [];
    if (scope.consultantIds.length > 0) {
      or.push({ consultant_id: { in: scope.consultantIds } });
    }
    if (scope.collectionAgentIds.length > 0) {
      or.push({
        current_collection_agent_id: { in: scope.collectionAgentIds },
      });
    }
    const row = await this.prisma.contracts.findFirst({
      where: { id: contractId, OR: or },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Verifica se o viewer pode agir em um row específico de form_approvals.
   *
   * Acesso: ROLE_ADMIN, QUOTE_VIEW_ALL, QUOTE_APPROVER ou se o approver
   * designado está na árvore de hierarquia do viewer.
   *
   * Usado para gating de POST /api/approvals/form-approvals/:approvalId/approve|reject.
   */
  async canAccessFormApproval(
    approvalId: string,
    viewer?: ScopeViewer,
  ): Promise<boolean> {
    if (!viewer) return true;
    const canViewAll =
      viewer.permissions.includes('ROLE_ADMIN') ||
      viewer.permissions.includes('QUOTE_VIEW_ALL') ||
      viewer.permissions.includes('QUOTE_APPROVER');
    if (canViewAll) return true;
    const scope = await this.getViewerScopeIds(viewer.userId);
    if (scope.consultantIds.length === 0) return false;
    const row = await this.prisma.form_approvals.findFirst({
      where: { id: approvalId, approver: { in: scope.consultantIds } },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Idem ao canAccessFormApproval, mas pra quote_approvals.
   *
   * Usado para gating de POST /api/approvals/quote-approvals/:approvalId/approve|reject.
   */
  async canAccessQuoteApproval(
    approvalId: string,
    viewer?: ScopeViewer,
  ): Promise<boolean> {
    if (!viewer) return true;
    const canViewAll =
      viewer.permissions.includes('ROLE_ADMIN') ||
      viewer.permissions.includes('QUOTE_VIEW_ALL') ||
      viewer.permissions.includes('QUOTE_APPROVER');
    if (canViewAll) return true;
    const scope = await this.getViewerScopeIds(viewer.userId);
    if (scope.consultantIds.length === 0) return false;
    const row = await this.prisma.quote_approvals.findFirst({
      where: { id: approvalId, approver: { in: scope.consultantIds } },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Verifica se o viewer pode ver/processar as aprovações de um form_response.
   *
   * Critério: EXISTS form_approval com approver na árvore do viewer.
   * Forms sem nenhum form_approval registrado retornam false — caso atípico
   * (todo form em fluxo deveria gerar pelo menos um form_approval).
   *
   * Usado para POST /api/approvals/:responseId/process e GET /:responseId/list.
   */
  async canAccessFormResponseApprovals(
    responseId: string,
    viewer?: ScopeViewer,
  ): Promise<boolean> {
    if (!viewer) return true;
    const canViewAll =
      viewer.permissions.includes('ROLE_ADMIN') ||
      viewer.permissions.includes('QUOTE_VIEW_ALL');
    if (canViewAll) return true;
    const scope = await this.getViewerScopeIds(viewer.userId);
    if (scope.consultantIds.length === 0) return false;
    const row = await this.prisma.form_approvals.findFirst({
      where: {
        form_response_id: responseId,
        approver: { in: scope.consultantIds },
      },
      select: { id: true },
    });
    return !!row;
  }

  /**
   * Verifica se o viewer tem acesso a uma quote específica.
   *
   * Critério: viewer pode ver tudo (ROLE_ADMIN / QUOTE_VIEW_ALL) ou
   * `quote.current_sales_agent_id` ∈ scope.consultantIds.
   *
   * Usado para POST /api/approvals/:responseId/processQuote (onde
   * :responseId é tratado como quote_id pelo backend).
   */
  async canAccessQuote(
    quoteId: string,
    viewer?: ScopeViewer,
  ): Promise<boolean> {
    if (!viewer) return true;
    const canViewAll =
      viewer.permissions.includes('ROLE_ADMIN') ||
      viewer.permissions.includes('QUOTE_VIEW_ALL');
    if (canViewAll) return true;
    const scope = await this.getViewerScopeIds(viewer.userId);
    if (scope.consultantIds.length === 0) return false;
    const row = await this.prisma.quotes.findFirst({
      where: {
        id: quoteId,
        current_sales_agent_id: { in: scope.consultantIds },
      },
      select: { id: true },
    });
    return !!row;
  }
}
