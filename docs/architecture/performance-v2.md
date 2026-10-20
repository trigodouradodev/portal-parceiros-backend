# Desempenho V2: consulta à view do Analytics

Status: backend e frontend adaptados. Rota e navegação habilitadas para validação
local com dados reais. A liberação exige `PERFORMANCE_VIEW` explícita, atribuída
manualmente aos grupos pela gestão de permissões. O mês atual depende da disponibilização pelo BI.

## Fonte única e responsabilidades

Todos os indicadores e valores de remuneração são lidos exclusivamente da
`analytics.vw_metric_remuneracao_parceiro_mes`, pela conexão `PrismaService` já
existente. O Analytics calcula os indicadores e fornece nível e meta por
competência. A API autentica, autoriza a pessoa selecionada pelo mesmo escopo da Home e adapta os
valores. O frontend apresenta as medições oficiais.

O filtro da view é `data_competencia`, uma data com o primeiro dia do mês. Não é
um parâmetro de função. As consultas também filtram `id_consultor`: por padrão, `user.sub`; quando informado,
o UUID autorizado em `partnerId`. Nunca há agregação de indicadores da equipe.

O BI está preparando o mês corrente com posição diária D-1. Meses anteriores
representam o mês completo. A extração confirmada contém setembro de 2026, primeiro
mês do novo modelo, com 94 parceiros. O acompanhamento usa a mesma view para o
histórico; o portal não preserva nem substitui seus resultados por snapshots.

Na consulta própria, nome, avatar e cargo vêm do usuário autenticado (`GET /auth/me`).
Ao selecionar outra pessoa, o nome exibido no bloco de Desempenho vem da mesma
lista da Home; o cargo do usuário autenticado não é atribuído a ela. Cargo e nível
financeiro são conceitos distintos. Fixo, bônus em reais, acordos e total
da remuneração são apresentados com os valores oficiais da view. Simulador,
comparação de ganhos, permanência e data de início da parceria ficam fora da tela
e da resposta desta V2, pois esses dois últimos campos não são fornecidos pela view.

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

A liberação para gerentes ou demais parceiros é manual: atribuir
`PERFORMANCE_VIEW` aos grupos desejados pela gestão de grupos e permissões.
Não é preciso alterar o código.
Essa permissão controla a entrada no módulo; o escopo de pessoas continua sendo
validado separadamente, conforme a Home.

Aplicar a migration antes de liberar os serviços com a nova exigência. Após a
atribuição, renovar a sessão para atualizar as permissões do token e do perfil.
A migration está preparada no repositório; sua execução no banco faz parte da
implantação.

## Filtro de pessoas da equipe

O frontend reutiliza `useSubordinates`, a rota `GET /activities/subordinates` e o
componente `SelectDialogField` da Home. A opção inicial é "Meu desempenho". O
seletor aparece quando há pessoas disponíveis e permite escolher uma por vez.
Mantém a competência selecionada na troca, mesmo sem dados naquele mês. O filtro
permanece acessível durante carregamentos e erros.

`PeopleScopeService`, exportado pelo módulo Scope, concentra a listagem e a
validação usadas pela Home e pelo Desempenho. Gestores acessam seus subordinados
recursivos. Admin e suporte acessam os parceiros ativos habilitados no rollout,
com grupos ativos, permissão `QUOTE_ACTIVITY_GATES` e papel de consultor ou cobrador.
`INSTALLMENT_VIEW_ALL` sozinho não amplia essa seleção para fora da hierarquia.
A seleção de outra pessoa exige as mesmas permissões da rota da Home:
`INSTALLMENT_VIEW`, `INSTALLMENT_VIEW_ALL`, `ROLE_SUPPORT` ou `ROLE_ADMIN`.
Consulta própria não exige essas permissões de equipe; exige `PERFORMANCE_VIEW`.

