# Janela diária dos bloqueios de originação

Depois da data `QUOTE_ACTIVITY_GATES_ACTIVATION_AT`, os booleanos
`canSimulateQuote` e `canCreateQuote` só avaliam pendências na janela de
`system_configs.QUOTE_ACTIVITY_GATES_BLOCKING_WINDOW`:

```json
{"start":"13:00","end":"00:00"}
```

A janela usa `America/Sao_Paulo`, início inclusivo e fim exclusivo. No padrão,
00h até antes das 13h retorna ambos como `true`; de 13h até antes da meia-noite,
as regras atuais definem os valores. Antes da data de vigência, ambos continuam
liberados durante todo o dia. Fora da janela não há consulta de tarefas.

Aceita horários `HH:mm`, minutos e intervalos que atravessam a meia-noite.
Horários iguais avaliam durante as 24 horas. Configuração ausente, incompleta
ou inválida usa o padrão inteiro de 13:00 a 00:00; falha de leitura do banco
é propagada. O serviço relê a configuração a cada avaliação.

A migration que cadastra essa chave pertence ao `trigo-connector`:
`20261109120000_insert_quote_activity_gates_blocking_window.ts`. Ela preserva
valores existentes e não modifica a data de vigência. A chave pode ser editada
pela tela de configurações do backoffice, sem novo deploy.

A seleção de tarefas elegíveis, as faixas e as permissões continuam as existentes.
O login e a execução de atividades não dependem dessa janela. Os frontends
continuam consumindo os mesmos campos; a avaliação no backend protege os comandos
mesmo com uma interface ainda exibindo o perfil anterior.

Os cenários de horário ficam em
`src/activities/quote-activity-permissions.service.spec.ts`, incluindo limites
de 00h/13h, minutos, travessia de meia-noite, configuração inválida, mudança sem
reinício, vigência futura e os critérios separados para simular e criar proposta.
O procedimento completo está em `trigo-connector/docs/quote-activity-gates-window.md`.
