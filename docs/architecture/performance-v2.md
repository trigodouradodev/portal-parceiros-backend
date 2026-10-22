# Desempenho V2: consulta aos snapshots do Analytics

Status: competências e indicadores adaptados para a tabela de snapshots do BI.
A liberação publicada exige `PERFORMANCE_VIEW` explícita, atribuída manualmente
aos grupos pela gestão de permissões.

A validação local com identidades fixas foi encerrada. API, rota e menu exigem
`PERFORMANCE_VIEW`, e as consultas usam a identidade autenticada e seu escopo.

## Fonte única e responsabilidades

Todos os indicadores e valores de remuneração são lidos de
`analytics.tbl_snapshot_remuneracao_parceiro_mes`, pela conexão `PrismaService`
já existente. O BI calcula os valores na view
`analytics.vw_metric_remuneracao_parceiro_mes` e seu processo de carga os persiste
na tabela. O portal consulta a foto persistida e adapta os valores para a API.
Essa leitura evita executar as dependências de cálculo da view em cada chamada.

O repository usa a tabela do parceiro para listar competências, parceiros e
consultar o consolidado. As contribuições individuais vêm de
`analytics.tbl_snapshot_remuneracao_equipe_mes`, com filtros simultâneos por
`id_parceiro`, `id_pessoa_equipe` e `data_competencia`. Seleciona explicitamente as colunas do contrato, preserva os campos
nulos e mantém os filtros por `id_consultor` e `data_competencia` (primeiro dia do
mês). A chave primária informada é `(id_consultor, data_competencia)`, compatível
com esses filtros. Por padrão, o parceiro é `user.sub`; quando informado, o UUID
em `partnerId` é autorizado pelo mesmo escopo da Home. Nunca há agregação da equipe.

A carga do BI atualiza diariamente a competência corrente como `Aberto` e
preserva a foto final das competências `Fechado`. O fechamento depende de existir
snapshot de parcelas do último dia do mês. No levantamento de 22/10/2026, outubro
tinha 94 parceiros, carga às 04h de Brasília e parcelas de 21/10 (D-1). Setembro
tinha 95 parceiros, situação `Fechado` e parcelas de 30/09. A data da gravação de
um mês fechado pode ser posterior à competência; não é a referência das parcelas.

O contrato da API e o frontend são preservados na troca da fonte. O backend
continua sem calcular originação, percentuais, bônus ou remuneração total.

Na consulta própria, nome, avatar e cargo vêm do usuário autenticado (`GET /auth/me`).
Ao selecionar outra pessoa, o nome exibido no bloco de Desempenho vem da mesma
lista da Home; o cargo do usuário autenticado não é atribuído a ela. Cargo e nível
financeiro são conceitos distintos. Fixo, bônus em reais, acordos e total
da remuneração são apresentados com os valores oficiais do snapshot. Simulador,
comparação de ganhos, permanência e data de início da parceria ficam fora da tela
e da resposta desta V2, pois esses dois últimos campos não integram a fonte consumida.

## Liberação por grupo

Menu, rota `/performance` e endpoints `/performance` e `/performance/months`
exigem a permissão `PERFORMANCE_VIEW`. O backend usa `RequireExplicitPermissions`,
sem bypass para administradores. `ROLE_MANAGER` sozinho também não concede acesso;
a capacidade vem da permissão atribuída aos grupos ativos do usuário.

A migration do trigo-connector
`20261020120000_add_performance_view_permission.ts` cria somente a permissão de
ID 40, sem atribuí-la automaticamente a grupos ou usuários. Não depende da
existência do grupo Gerentes. Colisão de ID/chave aborta a transação.
O catálogo e a normalização de JWT do connector preservam o caráter opt-in,
inclusive para administradores. O rollback remove a permissão e seus vínculos
por cascade, preservando grupos e membros.

