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
- quando a party possui endereço, copia o registro primário (ou o mais recente)
  para `client_address` e o devolve no snapshot de criação para pré-preencher o
  formulário;
- não chama a Celcoin novamente durante a conversão;
- criação da quote e evento `draft_created` pertencem à mesma transação;
- simulação inexistente/de outro parceiro retorna 404; já convertida retorna 409.

A tabela legada de quotes possui colunas `NOT NULL` que ainda não foram
preenchidas nesse ponto do wizard. A criação usa os mesmos defaults técnicos do
connector (`activity_type=CLT`, endereço vazio quando a party não possui um,
rendas zeradas, Pix CPF e assinatura por e-mail) somente para satisfazer o
schema. Esses defaults não representam respostas do cliente. O modelo
definitivo desses campos é tratado pelos PATCHes dos passos do novo wizard.

### Passo 1: Cadastro

```http
PATCH /quotes/draft/:quoteId/registration
```

O endpoint salva somente os campos do Cadastro: renovação, gênero, RG,
profissão, categorias de atividade econômica, estado civil, composição da
casa, situação e tempo de residência, programas de governo, veículo e
finalidade do crédito. Detalhe e credor de dívida não pertencem a esse passo.

As opções são códigos estáveis validados no backend/frontend e persistidos em
`varchar` ou arrays JSONB, sem enum ou `CHECK` no banco. A atividade econômica
é múltipla e usa `economic_activity_categories`; a coluna escalar legada
`activity_type` não é alterada por esse endpoint.

Regras condicionais:

- `economicActivityOther` é obrigatório apenas quando a atividade inclui
  `other`;
- `spouseDocument` é um CPF válido obrigatório para `married` e
  `stable_union`;
- `none` não pode ser combinado com outro programa de governo;
- `vehicleFinanced` é obrigatório apenas quando `ownsVehicle=true`;
- campos condicionais que deixam de se aplicar são limpos no banco.

Somente o responsável (ou `ROLE_ADMIN`) pode salvar uma quote ainda em
`draft`. O update e o upsert de `quote_draft_steps.registration` são executados
na mesma transação. A tabela de passos guarda apenas o progresso atual; os
dados de negócio continuam em `quotes`. Salvar uma etapa não gera evento de
domínio.

### Passo 2: Atividade e renda

```http
PATCH /quotes/draft/:quoteId/income
```

O endpoint salva CNPJ, tempo na atividade, renda mensal principal, fonte da
renda, existência de múltiplas fontes, renda secundária e comprovante de renda
disponível. O CNPJ é opcional; quando informado, aceita máscara, valida os
dígitos verificadores e é persistido somente com os 14 dígitos.

A renda principal e a secundária representam fontes separadas e não são
somadas na persistência. A principal reutiliza `quotes.personal_income`; a
secundária usa `quotes.secondary_income`. Quando
`hasMultipleIncomeSources=true`, a renda secundária é obrigatória e deve ser
maior que zero. Quando for `false`, ela é limpa no banco.

As opções de tempo, fonte e comprovante são códigos estáveis validados na
aplicação e persistidos em `varchar`, sem enum ou `CHECK` no banco. Assim como
no Cadastro, somente o responsável (ou `ROLE_ADMIN`) pode salvar enquanto a
quote está em `draft`. A atualização da quote e o upsert de
`quote_draft_steps.income` são atômicos e não geram evento de domínio.

As regras comuns de ownership, status e progresso dos passos ficam em
`QuoteDraftStepsService`; cada serviço de passo mantém somente suas validações
e seu mapeamento de campos.

### Passo 3: Endereço

```http
PATCH /quotes/draft/:quoteId/address
```

O endpoint mantém o formato de endereço já consumido pelo connector:
`zipCode`, `streetName`, `streetNumber`, `streetComplement`,
`streetDistrict`, `city`, `state` e `referencePoint`. Esses dados substituem o
objeto completo de `quotes.client_address`; não são necessárias novas colunas.
O CEP aceita máscara e é persistido somente com oito dígitos. Complemento é
opcional e, quando ausente, é gravado como string vazia para compatibilidade
com o fluxo legado.

