# Eligibility module

## Responsibility

`EligibilityModule` owns the partner-portal check of whether a client may
proceed from Originação → Simulação. Its public HTTP contract is:

- `POST /eligibility`: receives name, CPF and birth date; returns whether
  the client is eligible and, only when eligible, the basic identity data
  already known in `parties` (name, CPF, birth date, e-mail and telephone).

## Boundary

Eligibility is not a simulation and not a quote. It must not persist a
consultation or consult credit bureau (Serasa/LEMIT). Its party lookup is
global for an authenticated user with `QUOTE_CREATE`; birth date and address
are not required to exist in `parties`, and address is never returned in this
response. The top-level birth date remains the one evaluated from the request;
`party.birthDate` is the nullable canonical value used for form prefill.

The name `origination` is intentionally not used for this module because it
is broader than the responsibility implemented here.

## Current rule

A CPF with valid check digits and age from 18 through 120 returns
`eligible: true`. Only then does the service query `parties`: an existing
identity is returned in `party`, while a new customer returns `party: null`.

Invalid CPF or ineligible age returns HTTP 200 with `eligible: false` and
`party: null`, without querying the identity base. Malformed payload, blank
name and an impossible date remain HTTP 400 responses.

When the Receita Federal provider lands, only the decision inside
`EligibilityService.check` changes. The HTTP contract stays the same:
cadastral irregularity keeps returning `eligible: false`; provider outage
becomes `503`. Ineligible results must continue skipping the party lookup.

## Idade e seguro prestamista na criação da proposta

Toda proposta do novo fluxo do Portal nasce de uma simulação com seguro
prestamista. A regra de idade da Caburé (maior de 18 hoje e, no máximo, **70
anos ao fim da vigência**, que é a primeira parcela mais o prazo) é aplicada,
além da simulação, em dois pontos, com `assertInsuranceAgeEligible`
(`src/cabure/insurance-age.guard.ts`):

- **Criar a proposta** (`POST /quotes/draft`, "Iniciar proposta"), contra a data
  de nascimento, o prazo e a primeira parcela da simulação.
- **Salvar o passo Cadastro**, quando a data de nascimento pode ser alterada,
  contra o prazo e a primeira parcela do rascunho. Rascunhos sem simulação
  (caminho antigo, sem seguro) não são barrados por este guarda.

Em caso de recusa responde **400** com `{ statusCode, code:
"INSURANCE_AGE_INELIGIBLE", reason, message }`. Para o corte de 70 anos a
mensagem informa a idade que o cliente teria e o maior prazo que ainda cabe.
A regra de 70 anos continua copiada à mão do `trigo-api`
(`src/cabure/insurance-eligibility.ts`); as cópias precisam ficar sincronizadas.