A migration adicional `20261022120000_create_performance_access_group.ts` cria
um grupo de sistema ativo "Acesso ao Desempenho"
(`10000000-0000-0000-0000-000000000012`) com somente `PERFORMANCE_VIEW` (ID 40).
O grupo nasce sem membros e depende da permissão já criada pela migration anterior.
Seu rollback remove apenas o grupo, seus vínculos e seus membros, preservando a
permissão e os demais grupos.

A liberação para gerentes ou demais parceiros é manual: adicionar os usuários ao
grupo "Acesso ao Desempenho" pela gestão de grupos e permissões. Também continua
possível atribuir a permissão aos demais grupos conforme a configuração desejada.
Não é preciso alterar o código.
Essa permissão controla a entrada no módulo; o escopo de pessoas continua sendo
validado separadamente, conforme a Home.

Aplicar as migrations antes de liberar os serviços com a nova exigência. Após a
atribuição, renovar a sessão para atualizar as permissões do token e do perfil.
A migration está preparada no repositório; sua execução no banco faz parte da
implantação.

## Seleção de parceiro e contribuição individual

Os seletores de pessoas ficam à esquerda e a competência à direita no desktop;
no celular, ficam empilhados. Todos reutilizam `SelectDialogField`.

`GET /performance/partners?month=YYYY-MM` lista somente os parceiros que possuem
consolidado na competência e estão no escopo permitido. A autorização reutiliza
`PeopleScopeService`: subárvore recursiva para gestores e parceiros ativos do
rollout para admin/suporte. A própria pessoa também é candidata. A seleção de
outros titulares exige as permissões de equipe já usadas pela Home. Não é exigida
permissão de Desempenho das pessoas consultadas; a permissão de entrada pertence
a quem acessa a tela.

Um gerente sem consolidado próprio seleciona um parceiro antes de ver números.
O próprio parceiro é selecionado automaticamente quando disponível. Quando só
existe um parceiro disponível, ele é selecionado; se for o usuário autenticado,
o seletor de parceiro fica oculto.

`GET /performance/team?partnerId=UUID&month=YYYY-MM` reúne o titular e os
integrantes encontrados na hierarquia atual e no snapshot de equipe daquela
competência. A união preserva integrantes históricos e permite escolher
subordinados que ainda não possuem detalhamento. Pessoas excluídas não entram na
lista. `flag_ativo=false` no snapshot não elimina uma contribuição histórica.

Havendo integrantes além do titular, aparece o seletor "Visualização":
"Consolidado", o próprio titular e cada integrante. Sem integrantes adicionais,
o seletor fica oculto. Ao trocar de parceiro ou competência, a visualização volta
ao consolidado. As chaves de cache incluem usuário autenticado, parceiro,
integrante e competência para não reutilizar números de outra seleção.

`GET /performance?partnerId=UUID&memberId=UUID&month=YYYY-MM` retorna a
contribuição individual. O backend valida primeiro o titular no escopo do usuário
e depois o vínculo do integrante com esse titular, antes da leitura individual.
Um integrante de outro titular retorna 403. O acesso não depende de o integrante
ter login ou permissão de acesso ao portal.

O BI confirmou que o detalhamento representa a contribuição para o superior, e
não uma remuneração própria. No individual, aparecem originação, contratos,
taxa média informada, carteira ativa, inadimplência em reais e reembolso. Nível,
meta, percentuais de inadimplência, bônus e remuneração não são herdados do
consolidado nem calculados pelo portal; seus blocos são ocultados no frontend.
`taxa_media` é apresentada como a média da pessoa, sem identificá-la como taxa de
bônus ou ponderada. Desconsiderações fornecidas pelo BI permanecem em detalhes.

Se o integrante autorizado não tem linha no snapshot da competência, retorna uma
contribuição com valores zerados e `view.missingDetails=true`. A tela informa que
o detalhamento não está disponível. Uma linha existente com valores nulos mantém
N/A; falhas de consulta continuam sendo 503, sem virar zeros. O consolidado sem
linha continua sendo `NO_DATA`.

