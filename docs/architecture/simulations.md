# Simulations module

## Responsibility

`SimulationsModule` owns the lifecycle of saved credit simulations in the
partner portal. Its public HTTP contract is:

- `GET /simulations`: lists simulations owned by the authenticated partner.
  Optional `name` (case-insensitive contains) and `document` (digits-only
  contains) query params combine with AND. Empty query lists all of the
  partner's simulations, newest first.
- `POST /simulations`: calculates and persists a simulation for the
  authenticated partner.

## Boundary

A simulation is not a quote. It is an input snapshot and calculation result
that may later be used to start a quote.

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