As duas rotas de Desempenho aceitam `partnerId` opcional, validado como UUID.
Ausência de `PERFORMANCE_VIEW` ou pessoa fora do escopo retorna 403 antes da
consulta à view. A listagem e a
hierarquia usam as tabelas de usuários e permissões existentes; a fonte dos
indicadores e da remuneração continua sendo somente a view do Analytics.
O ID fixo usado na validação local foi removido.

## API

### `GET /performance/months?partnerId=UUID`

Retorna competências distintas disponíveis para o parceiro, em ordem decrescente,
e o mês corrente calculado no banco em `America/Sao_Paulo`:

```json
{
  "currentMonth": "2026-10",
  "months": [{ "month": "2026-09" }]
}
```

Sem linhas para o parceiro, `months` é `[]`. Isso não significa ausência de inscrição.
A tela seleciona inicialmente `currentMonth`, mesmo quando não existe na view, e
mantém o histórico selecionável. Uma competência futura, se fornecida pela fonte,
é identificada como futura, sem afirmar que está completa.

### `GET /performance?month=YYYY-MM&partnerId=UUID`

`month` é opcional e usa o mês corrente em Brasília quando omitido. Aceita mês
válido no formato `YYYY-MM`, excluindo ano zero. Query desconhecida ou inválida
retorna 400; não aceita `userId`. Token inválido retorna 401.

Sem linha para a competência e o parceiro, retorna HTTP 200:

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

| Campo em `data`                                     | Coluna da view                       |
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

O campo "Tipo de alerta" presente no relatório de BI não está na estrutura da
view informada e não é fabricado pelo portal.

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

`appliedBand` permanece nulo: a view não fornece limites e percentual da faixa
aplicada. Não deduzir a faixa de indicadores arredondados, de bônus/fixo ou de
réguas vigentes em outra tabela. Os cards não afirmam uma faixa ou bônus inferido.

## Períodos, atualização e compatibilidade

A view não fornece situação de fechamento, data efetiva da carga ou referência
da carteira. O contrato removeu `data.snapshot` e `months[].status`. A tela não
exibe "Atualizado em", "Referência da carteira" ou "Fechado".

Com base em `currentMonth` do backend, a tela apresenta o mês atual como "Prévia",
com a informação "Posição diária com base em D-1", e meses anteriores como "Mês
completo". Esses rótulos descrevem o período; não são status de fechamento oficial
nem garantia de que o histórico é imutável. Não se calcula ontem para inventar uma
data de referência. A data efetiva poderá ser acrescentada quando fornecida pelo BI.

As consultas do frontend têm cache de um minuto com chave por usuário autenticado,
pessoa selecionada e competência,
sem atualização periódica automática. Reconsultar a API não dispara cargas do BI.
A ausência do mês atual até a entrega do Analytics continua sendo `NO_DATA`.

Foram removidos `/performance/me`, `/performance/current` e `/performance/program`,
sem consumidores no frontend adaptado, e seus cálculos operacionais. Nenhuma tabela,
migration, configuração de conexão ou cálculo do BI foi alterado. Backend e frontend
devem ser publicados com o novo contrato juntos, após a validação integrada.

## Validação antes de liberar

- Confirmar que o usuário da conexão tem `USAGE` no schema `analytics` e `SELECT` na
  view, incluindo eventuais requisitos de acesso das dependências definidos pelo BI.
- Confirmar o mês atual com corte D-1 e comparar os indicadores da API, da view e
  do relatório para o mesmo parceiro e competência.
- Validar categorias, zeros, nulos e ausência de mês sem inferir falta de inscrição.
- Medir latência das consultas de competências e indicadores com filtros por parceiro;
  a view possui dependências de cálculo que precisam atender o uso do portal.
- Validar a liberação por `PERFORMANCE_VIEW` e o bloqueio sem ela, inclusive para admin.
- Para usuários autorizados, validar o filtro com gestor, parceiro sem equipe, admin e suporte, incluindo
  a recusa de pessoas fora do escopo permitido.