## API

### `GET /performance/months?partnerId=UUID`

Retorna competências distintas, em ordem decrescente, e o mês corrente calculado
no banco em `America/Sao_Paulo`. Com `partnerId`, usa aquele titular autorizado;
sem ele, usa o escopo permitido, inclusive para gerentes sem consolidado próprio:

```json
{
  "currentMonth": "2026-10",
  "months": [{ "month": "2026-09" }]
}
```

Sem linhas para o parceiro, `months` é `[]`. Isso não significa ausência de inscrição.
A tela seleciona inicialmente `currentMonth`, mesmo quando não existe na tabela, e
mantém o histórico selecionável. Uma competência futura, se fornecida pela fonte,
é identificada como futura, sem afirmar que está completa.

### `GET /performance?month=YYYY-MM&partnerId=UUID&memberId=UUID`

`month` é opcional e usa o mês corrente em Brasília quando omitido. Aceita mês
válido no formato `YYYY-MM`, excluindo ano zero. Query desconhecida ou inválida
retorna 400; não aceita `userId`. Token inválido retorna 401.

`memberId` é opcional e validado como UUID. Omitido, retorna o consolidado;
informado, retorna a contribuição do integrante autorizado.

Sem linha consolidada para a competência e o parceiro, retorna HTTP 200:

```json
{ "month": "2026-10", "availability": "NO_DATA", "data": null }
```

A tela informa ausência de dados e permite escolher o histórico, sem trocar o mês
automaticamente. Falha de leitura da fonte ou conversão retorna HTTP 503 com
`message: "performance_data_unavailable"`, sem expor detalhes do driver. Mais de
uma linha para o mesmo parceiro e competência também é falha de integridade;
a API não soma nem escolhe arbitrariamente uma linha.

Exemplo fictício de resposta disponível:

```json
{
  "month": "2026-09",
  "availability": "AVAILABLE",
  "data": {
    "level": { "key": "BRONZE", "label": "Bronze" },
    "remuneration": {
      "fixedAmount": 4000,
      "disbursementBonusAmount": 400,
      "rateBonusAmount": 400,
      "riskBonusAmount": 1320,
      "agreementAmount": 0,
      "productionBonusAmount": null,
      "reimbursementBonusAmount": null,
      "totalAmount": 6120
    },
    "indicators": {
      "origination": {
        "status": "AVAILABLE",
        "amount": 110000,
        "targetAmount": 100000,
        "targetPercent": 110,
        "appliedBand": null
      },
      "interestRate": {
        "status": "AVAILABLE",
        "rate": 9.5,
        "simpleRate": 9.5,
        "weightedRate": 9.7,
        "appliedBand": null
      },
      "delinquency": {
        "status": "AVAILABLE",
        "rate": 3.33,
        "portfolioRate": 6,
        "overdueAmount": 6000,
        "portfolioAmount": 100000,
        "disregardedOverdueAmount": 3000,
        "disregardedPortfolioAmount": 10000,
        "appliedBand": null
      },
      "reimbursement": { "status": "NOT_APPLICABLE", "amount": null }
    }
  }
}
```

### Mapeamento direto

