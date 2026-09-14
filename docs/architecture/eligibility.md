# Eligibility module

## Responsibility

`EligibilityModule` owns the partner-portal check of whether a client may
proceed from Originação → Simulação. Its public HTTP contract is:

- `POST /eligibility`: receives name, CPF and birth date; returns whether
  the client is eligible and, only when eligible, the basic identity data
  already known in `parties` (name, CPF, e-mail and telephone).

## Boundary

Eligibility is not a simulation and not a quote. It must not persist a
consultation or consult credit bureau (Serasa/LEMIT). Its party lookup is
global for an authenticated user with `QUOTE_CREATE`; birth date and address
are never sourced from `parties` in this response.

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
