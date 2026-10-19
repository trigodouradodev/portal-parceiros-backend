# Restrições de parceiro (AUREA-590 no Portal)

O módulo de Gestão de Parceiros do Backoffice permite bloquear o **acesso** ou a **originação** de um parceiro sem desligá-lo. O Portal aplica a mesma regra do Backoffice (AUREA-632, que corrige AUREA-623 e AUREA-624). O dono do schema é o Backoffice: o Portal **só lê** `partners` e `partner_restrictions` e não cria migration.

## Regra

- **Parceiro:** quem tem linha em `partners` (`partners.user_id` = `trigo_users.id`). Quem não é parceiro nunca é afetado.
- **Restrição ativa:** linha em `partner_restrictions` com `lifted_at` nulo. Escopos `acesso` e `originacao`. Sem prazo: vale até levantar no Backoffice, e o efeito é imediato.
- **Acesso:** parceiro **suspenso, desligado ou com restrição de acesso** não faz login nem renova a sessão. Igual a `PartnerService.isLoginBlocked` do Backoffice.
- **Originação:** restrição de `originacao` barra **iniciar** (`POST /quotes/draft`) e **enviar** (`PUT /quotes/draft/:quoteId/submit`) proposta. Simular e editar rascunhos existentes continuam liberados. `ROLE_ADMIN` não é barrado.

## Onde é aplicada

| Ponto | Comportamento |
|---|---|
| `AuthService.login` | Depois da senha e do acesso ao Portal (`QUOTE_ACTIVITY_GATES` ou `ROLE_ADMIN`). 403 `PARTNER_ACCESS_RESTRICTED` |
| `AuthService.refreshTokens` | Mesma checagem. **Mais rígido que o Backoffice**, que só barra login novo |
| `QuotesService.createDraftFromSimulation` | 403 `PARTNER_ORIGINATION_RESTRICTED`, antes da checagem de pendências de cobrança |
| `QuotesService.submitDraftForClientReview` | 403 `PARTNER_ORIGINATION_RESTRICTED`, antes de qualquer escrita e da validação de passos |
| Perfil (`toProfile`) | `originationRestricted` e `canCreateQuote` falso quando há restrição de originação |

O corpo do erro é `{ statusCode: 403, code, message }`; o `code` separa estes 403 do 403 de "sem permissão ao Portal".

## Falhas e implantação

- Se a consulta falhar, o Portal **recusa com 503 e registra** (`partner_restriction_check_failed`), em vez de liberar.
- Tabela inexistente (`missingTable: true` no log) é erro de **ordem de deploy**: o Portal só pode subir depois das migrations do módulo de parceiros do Backoffice no ambiente. Hoje elas existem só em `dev`.
- Cada bloqueio gera um log `partner_restriction_blocked` com `scope`, `userId` e `route`.
- Uma sessão já emitida só cai quando o token de acesso expira (15 min).

Código em `src/partners/`.
