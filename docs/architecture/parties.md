# Parties module

## Responsibility

`PartiesModule` owns customer identity lookup and resolution for the partner
portal. Its public HTTP contract is:

- `POST /parties/lookup`: looks up a person globally by CPF for an authenticated
  user with `QUOTE_CREATE`.

The request uses a body instead of a URL parameter so the CPF is not part of
the route or query string. A successful lookup returns only name, normalized
CPF, e-mail and telephone. Birth date and address are intentionally excluded.
When no identity is found, the endpoint returns `found: false` and `party: null`
instead of an HTTP 404, because a new customer is a normal simulation flow.

## Identity resolution

Simulation creation never accepts a `party_id` from the frontend. The backend
normalizes the CPF and resolves the canonical identity inside the same database
transaction that persists the simulation.

During the ongoing `clients` to `parties` migration, new identities still use
`clients` as the write path. The connector-owned synchronization trigger copies
the row to `parties` with the same ID. This transitional detail is encapsulated
inside `PartiesService` and must not leak into feature modules.

Existing canonical contact data is not silently overwritten by values entered
in a simulation. Those values remain available in the simulation snapshot.
