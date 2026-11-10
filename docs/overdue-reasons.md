# Motivo do atraso — AUREA-719

## Payloads

Interação (`POST /activities/tasks/:taskId/interactions`):

```json
{
  "channel": "call",
  "recipientType": "client",
  "result": "no_response",
  "overdueReason": "job_loss"
}
```

Follow-up manual (`POST /follow-up`):

```json
{
  "contractId": "22222222-2222-4222-8222-222222222222",
  "followUpType": "call",
  "party": "client",
  "expectedResult": "no_return",
  "overdueReason": "job_loss"
}
```

O motivo é obrigatório em todos os resultados, exceto Falecido e Outro. Ações
sem resultado não exigem motivo. O legado usa `expectedResult ?? status`,
considerando somente status que representam resultados. Datas e observações
mantêm suas regras existentes e coexistem com o motivo.

## Validação e persistência

O catálogo `src/common/overdue-reason.enum.ts` contém 24 motivos, incluindo Outro.
Falecimento foi retirado das novas seleções. Categorias são somente classificação;
não mudam a régua, não abrem ações e não marcam óbito ou fraude. Os efeitos do
resultado principal permanecem.

| Código de erro               | Situação                                           |
| ---------------------------- | -------------------------------------------------- |
| `overdue_reason_required`    | Resultado aplicável sem motivo                     |
| `overdue_reason_invalid`     | Motivo desconhecido ou inválido, incluindo `death` |
| `overdue_reason_not_allowed` | Motivo informado em resultado não aplicável        |

Erros de formato podem ser retornados pelo ValidationPipe antes do serviço.
O motivo da interação e do Follow-up automático é gravado na mesma transação;
falhas rejeitam a execução inteira. Os serviços também validam chamadas internas.

## Consultas e histórico

As respostas camelCase de interação, histórico de tarefas, fila e carteira
retornam `overdueReason`. A criação de Follow-up mantém o retorno Prisma em
snake_case (`overdue_reason`). Nulos históricos continuam válidos; classificações
antigas `death` são preservadas e exibidas como Falecimento pelos frontends.

## Publicação

Gerar o Prisma Client com o schema atualizado. Aplicar a migration única do
trigo-connector `20261110120000_add_overdue_reason.ts` pela esteira normal antes
dos backends. Ela cria diretamente `overdue_reason` nas duas tabelas, anulável
para o histórico e sem CHECKs de negócio. Os dois backends validam os 24 motivos,
a obrigatoriedade e a relação com o resultado. `death` não é aceito pelas APIs em
novas escritas. SQL direto não passa pelas validações da aplicação.

Coordenar a publicação dos dois backends e frontends: os formulários anteriores
não enviam o motivo obrigatório. Não há backfill nem script de transição.
O rollback remove as colunas e seus motivos; reverter os produtores/leitores
antes de executá-lo. A consolidação em uma migration foi feita após confirmação
de que nenhuma versão anterior havia sido executada nos ambientes.

## Verificação em 10/11/2026

Build e suíte completa aprovados (1.175 testes). A cobertura inclui todos os
resultados de tarefa aplicáveis em contato/visita, os 24 motivos, validações de
entrada, datas de promessa/negociação e a cópia para Follow-up na transação.
O SQL de criação/remoção das colunas foi compilado sem executar DDL; nenhuma
migration foi aplicada nesta revisão. Detalhes em `trigo-connector/docs/overdue-reasons.md`.