| Campo em `data`                                     | Coluna do snapshot                   |
| --------------------------------------------------- | ------------------------------------ |
| `level.label`                                       | `nivel`                              |
| `indicators.origination.amount`                     | `valor_originado_mes`                |
| `indicators.origination.targetAmount`               | `meta_originacao_mensal`             |
| `indicators.origination.targetPercent`              | `pct_meta_atingido`                  |
| `indicators.interestRate.rate`                      | `taxa_media_bonus`                   |
| `indicators.interestRate.simpleRate`                | `taxa_media_simples`                 |
| `indicators.interestRate.weightedRate`              | `taxa_media_ponderada`               |
| `indicators.delinquency.rate`                       | `pct_inadimplencia_bonus`            |
| `indicators.delinquency.portfolioRate`              | `pct_inadimplencia`                  |
| `indicators.delinquency.overdueAmount`              | `valor_inadimplencia`                |
| `indicators.delinquency.portfolioAmount`            | `valor_carteira_ativa`               |
| `indicators.delinquency.disregardedOverdueAmount`   | `valor_inadimplencia_desconsiderada` |
| `indicators.delinquency.disregardedPortfolioAmount` | `valor_carteira_desconsiderada`      |
| `indicators.reimbursement.amount`                   | `valor_reembolso_mes`                |
| `remuneration.fixedAmount`                          | `valor_fixo_mensal`                  |
| `remuneration.disbursementBonusAmount`              | `valor_bonus_desembolso`             |
| `remuneration.rateBonusAmount`                      | `valor_bonus_taxa`                   |
| `remuneration.riskBonusAmount`                      | `valor_bonus_risco`                  |
| `remuneration.agreementAmount`                      | `valor_acordos`                      |
| `remuneration.productionBonusAmount`                | `valor_bonus_producao`               |
| `remuneration.reimbursementBonusAmount`             | `valor_bonus_reembolso`              |
| `remuneration.totalAmount`                          | `valor_remuneracao_total`            |

Taxa considerada no bônus não é necessariamente a ponderada. Inadimplência do bônus
não é necessariamente a total da carteira. A tela mostra as referências adicionais
em detalhes expansíveis, sem recalcular o indicador principal.

`numeric` é convertido de `Prisma.Decimal`, string numérica ou número finito para
número JSON. Nulo permanece nulo; entrada inválida não vira zero. Valores monetários
são reais; percentuais já usam escala 0–100. A apresentação usa duas casas decimais.
O percentual de originação é apresentado como recebido, preservando valores acima
de 100%. A barra limita somente sua largura visual a 100%, sem recalcular o
percentual a partir dos valores monetários. A originação recebe destaque, seguida
de taxa, inadimplência e carteira. Carteira ativa e saldo em inadimplência ficam
visíveis; médias e ajustes adicionais permanecem em detalhes expansíveis.

No desktop, indicadores ficam à esquerda e remuneração à direita. No celular,
o total aparece primeiro e a composição começa recolhida, podendo ser expandida.
O total fica em destaque azul e os componentes aparecem em linhas com valores
alinhados à direita. Componentes nulos são omitidos e valores zero são exibidos.
Total nulo é apresentado como `N/A`.
O total nunca é recomposto pela soma dos componentes: em Híbrido e Reembolso, por
exemplo, produção e bônus de reembolso são alternativas calculadas pelo Analytics.
Nenhum percentual de bônus ou faixa é deduzido desses valores monetários.

O campo "Tipo de alerta" presente no relatório de BI não integra o contrato
confirmado. A extração recente trouxe três colunas adicionais sem cabeçalhos;
seus significados não são inferidos a partir da posição ou dos valores.

## Categorias e campos nulos

| Categoria | `level.key`        | Originação  | Meta | Taxa e risco | Reembolso |
| --------- | ------------------ | ----------- | ---- | ------------ | --------- |
| Bronze    | `BRONZE`           | Sim         | Sim  | Sim          | Não       |
| Prata     | `SILVER`           | Sim         | Sim  | Sim          | Não       |
| Ouro      | `GOLD`             | Sim         | Sim  | Sim          | Não       |
| Platinum  | `PLATINUM`         | Sim         | Sim  | Sim          | Não       |
| Aurea     | `AUREA`            | Informativa | Não  | Informativos | Não       |
| Híbrido   | `HYBRID`           | Sim         | Não  | Não          | Sim       |
| Reembolso | `REIMBURSEMENT`    | Sim         | Não  | Não          | Sim       |
| Cobrador  | `COLLECTION_AGENT` | Não         | Não  | Não          | Sim       |

