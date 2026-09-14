# System configs module

## Responsibility

`SystemConfigsModule` is the shared read-only boundary for the
`public.system_configs` table. Feature modules must import it and depend on
`SystemConfigsService` instead of querying the table through Prisma directly.

The service exposes:

- `getValue(key)`: returns one value or `null` when the key does not exist.
- `getValues(keys)`: loads multiple keys in one database query and returns
  `null` for missing entries.
- `getRequiredValues(keys)`: loads multiple keys and throws
  `MissingSystemConfigError` if any key does not exist.

The module returns stored strings without trimming or interpreting them. Each
consumer owns the validation and parsing of its configuration. This preserves
the table's generic nature and avoids coupling it to Celcoin or another
integration.

## Cache and consistency

Values are cached in memory per key for five minutes, including missing keys.
This matches the current connector policy and prevents unrelated modules from
implementing different cache behavior. A batch request only queries keys that
are absent or expired in the local process cache.

Changes made through the backoffice or connector may therefore take up to five
minutes to appear in each portal backend instance. If the portal later owns
system-config mutations, that write path must invalidate the affected local
cache entries.

## Ownership and safety

The connector remains the owner of the `system_configs` schema, migrations and
administrative write endpoints. This module does not fall back to environment
variables and must not log configuration values because rows may be marked as
sensitive.

Feature adapters translate `MissingSystemConfigError` into an error meaningful
to their own use case. For example, `CelcoinConfigService` maps a missing or
blank Celcoin key to HTTP 503 without exposing its value.
