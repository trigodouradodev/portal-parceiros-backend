# Arquitetura de propostas e eventos

## Objetivo

Este documento define o padrão arquitetural para os casos de uso de propostas
(`quotes`) no Portal de Parceiros. A regra principal é separar a mudança de
estado da proposta do registro de sua auditoria.

## Responsabilidades

### `QuotesModule`

Responsável pelos casos de uso e pelas regras de negócio da proposta:

- validar quem pode executar uma ação;
- validar a transição de status;
- alterar os dados e o status da `quote`;
- coordenar dependências necessárias para concluir o caso de uso;
- abrir a transação que representa o caso de uso completo.

O módulo não deve persistir diretamente em `quote_events`.

### `QuoteEventsModule`

Responsável pela auditoria do domínio de propostas:

- centralizar os tipos de evento aceitos;
- persistir eventos em `quote_events`;
- padronizar `actorUserId`, `metadata` e demais informações do evento;
- permitir gravação isolada ou dentro da transação do caso de uso chamador.

O módulo de eventos não decide se uma transição de status é permitida e não
altera a `quote`.

## Padrão de transação

Quando uma ação altera a proposta e gera um evento, as duas gravações devem
pertencer à mesma transação:

```text
QuotesService abre a transação
  ├── atualiza quotes
  └── QuoteEventsService.createWithinTransaction(...)
```

Se qualquer gravação falhar, toda a operação deve ser revertida. Não registrar
o evento depois do commit e não abrir uma segunda transação no módulo de
eventos para esse cenário.

Para eventos que não acompanham outra mutação, pode ser usado
`QuoteEventsService.create()`.

## Convenções de eventos

- Os nomes ficam em `QuoteEventType` e usam `snake_case` no passado, descrevendo
  algo que já aconteceu, por exemplo `draft_submitted`.
- Não usar strings de evento diretamente nos serviços consumidores.
- O `metadata` deve conter apenas JSON serializável e ser tipado como entrada
  JSON do Prisma.
- Transições de estado devem informar, quando aplicável, `previousStatus` e
  `newStatus`.
- O ator deve ser obtido da identidade autenticada, nunca do corpo da requisição.
- Um novo tipo deve ser adicionado ao enum e acompanhado por teste.

## Convenções de status

- Os status ficam centralizados em `QuoteStatus`.
- Cada caso de uso declara explicitamente o status de origem e o de destino.
- A atualização deve ser condicional pelo status de origem para impedir duas
  transições concorrentes.
- Uma tentativa a partir de estado inválido deve retornar conflito, sem gerar
  evento.
- A constraint `quotes_quote_status_check` deve ser atualizada antes da
  publicação de código que grave um status novo.

## Fluxo atual

Uma proposta começa a partir de uma simulação disponível do parceiro:

```text
simulation available --(draft_created)--> quote draft
```

Endpoint:

```http
POST /quotes/draft
{ "simulationId": "..." }
```

Regras:

- requer `QUOTE_CREATE` e o gate de atividade `canCreateQuote`;
- a simulação deve pertencer ao parceiro autenticado;
- cada simulação pode originar no máximo uma quote, garantido também pela
  constraint única de `quotes.simulation_id` para fechar concorrência;
- copia para a quote o `party_id`, identidade, contato, produto, taxa,
  condições de parcelamento e o resultado Celcoin já persistido;
- não chama a Celcoin novamente durante a conversão;
- criação da quote e evento `draft_created` pertencem à mesma transação;
- simulação inexistente/de outro parceiro retorna 404; já convertida retorna 409.

A tabela legada de quotes possui colunas `NOT NULL` que ainda não foram
preenchidas nesse ponto do wizard. A criação usa os mesmos defaults técnicos do
connector (`activity_type=CLT`, endereço vazio, rendas zeradas, Pix CPF e
assinatura por e-mail) somente para satisfazer o schema. Esses defaults não são
retornados no snapshot de criação e não representam respostas do cliente. O
modelo definitivo desses campos será tratado junto ao PATCH dos passos do novo
wizard.

Depois do preenchimento, o parceiro entrega o draft para o cliente:

```text
draft --(draft_submitted)--> client_review
```

Endpoint:

```http
PUT /quotes/draft/:quoteId/submit
```

Regras:

- requer `QUOTE_CREATE`;
- somente o responsável pela proposta pode executá-lo;
- `ROLE_ADMIN` mantém o acesso administrativo global;
- atualiza a proposta e registra o evento atomicamente.

Enquanto os campos dos sete passos e sua validação de completude ainda não
forem implementados, a existência do draft não significa que ele está pronto
para submissão. A validação final pertence ao caso de uso de submit e deve ser
adicionada junto ao contrato completo do wizard.

## Evolução prevista

O fluxo de revisão do cliente deve seguir a mesma separação:

```text
client_review --(evento de edição)------> client_review
client_review --(confirmação do cliente)--> kyc_analysis
```

Os nomes e metadados desses eventos devem ser definidos quando os respectivos
casos de uso forem implementados. Não antecipar eventos sem comportamento real.

## Estrutura de referência

```text
src/
  quotes/
    enums/quote-status.enum.ts
    quotes.controller.ts
    quotes.module.ts
    quotes.service.ts
  quote-events/
    enums/quote-event-type.enum.ts
    interfaces/create-quote-event.interface.ts
    quote-events.module.ts
    quote-events.service.ts
```

## Checklist para novos casos de uso

1. Definir claramente ator, estado de origem e estado de destino.
2. Colocar autorização e transição no módulo de domínio responsável.
3. Adicionar o tipo ao catálogo de eventos, se houver um novo fato auditável.
4. Executar mutação e evento na mesma transação.
5. Cobrir sucesso, ownership, estado inválido, inexistência e ausência de evento
   em falhas.
6. Atualizar este documento quando surgir uma nova decisão arquitetural.