A aplicabilidade depende da categoria, não somente de o valor ser nulo:

- `NOT_APPLICABLE`: o indicador não pertence à categoria; seus campos são nulos e
  o frontend oculta o bloco e seus detalhes.
- `NO_MEASUREMENT`: o indicador se aplica, mas sua medição principal é nula; a tela
  apresenta `N/A` e "Sem medição nesta competência".
- `AVAILABLE`: a medição principal está preenchida, inclusive quando é zero.

Uma originação pode estar disponível sem meta ou percentual. Metas não aplicáveis
ficam nulas, sem atribuir parâmetros de outro nível. Categorias desconhecidas ou
nulas usam `UNKNOWN`, preservam o rótulo e mostram somente medições preenchidas,
como informação, sem metas ou regras de bônus.

`appliedBand` permanece nulo: o snapshot não fornece limites e percentual da faixa
aplicada. Não deduzir a faixa de indicadores arredondados, de bônus/fixo ou de
réguas vigentes em outra tabela. Os cards não afirmam uma faixa ou bônus inferido.

## Períodos, atualização e compatibilidade

A resposta disponível inclui `view.mode` (`CONSOLIDATED` ou `INDIVIDUAL`),
`view.portfolioReference` e `view.missingDetails`. A referência da carteira vem de
`data_snapshot_parcelas` do snapshot que forneceu os indicadores selecionados.
A tela exibe essa data, pois consolidado e equipe podem estar em cargas diferentes.
Um integrante sem detalhamento não recebe a data da carteira do consolidado.

`data_foto` e `data_hora_foto` representam a gravação da carga e não são usados
como referência da carteira. A situação oficial de fechamento continua fora do
contrato. O mês corrente é identificado como "Prévia", e anteriores como "Mês
completo", pelo calendário do backend. A antiga legenda D-1 é apenas fallback
para respostas consolidadas que ainda não tragam referência; a visão individual
usa a referência real ou a indicação de ausência de detalhamento.

As consultas do frontend têm cache de um minuto com chave por usuário autenticado,
parceiro, integrante e competência,
sem atualização periódica automática. Reconsultar a API não dispara cargas do BI.
Uma competência ausente na tabela continua sendo `NO_DATA`, inclusive se faltar
a carga do mês atual. A consulta não recorre à view nem recalcula valores.

Foram removidos `/performance/me`, `/performance/current` e `/performance/program`,
sem consumidores no frontend adaptado, e seus cálculos operacionais. A troca da
view pela tabela preserva o contrato da V2 e é compatível com o frontend atual.
Não exige migration, mudança de conexão ou alteração dos cálculos do BI.

## Validação antes de liberar

- Confirmar que o usuário da conexão tem `USAGE` no schema `analytics` e `SELECT` na
  tabela `analytics.tbl_snapshot_remuneracao_parceiro_mes`.
- Confirmar o mês atual com corte D-1 e comparar os indicadores da API, da tabela e
  do relatório para o mesmo parceiro e competência.
- Validar categorias, zeros, nulos e ausência de mês sem inferir falta de inscrição.
- Medir latência das consultas de competências e indicadores com filtros por parceiro;
  confirmar o ganho de tempo na consulta aos valores persistidos.
- Validar a liberação por `PERFORMANCE_VIEW` e o bloqueio sem ela, inclusive para admin.
- Para usuários autorizados, validar o filtro com gestor, parceiro sem equipe, admin e suporte, incluindo
  a recusa de pessoas fora do escopo permitido.

- Validar gerente sem consolidado, parceiro sem equipe e titular com integrantes.
- Comparar "Consolidado", próprio titular e integrante com a linha correspondente
  de cada snapshot e sua referência de carteira.
- Confirmar o caso sem detalhamento: zeros informados, sem remuneração herdada.
