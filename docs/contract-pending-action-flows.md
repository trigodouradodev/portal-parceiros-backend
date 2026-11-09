# Fluxos de cobrança e ações pendentes — etapa 5

Esta etapa completa o backend do portal sobre a branch
`feat/activity-contract-execution`. As alterações do frontend ficam em
`portal-parceiros-frontend`, branch `feat/contract-pending-action-flows`, baseada em
`origin/homolog`.

## Resultado e ação pendente

Registrar `renegotiation`, `deceased` ou `dispute` abre a respectiva ação pendente
no contrato, com origem `portal` e vínculo com a interação. Conclusão da tarefa,
interação, follow-up, geolocalização, ação e evento de histórico pertencem à mesma
transação. Uma falha propaga o erro e impede o commit da operação inteira.

O parceiro continua autorizado pela execução da tarefa; não recebe a permissão de
gestão de ações do backoffice. O portal não altera a marcação de óbito diretamente.

Renegociação exige `expectedAgreementDate` em `YYYY-MM-DD`, entre amanhã e D+10,
usando a data civil da execução em São Paulo. Essa é a previsão para fechar a
negociação. Encerrar a ação no backoffice permanece sem novo campo de vencimento
e libera a reavaliação pelas demais regras da régua.

O prazo de tratamento vem de `CONTRACT_PENDING_ACTION_DUE_DAYS`. Uma ação existente
é atualizada sem renovar `due_at`; uma negociação antiga efetivamente vencida é
expirada com evento antes da abertura da nova. Cada evento preserva snapshots,
ator, instante e interação de origem. Somente pendentes remanescentes são canceladas
por `contract_pending_action`; a tarefa executada permanece concluída.

O resultado “Falecido” se refere ao destinatário escolhido no contato: tomador ou
avalista. Essa definição foi confirmada para os dois casos.

Observação informada pelo parceiro é preservada integralmente na interação. A
descrição da ação respeita o limite de 2000 caracteres do backoffice. Quando não
houver observação, a ação usa uma descrição do resultado. No óbito informado para o avalista, a descrição
identifica esse destinatário, que também permanece registrado na interação.
O `trigo-connector` usa esse vínculo para concluir a indicação somente quando o
óbito da pessoa correspondente é registrado. Ações manuais sem interação continuam
se referindo ao tomador. As permissões existentes de óbito permanecem as mesmas.

## Leitura e execução

`collection-eligibility.sql.ts` concentra o predicado utilizado na fila, ranking,
contagens, tarefas agendadas, seleção do segmento executável, detalhe e trava de
originação. A carteira financeira mantém seu escopo, mas não associa uma pendente
inelegível como tarefa executável.

Esse predicado considera ação efetivamente aberta, responsável
atual/permissão, óbito/avalista vivo, referência da função compartilhada de dívida,
uma ou duas atrasadas, bloqueio da parcela, janela de 30 dias, carência, promessa,
intervalo de visita, execução no dia e acompanhamento de duas atrasadas já cumprido.
O calendário SQL de carência utiliza a mesma lista de feriados do guard TypeScript.
Os guards continuam revalidando os comandos com locks e fatos atuais.

O bloqueio por cessão foi retirado até existir informação local confiável.
`NOT_CEDED` não participa da elegibilidade; a exigência de `disbursed` permanece.

Pendentes do dia anterior continuam exigíveis até o job fechá-las e renovar o ciclo,
preservando a fila e a trava se o job matinal atrasar. Agendadas elegíveis continuam
visíveis e podem ser antecipadas; as faixas que bloqueiam simulação/criação e a
configuração de ativação da trava permanecem as existentes. O histórico de
concluídas hoje continua visível mesmo após abrir a ação pendente.

O detalhe informa `client.isDeceased`, `guarantor.isDeceased` e
`tasks[].isCollectible`. O avalista vem do vínculo do contrato com `parties`; dados
de contato da proposta só são usados como fallback quando o CPF corresponde à
mesma pessoa. O frontend desabilita destinatários falecidos e inicia a cobrança
com o avalista vivo quando o tomador está falecido.

O registro retorna `message` e, quando aplicável, `pendingAction: { id, type }`.
As mensagens usam o contexto real da execução: com duas atrasadas, não prometem
nova tarefa após visita; com ação pendente, informam encaminhamento ao backoffice.
Conflitos que indicam tarefa desatualizada atualizam fila, detalhe e permissões,
com mensagem traduzida e retorno ao dashboard.

## Validação e aplicação

Os testes desta etapa substituem banco e rede. Na etapa 6, a suíte em
`aurea-schedules-platform/apps/jobs/activity-engine/validation/activity-collection.local.ts`
também percorreu os serviços reais deste portal no PostgreSQL local, incluindo
execução, consultas de fila/detalhe/carteira/trava, concorrência e rollback.
Nenhuma operação contra banco da infraestrutura foi executada.

Foi confirmado que as regras novas começam no deploy. Interações antigas sem
snapshot não acionam retroativamente execução única ou intervalo de 15 dias;
promessas e agendamentos existentes da referência atual continuam respeitados.

Esta versão depende das migrations da fase do backoffice e da expansão da etapa 2,
além do novo job e da transição manual coordenada descrita no repo
`aurea-schedules-platform`. O schema Prisma espelha a coluna de óbito já existente
em `parties`; esta etapa não cria outra coluna de marcação ou permissão de óbito.
