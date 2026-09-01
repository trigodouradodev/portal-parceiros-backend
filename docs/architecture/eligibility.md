# Eligibility module

## Responsibility

`EligibilityModule` owns the partner-portal check of whether a client may
proceed from Originação → Simulação. Its public HTTP contract is:

- `POST /eligibility`: receives name, CPF and birth date; returns whether
  the client is eligible.

## Boundary

Eligibility is not a simulation and not a quote. It must not persist a
consultation, consult credit bureau (Serasa/LEMIT), or gate
`POST /simulations`.

The name `origination` is intentionally not used for this module because it
is broader than the responsibility implemented here.

## Current rule

A valid payload (CPF check digits + age 18–120) returns `eligible: true`.
Invalid CPF or age is `400`, not `eligible: false`.

When the Receita Federal provider lands, only the decision inside
`EligibilityService.check` changes. The HTTP contract stays the same:
cadastral irregularity becomes `200 { eligible: false }`; provider outage
becomes `503`.
