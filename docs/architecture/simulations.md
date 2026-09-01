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
  authenticated partner through Celcoin.
- `PATCH /simulations/:id`: updates a simulation owned by the authenticated
  partner only while it has not originated a quote, using the same payload and
  business rules and Celcoin calculation as `POST`. A missing/foreign
  simulation returns 404 and a converted simulation returns 409.

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

## Celcoin preview

`SimulationsModule` owns the simulation use case, but not the HTTP details of
the provider. Those live behind `CelcoinSimulationService`, exported by
`CelcoinModule`. Local permission, product, installment, rate and due-date
validations run before the external request. The request runs before opening the
database transaction, so a slow provider does not hold database locks.

The preview uses the requested-amount endpoint:

`POST /banking/originator/products/{CELCOIN_PRODUCT_ID}/preview`

The Celcoin product is intentionally a single system configuration, as in
`trigo-connector`. It is not mapped to each internal `finance_products` row.
This decision must be revisited if Product defines multiple Celcoin products.

The integration reads `CELCOIN_AUTH_BASE_URL`, `CELCOIN_PLATFORM_BASE_URL`,
`CELCOIN_ORIGINATOR_ID`, `CELCOIN_ORIGINATOR_SECRET` and
`CELCOIN_PRODUCT_ID` from the shared `system_configs` table. These values are
not portal environment variables. In the connector, environment values are
only defaults used when initially creating a missing system config; runtime
reads use the database. The shared `SystemConfigsModule` owns batched access and
the five-minute per-key cache, matching the connector's current TTL.

The fixed provider values are `iof_type=PERSON`, `schedule_type=MONTHLY`,
`finance_fee=0`, `insurance_amount=0` and `tac_amount=0`. The disbursement date
is the current business date in `America/Sao_Paulo`. `payment_amount` from the
Celcoin response is the authoritative `simulations.installment_amount`; values
from `schedule` and the former local Price calculation must not replace it.

The complete successful provider response is stored in
`simulations.simulation_result` for audit, but it is not part of the public HTTP
contract. Responses expose only the normalized `installmentAmount` and
`totalAmountOwed` fields. This prevents the frontend and list payloads from
depending on the large provider-specific contract. Legacy rows without a
provider result omit `totalAmountOwed`. A provider rejection (HTTP 4xx) becomes
422; configuration, authentication, network, timeout, malformed response and
provider 5xx failures become 503. No party or simulation changes are persisted
when the preview fails.

Originator authentication uses OAuth2 client credentials. The access token is
cached in memory until shortly before `expires_in`, and concurrent calls share
the same pending authentication request. Authentication and preview requests
have a ten-second timeout.

## Persistence ownership

Saved simulations use the shared `simulations` table. Database schema changes
are owned by Knex migrations in `trigo-connector`; this backend must not keep a
parallel SQL installer or its own copy of the migration.

This integration uses the existing `installment_amount` and
`simulation_result` columns, so it requires no database migration.

The name `origination` is intentionally not used for this module because it is
broader than the responsibility implemented here and would mix simulations,
quotes, and their workflow under the same application boundary.
