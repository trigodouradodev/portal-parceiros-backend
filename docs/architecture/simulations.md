# Simulations module

## Responsibility

`SimulationsModule` owns the lifecycle of saved credit simulations in the
partner portal. Its public HTTP contract is:

- `GET /simulations`: lists simulations owned by the authenticated partner.
  Optional `name` (case-insensitive contains) and `document` (digits-only
  contains) query params combine with AND. Empty query lists all of the
  partner's simulations, newest first. Each item exposes the derived status
  `available` or `converted`.
- `POST /simulations`: calculates and persists a simulation for the
  authenticated partner.
- `PATCH /simulations/:id`: updates a simulation owned by the authenticated
  partner only while it has not originated a quote, using the same payload and
  business rules as `POST`. A missing/foreign simulation returns 404 and a
  converted simulation returns 409.

## Boundary

A simulation is not a quote. It is an input snapshot and calculation result
that may later be used to start a quote.

Simulation status is not persisted as a second source of truth. `available`
means no quote references the simulation; `converted` means a quote has a
`simulation_id` pointing to it. Quote creation and that unique link must be
committed in the same transaction. Both the preliminary edit check and the
conditional `UPDATE` enforce immutability after conversion.

Each new simulation resolves the customer identity through `PartiesModule` and
stores the resulting `party_id`. Name, CPF, birth date, e-mail and telephone
remain in `simulations` as the historical snapshot entered at simulation time;
they are not replaced by later changes to the canonical party.

The module must not own quote lifecycle transitions or interactions such as
partner submission and client review. Those belong to the quote and quote-event
boundaries, respectively.

## Persistence ownership

Saved simulations use the shared `simulations` table. Database schema changes
are owned by Knex migrations in `trigo-connector`; this backend must not keep a
parallel SQL installer or its own copy of the migration.

The name `origination` is intentionally not used for this module because it is
broader than the responsibility implemented here and would mix simulations,
quotes, and their workflow under the same application boundary.
