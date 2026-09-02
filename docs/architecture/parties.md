# Parties module

## Responsibility

`PartiesModule` owns customer identity lookup and resolution for the partner
portal. It is an internal boundary and does not expose its own controller.

The public lookup is orchestrated by `POST /eligibility`, after the applicant
passes the current eligibility rules. A successful lookup returns only name,
normalized CPF, e-mail and telephone. Birth date and address are intentionally
excluded. A missing identity is a normal new-customer result (`party: null`).

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
