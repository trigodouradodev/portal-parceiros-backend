# Parties module

## Responsibility

`PartiesModule` owns customer identity lookup and resolution for the partner
portal. It exposes only data needed by form prefill; internal identity IDs are
never accepted from or returned to the frontend.

The public lookup is orchestrated by `POST /eligibility`, after the applicant
passes the current eligibility rules. A successful lookup returns only name,
normalized CPF, e-mail and telephone. Birth date and address are intentionally
excluded. A missing identity is a normal new-customer result (`party: null`).

Forms that need to reuse an existing person's cadastro, such as the guarantor
step, use:

```http
GET /parties/by-cpf/:cpf
```

The endpoint requires `QUOTE_CREATE`, accepts any structurally valid CPF and
does not execute borrower eligibility rules. It returns name, normalized CPF,
e-mail, telephone and the primary address, falling back to the most recently
created address when there is no primary. Missing person and missing address
are normal results represented by `party: null` and `address: null`,
respectively. Birth date is not returned because it is not stored in
`parties`.

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
