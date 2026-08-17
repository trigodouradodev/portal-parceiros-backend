# Contexto do Projeto

Este arquivo registra decisões duráveis para orientar futuras sessões e mudanças
neste repositório.

## Arquitetura e banco de dados

- Esta API compartilha o banco PostgreSQL `trigo_dourado` com o backoffice.
- O backoffice é o único dono do schema e executa migrations via Knex.
- Neste projeto, Prisma é somente client e ferramenta de introspecção. **Nunca
  execute `prisma migrate`**.
- Para atualizar o schema local, use `npm run db:pull` (`prisma db pull` +
  `prisma generate`) depois que a mudança de schema existir no backoffice.
- O Prisma lê os schemas `public` e `analytics`; o generator habilita a preview
  `views`. O `db pull` precisa preservar os `@@schema` em todos os models/enums.
- As views próprias do portal ficam no schema `analytics`. O instalador mínimo
  e idempotente está em `db/analytics/install-analytics-portal.sql`; ele cria
  `vw_dim_empresa`, `vw_dim_consultor`, `vw_fato_originacao`,
  `vw_fato_parcela` e `vw_fato_recebimento`.
- Caso o portal precise de tabelas próprias, a decisão deve ser criar via Knex
  no backoffice ou usar um schema PostgreSQL separado; não criar migrations
  Prisma contra o banco compartilhado.

## Autenticação

- A autenticação do portal é independente da do backoffice: usa secrets JWT
  próprios e tokens com payload próprio (`sub`, `email`, `role`, `permissions`).
- O refresh token é stateless: o cliente o envia no body e a API apenas valida
  assinatura/expiração e reemite o par de tokens.
- **Nunca ler ou gravar `trigo_users.refresh_token`**. Essa coluna pertence ao
  fluxo do backoffice; compartilhá-la causaria invalidação cruzada de sessões.
- O login normaliza email com `trim().toLowerCase()`.

## Permissões e escopo

- A autenticação e o guard de permissões são globais. `ROLE_ADMIN` tem bypass
  de permissões e visão global.
- Para recursos de carteira/contrato, aplicar `ScopeService` quando o usuário
  não tiver permissão de visão global.
- A hierarquia é recursiva por `trigo_users.manager_id`; o usuário enxerga seus
  próprios registros e os de subordinados.
- Ownership de contratos é armazenado diretamente com `trigo_users.id` em
  `contracts.consultant_id` e `contracts.current_collection_agent_id`.

## Programa de Parceiros e comissão

- O módulo `performance` é a fonte de verdade para a comissão do Programa de
  Parceiros Exclusivos.
- `commission_rate` e as configurações `COMMISSION_*` são legado morto; não
  usar, conciliar nem criar lógica nova sobre elas.
- `partner_enrollments` possui no banco um índice único **parcial** para a
  inscrição atual (`effective_to IS NULL`). A introspecção Prisma o representa
  de modo enganoso como `@unique` global.
- Para buscar a inscrição vigente, usar sempre:
  `prisma.partner_enrollments.findFirst({ where: { user_id, effective_to: null }, include: { partner_levels: true } })`.
  Nunca usar `findUnique({ where: { user_id } })` nem a relação a partir de
  `trigo_users`.
- Metas do programa são individuais do usuário logado; não expandir subárvore
  via `ScopeService`.
- Originação e taxa média consideram apenas `consultant_id = user_id`.
- Carteira e risco incluem contratos em que o usuário é consultor **ou** agente
  de cobrança.
- Inadimplência do programa é simples e por valor: saldo de parcelas abertas
  com vencimento anterior a hoje dividido pelo saldo de todas as parcelas
  abertas. Isso é propositalmente diferente da regra de arrasto do dashboard.
- Para carteira vazia, a decisão provisória é taxa `null` e bônus de risco `0`.

## Location check

- `addresses` não armazena latitude/longitude; a referência é geocodada em
  tempo real pela Google Maps Geocoding API.
- Sem `GOOGLE_MAPS_API_KEY`, o endpoint responde 503. Não tentar adicionar
  coordenadas ao schema a partir deste repositório.
- O resultado fora do raio é válido e responde 200 com `withinRadius` e
  `distanceMeters`.
- O raio atual é configurável por `LOCATION_CHECK_RADIUS_METERS`; o código
  define 100 m como padrão. Uma memória mais antiga menciona 15 m, portanto
  confirmar a regra de negócio antes de alterar esse valor.

## Desenvolvimento e entrega

- Stack: NestJS, TypeScript, Prisma/PostgreSQL, JWT/Passport, Swagger e Jest.
- Padrão de implementação: módulo por domínio, DTO validado, controller fino,
  service com regra de negócio e testes unitários próximos ao módulo.
- O CI de PR executa formatação, lint, build e testes com Node 22 e `npm ci`.
- O README ainda é o template do Nest; a documentação de API está em `/docs`
  fora de produção.
- Pendência conhecida: RN-023 em atividades ainda usa `pending_amount` cru,
  sem juros/correção diária.