A geolocalização é opcional e, quando presente, contém `latitude`, `longitude`
e `precision`, reutilizando `quotes.geolocation`. Uma nova gravação sem
geolocalização limpa o valor anterior. A atualização da quote e o upsert de
`quote_draft_steps.address` são atômicos e não geram evento de domínio. O passo
não altera `parties.addresses`: assim como no fluxo atual, a sincronização do
endereço canônico da pessoa continua sendo responsabilidade do connector após
a aprovação da proposta. As mesmas regras de ownership e status dos passos
anteriores se aplicam.

As consultas auxiliares não pertencem ao domínio de propostas e ficam no
`LocationsModule`:

```http
GET /locations/postal-code/:zipCode
GET /locations/states-cities
GET /locations/reverse-geocode?latitude=-23.55052&longitude=-46.633308
```

O primeiro normaliza a resposta do ViaCEP para os mesmos nomes usados no
endereço da quote. O segundo agrupa a malha de localidades do IBGE por UF e
mantém o resultado em memória por 24 horas, evitando baixar a lista completa a
cada requisição. O terceiro consulta a Google Geocoding API e devolve o endereço
mais específico encontrado, com os componentes ausentes representados por
`null`. A geocodificação reversa é somente leitura: não altera endereço de
`parties`, simulações ou quotes. As três consultas requerem `QUOTE_CREATE` e
traduzem indisponibilidade do respectivo provedor para HTTP 503.

### Passo 4: Parecer do parceiro

```http
PATCH /quotes/draft/:quoteId/partner-opinion
```

O endpoint salva tempo de relacionamento, origem do relacionamento, avaliação
geral, sinais de endividamento informal e de urgência financeira e o parecer
em texto livre. O texto reutiliza `quotes.observations`, que já representa o
parecer do parceiro no fluxo legado.

Os demais dados usam colunas próprias. `sales_agent_relation` não é
reutilizado porque representa grau de parentesco/relação com o consultor e
alimenta informações do contrato. `referral` também não é reutilizado porque
seu contrato é um objeto completo de outra pessoa, enquanto este passo coleta
somente o CPF de quem indicou.

Regras condicionais:

- `relationshipOriginOther` é obrigatório somente quando a origem é `other`;
- `referrerDocument` é um CPF válido obrigatório somente quando a origem é
  `aurea_customer_referral`;
- campos condicionais que deixam de se aplicar são limpos no banco.

O CPF do indicador é validado estruturalmente, sem exigir que já exista em
`parties`. A atualização da quote e o upsert de
`quote_draft_steps.partner_opinion` são atômicos e não geram evento de domínio.
As regras comuns de ownership e status continuam válidas.

### Passo 5: Avalista

```http
PATCH /quotes/draft/:quoteId/guarantor
```

O endpoint salva nome, CPF, nascimento, e-mail, telefone, endereço e grau de
parentesco no JSONB `quotes.guarantor`. A estrutura de identidade e endereço é
a mesma já consumida pelo connector e pela integração Celcoin. O CEP e o CPF
são persistidos somente com dígitos, o telefone no formato canônico
`+55<DDD><número>` e o complemento ausente como string vazia.

O avalista deve ter entre 18 e 119 anos e não pode possuir o mesmo CPF do
tomador. O grau de parentesco é um código estável validado pela aplicação e
armazenado dentro do snapshot JSON, sem enum ou `CHECK` no banco. As opções são
`parent`, `spouse`, `sibling`, `child`, `other_relative` e `unrelated`.

Este passo não cria nem atualiza registros de `parties` ou `addresses`, nem
preenche `guarantor_party_id`. A resolução da identidade e do endereço do
avalista continua ocorrendo no connector quando o draft for efetivamente
submetido. A gravação do JSON e o upsert de `quote_draft_steps.guarantor` são
atômicos e não geram evento de domínio.

Para pré-preencher o passo, o frontend pode consultar
`GET /parties/by-cpf/:cpf`. A resposta não expõe `partyId`; o identificador não
faz parte do PATCH do avalista e não é confiado ao cliente HTTP.

### Passo 6: Financeiro

```http
PATCH /quotes/draft/:quoteId/financial
```

O contrato HTTP separa `expenses` e `loans`. Uma despesa possui categoria,
valor e descrição opcional. Um empréstimo possui valor da parcela, frequência,
instituição, categoria e descrição opcional. As duas listas podem ser vazias e
cada nova gravação substitui integralmente os valores anteriores do passo.

