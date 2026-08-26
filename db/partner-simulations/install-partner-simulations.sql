-- Espelho local da migration Knex do trigo-connector:
--   src/database/migrations/20260826120000_create_partner_simulations_table.ts
--
-- Fonte da verdade do schema: o connector. Este SQL só existe para o dump
-- local do portal enquanto a migration do backoffice não rodou.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_simulations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.trigo_users (id),
  finance_product_id uuid NOT NULL REFERENCES public.finance_products (id),
  client_name varchar(255) NOT NULL,
  document varchar(14) NOT NULL,
  birth_date date NOT NULL,
  email varchar(255) NOT NULL,
  telephone varchar(20) NOT NULL,
  finance_amount numeric(15, 2) NOT NULL,
  interest_rate numeric(12, 8) NOT NULL,
  installment_numbers integer NOT NULL,
  first_installment_date date NOT NULL,
  installment_amount numeric(15, 2) NOT NULL,
  simulation_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_simulations_user_created_index
  ON public.partner_simulations (user_id, created_at);

CREATE INDEX IF NOT EXISTS partner_simulations_document_index
  ON public.partner_simulations (document);

COMMIT;
