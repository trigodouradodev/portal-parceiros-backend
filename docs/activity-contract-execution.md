# Execução de cobrança por contrato — etapa 3

Base: `origin/homolog`, branch `feat/activity-contract-execution`.

Esta etapa altera os comandos do backend do portal: registrar resultado, adiar e
reagendar. Fila, contagens, abertura automática de ações e novos campos do frontend
foram implementados depois, na [etapa 5](contract-pending-action-flows.md). A
integração do job foi implementada na etapa 4 do `aurea-schedules-platform`.

## Transação e revalidação

Os três comandos passam pelo mesmo preâmbulo:

1. Travam o contrato da tarefa, as parcelas em ordem de ID e a tarefa.
2. Conferem pendência e atribuição da tarefa ao usuário.
3. Releem os fatos financeiros e impedimentos após obter os locks.
4. Preservam a trava por segmento da fila e a antecipação das tarefas agendadas.
5. Fazem a operação na mesma transação.

A contagem e a referência vêm da função compartilhada
`activity_collection_overdue_installments(contract_id, reference_date)` preparada
no `trigo-connector`. O histórico usado na decisão é somente o da referência atual.
A contagem inclui dívidas anteriores à janela de geração de 30 dias.

Uma ação efetivamente aberta impede os comandos; `due_at` não libera cobrança.
A renegociação deixa de ser efetivamente aberta no dia seguinte à data prevista,
conforme a regra já adotada pela view do backoffice. O SELECT calcula essa condição
com a data civil da execução para manter consistência inclusive após espera por
lock na virada do dia. Encerrar uma ação libera a reavaliação das demais regras.

Também são revalidados status e empresa do contrato, responsável atual e permissão
de rollout, óbito e avalista,
quantidade de parcelas atrasadas, troca da referência, parada de cobrança, limite
de 30 dias, acompanhamento único, carência, promessa, espera após visita e execução
prévia no dia. Uma pendente do dia anterior continua exigível até a manutenção pelo
job, preservando a cobrança e a trava mesmo se o job matinal atrasar.

O bloqueio por cessão ficou fora desta entrega até haver informação local
confiável. `NOT_CEDED` não é lido nem usado para impedir comandos ou consultas.

Para um tomador com óbito confirmado e avalista vivo, os comandos de agendamento
continuam possíveis, mas registrar o resultado exige o avalista como destinatário.
Avalista ausente ou falecido não é aceito como destinatário.

Os comandos inválidos retornam HTTP 409 com `message: task_not_collectible` e
`reason`; esperas de promessa e visita também retornam `resumeOn`. A operação não
transforma esse conflito em resultado executado nem cancela a tarefa. A manutenção
das tarefas pelo job e sua exclusão da fila serão conectadas nas próximas etapas.
Os erros de tarefa inexistente, não pendente ou de outro usuário continuam usando
os contratos anteriores.

## Snapshot da execução

O instante é obtido com `clock_timestamp()` depois dos locks. A data civil de São
Paulo desse instante comanda toda a operação, inclusive janelas de promessa,
adiamento, reagendamento e escolha da referência. `completed_at` e a interação
recebem esse mesmo instante explicitamente.

A interação grava `overdue_installment_count_at_execution`,
`reference_due_date_at_execution` e `days_overdue_at_execution`, preservando as
informações que serão usadas pelo novo job.

O modo salvo na criação da tarefa não determina o snapshot. Se uma tarefa criada
com duas atrasadas for executada após o pagamento da outra, registra uma atrasada.
Se tiver sido criada com uma e a situação passar para duas mantendo a mesma
referência, registra duas. Todos os resultados válidos preservam esse contexto.
Um registro anterior com duas atrasadas só dispensa o acompanhamento enquanto a
situação atual tiver duas e a referência continuar a mesma.

Conclusão da tarefa, interação, geolocalização e follow-up seguem atômicos. Somente
transações abortadas por deadlock/conflito de escrita podem ser repetidas, com até
três tentativas e nova leitura de fatos. Erros de negócio, falhas de conexão e erros
de persistência sem aborto reconhecido não são repetidos automaticamente. Isso
também cobre concorrência com escritores legados do connector que ainda podem
obter locks em outra ordem. O ensaio real dessa concorrência será feito no banco
local ao final; os testes com mocks não comprovam comportamento dos locks.

## Schema e aplicação

O schema Prisma espelha os campos da etapa 2 e a unicidade parcial por contrato.
A relação `installments.activity_tasks` passa a ser uma lista, preservando a
possibilidade de múltiplas tarefas históricas. O Prisma Client foi gerado localmente
sem conectar ao banco.

Antes de executar esta versão do portal, aplicar as migrations de ações pendentes
da fase do backoffice e as expansões da etapa 2 no `trigo-connector`. A ativação do
índice único por contrato deve ser coordenada com a transição e o novo job, conforme
`aurea-schedules-platform/docs/activity-engine-contract-data.md`. O schema Prisma
descreve o destino da transição; a restrição é criada pela migration do connector.

Nenhuma migration foi aplicada nesta etapa. Os testes reais das consultas,
constraints, rollback e concorrência permanecem previstos para o PostgreSQL local
ao final.

## Verificações

Os testes de activities e follow-up cobrem os fluxos anteriores e cenários de
impedimentos nos três comandos, snapshot de uma/duas atrasadas, todos os resultados,
destinatário com óbito, carência, espera de visita, promessa, agendamentos e conflitos
de transação. O banco é substituído nos testes; SQL, índices e locks serão validados
no ensaio integrado.