Para preservar a compatibilidade com os consumidores do connector, despesas
são persistidas em `quotes.debts` no formato `category`, `amount` e
`observations`. Empréstimos continuam em `quotes.loans`: o valor da parcela é
gravado em `amount`, a descrição em `observations`, e os novos campos
`frequency` e `institution` são acrescentados ao objeto. O endpoint traduz
esses nomes legados e devolve ao portal o contrato explícito com
`installmentAmount` e `description`.

Categorias e demais opções são códigos estáveis validados na aplicação e
armazenados nos JSONB existentes, sem enum ou `CHECK` no banco. Uma descrição
é obrigatória quando a categoria da despesa for `other`, ou quando a categoria
ou instituição do empréstimo for `other`. Valores devem ser maiores que zero e
ter no máximo duas casas decimais.

A gravação dos dois JSONs e o upsert de `quote_draft_steps.financial` são
atômicos e não geram evento de domínio. As regras comuns de ownership e status
continuam válidas. Não é necessária migration.

### Passo 7: Documentação

```http
POST   /quotes/draft/:quoteId/attachments
GET    /quotes/draft/:quoteId/attachments
DELETE /quotes/draft/:quoteId/attachments/:attachmentId
PATCH  /quotes/draft/:quoteId/documentation
```

O upload recebe um arquivo por requisição em `multipart/form-data`, no campo
`file`, junto de `attachmentType`. Os tipos públicos são
`identification_document`, `proof_of_residence`, `activity_photo` e
`proof_of_income`. Para comprovante de renda, `incomeProofType` é obrigatório
e aceita `bank_statement`, `payslip`, `inss_benefit` ou `mei_das`.

PDF, JPEG e PNG são aceitos nos documentos de identificação e residência;
fotos da atividade aceitam apenas JPEG e PNG; comprovantes de renda aceitam
somente PDF. O conteúdo real é validado pela assinatura do arquivo e o limite
é 10 MB por upload. Cada metadata recebe um UUID gerado pelo backend, usado
para exclusão sem expor `s3Key`. A listagem devolve os quatro grupos com URLs
assinadas de leitura válidas por 15 minutos.

Os arquivos ficam no bucket indicado por
`system_configs.S3_QUOTES_ATTACHMENTS_BUCKET`. Região e credenciais são
configuração de infraestrutura: `AWS_REGION` e a provider chain padrão do SDK
da AWS. O acesso ao S3 fica isolado no `StorageModule`, reutilizável por outros
domínios; o módulo de quotes mantém a escolha do bucket e as regras do wizard.

Os três grupos legados continuam em `document_attachment`,
`proof_of_residence_attachment` e `proof_of_income_attachment`. Fotos da
atividade usam o novo JSONB `activity_photos_attachment`. Upload e exclusão
invalidam uma conclusão anterior do passo e registram respectivamente
`attachment_added` e `attachment_removed`, na mesma transação do metadata.

O PATCH de conclusão exige pelo menos um arquivo de identificação, residência
e atividade. Também exige renda, exceto quando o passo 2 declarou
`available_income_proof=none`. Só então grava
`quote_draft_steps.documentation`. Fotos da atividade são preservadas no
cadastro do cliente após aprovação, como `client_files.activity_photo`, mas
não são enviadas à Celcoin até existir decisão explícita de Produto.

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
- exige os sete registros de conclusão em `quote_draft_steps` e devolve as
  etapas pendentes quando o wizard ainda está incompleto;
- atualiza a proposta e registra o evento atomicamente.

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
  locations/
    geocoding.module.ts
    geocoding.service.ts
    locations.controller.ts
    locations.module.ts
    postal-code.service.ts
    brazil-locations.service.ts
  quotes/
    enums/quote-status.enum.ts
    services/quote-draft-address.service.ts
    services/quote-draft-documentation.service.ts
    services/quote-draft-financial.service.ts
    services/quote-draft-guarantor.service.ts
    services/quote-draft-income.service.ts
    services/quote-draft-partner-opinion.service.ts
    services/quote-draft-registration.service.ts
    services/quote-draft-steps.service.ts
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
