-- Analytics mínimo para os 18 KPIs do módulo Carteira.
--
-- Fonte: dump de HML de 2026-08-03. Este é um recorte independente das
-- views legadas analytics.fato_* que dependem do schema bi.
--
-- Execute manualmente, apontando EXPLICITAMENTE para o banco de dev:
--   psql "$DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -f db/analytics/install-analytics-portal.sql
--
-- Não execute prisma migrate para este schema. O banco é compartilhado e o
-- Prisma é apenas client/introspecção.

BEGIN;

CREATE SCHEMA IF NOT EXISTS analytics;

-- Empresas internas são excluídas em todas as facts, como no Power BI.
CREATE OR REPLACE VIEW analytics.vw_dim_empresa AS
SELECT
  c.id AS id_empresa,
  c.name AS nome_empresa,
  c.cnpj,
  c.uses_brx_integration AS flag_utiliza_integracao_brx,
  c.uses_celcoin_integration AS flag_utiliza_integracao_celcoin,
  c.charges_iof AS flag_cobra_iof,
  c.is_active AS flag_ativo
FROM public.companies c
WHERE c.name NOT IN ('Trigo Dourado', 'Castro');

-- Dimensão hierárquica usada pelas facts e pelos filtros do One Page.
CREATE OR REPLACE VIEW analytics.vw_dim_consultor AS
WITH RECURSIVE consultor_universe AS (
  SELECT DISTINCT ON (c.user_id)
    c.user_id,
    tu.full_name AS name,
    tu.manager_id,
    c.company_id,
    c.is_active
  FROM public.consultants c
  JOIN public.trigo_users tu ON tu.id = c.user_id
  WHERE c.user_id IS NOT NULL
  ORDER BY c.user_id
), hierarquia AS (
  SELECT
    cu.user_id AS id_consultor,
    cu.name AS nome_consultor,
    cu.manager_id AS id_gestor_direto,
    cu.name AS nome_gestor_direto,
    cu.company_id AS id_empresa,
    cu.is_active AS flag_ativo,
    1 AS nivel_hierarquia,
    cu.name::text AS nivel_1_nome,
    NULL::text AS nivel_2_nome,
    NULL::text AS nivel_3_nome,
    NULL::text AS nivel_4_nome,
    ARRAY[cu.user_id] AS caminho_hierarquia
  FROM consultor_universe cu
  WHERE cu.manager_id IS NULL
     OR cu.manager_id NOT IN (SELECT user_id FROM consultor_universe)

  UNION ALL

  SELECT
    child.user_id,
    child.name,
    child.manager_id,
    manager.name,
    child.company_id,
    child.is_active,
    parent.nivel_hierarquia + 1,
    parent.nivel_1_nome,
    CASE WHEN parent.nivel_hierarquia + 1 = 2 THEN child.name::text
         ELSE parent.nivel_2_nome END,
    CASE WHEN parent.nivel_hierarquia + 1 = 3 THEN child.name::text
         ELSE parent.nivel_3_nome END,
    CASE WHEN parent.nivel_hierarquia + 1 = 4 THEN child.name::text
         ELSE parent.nivel_4_nome END,
    parent.caminho_hierarquia || child.user_id
  FROM consultor_universe child
  JOIN hierarquia parent ON child.manager_id = parent.id_consultor
  LEFT JOIN consultor_universe manager ON manager.user_id = child.manager_id
  -- Protege a view contra ciclos de dados legados na hierarquia.
  WHERE child.user_id <> ALL(parent.caminho_hierarquia)
)
SELECT
  id_consultor,
  nome_consultor,
  id_gestor_direto,
  nome_gestor_direto,
  id_empresa,
  flag_ativo,
  nivel_hierarquia,
  nivel_1_nome AS nome_diretor,
  COALESCE(nivel_2_nome, nivel_1_nome) AS nome_gerente_nivel_1,
  COALESCE(nivel_3_nome, nivel_2_nome, nivel_1_nome) AS nome_gerente_nivel_2,
  COALESCE(nivel_4_nome, nivel_3_nome, nivel_2_nome, nivel_1_nome)
    AS nome_supervisor,
  caminho_hierarquia
FROM hierarquia;

-- Uma linha por contrato desembolsado. As flags de cliente seguem a régua
-- Novo / Renovado / Reativo usada no One Page.
CREATE OR REPLACE VIEW analytics.vw_fato_originacao AS
WITH contratos_validos AS (
  SELECT
    c.id,
    c.client_id,
    c.disbursement_date AS data_desembolso
  FROM public.contracts c
  JOIN analytics.vw_dim_empresa e ON e.id_empresa = c.company_id
  WHERE c.disbursement_date IS NOT NULL
    AND c.status NOT IN ('failed', 'cancelled', 'not_processed')
), quitacao_contrato AS (
  SELECT c.id AS contrato_id, MAX(i.payment_date) AS data_quitacao
  FROM public.contracts c
  JOIN public.installments i ON i.contract_id = c.id
  WHERE c.status = 'closed' AND i.payment_date IS NOT NULL
  GROUP BY c.id
), historico_cliente AS (
  SELECT
    atual.id AS contrato_id,
    COUNT(anterior.id) AS qtd_contratos_anteriores,
    COUNT(anterior.id) FILTER (
      WHERE quitacao.data_quitacao IS NULL
         OR quitacao.data_quitacao > atual.data_desembolso
    ) > 0 AS flag_tinha_contrato_aberto,
    COALESCE(BOOL_OR(
      quitacao.data_quitacao <= atual.data_desembolso
      AND date_trunc('month', quitacao.data_quitacao)
        = date_trunc('month', atual.data_desembolso)
    ), false) AS flag_quitou_no_mes
  FROM contratos_validos atual
  LEFT JOIN contratos_validos anterior
    ON anterior.client_id = atual.client_id
   AND (
     anterior.data_desembolso < atual.data_desembolso
     OR (anterior.data_desembolso = atual.data_desembolso AND anterior.id < atual.id)
   )
  LEFT JOIN quitacao_contrato quitacao ON quitacao.contrato_id = anterior.id
  GROUP BY atual.id
)
SELECT
  c.id AS id_contrato,
  c.contract_number AS numero_contrato,
  c.company_id AS id_empresa,
  c.client_id AS id_cliente,
  regexp_replace(cl.tax_id, '\\D', '', 'g') AS documento,
  c.consultant_id AS id_consultor,
  c.current_collection_agent_id AS id_agente_cobranca,
  fp.id AS id_produto,
  COALESCE(fp.product_name, 'SEM_PRODUTO') AS nome_produto,
  c.total_amount AS valor_contrato,
  c.installment_amount AS valor_parcela,
  c.total_installments AS qtd_parcelas,
  c.total_with_iof AS valor_total_financiado,
  c.iof_amount AS valor_iof,
  lt.interest_rate AS taxa_juros,
  lt.cet AS taxa_cet,
  c.disbursement_date AS data_desembolso,
  date_trunc('month', c.disbursement_date)::date AS mes_desembolso,
  c.first_due_date AS data_primeiro_vencimento,
  CASE c.status
    WHEN 'disbursed' THEN 'DESEMBOLSADO'
    WHEN 'closed' THEN 'ENCERRADO'
    ELSE upper(c.status)
  END AS status_contrato,
  EXISTS (
    SELECT 1 FROM public.renegotiations r WHERE r.contract_id = c.id
  ) AS flag_renegociado,
  COALESCE(h.qtd_contratos_anteriores, 0) = 0 AS flag_novo_cliente,
  COALESCE(h.qtd_contratos_anteriores, 0) > 0
    AND NOT COALESCE(h.flag_tinha_contrato_aberto, false)
    AND NOT COALESCE(h.flag_quitou_no_mes, false) AS flag_cliente_reativo,
  COALESCE(h.qtd_contratos_anteriores, 0) > 0
    AND (
      COALESCE(h.flag_tinha_contrato_aberto, false)
      OR COALESCE(h.flag_quitou_no_mes, false)
    ) AS flag_renovado,
  e.nome_empresa,
  initcap(cl.name) AS nome_cliente,
  initcap(d.nome_consultor) AS nome_consultor,
  d.id_gestor_direto AS id_gestor_consultor,
  initcap(d.nome_gestor_direto) AS nome_gestor_consultor,
  d.nivel_hierarquia AS nivel_hierarquia_consultor,
  initcap(d.nome_diretor) AS nome_diretor_consultor,
  initcap(d.nome_gerente_nivel_1) AS nome_gerente_consultor_nivel_1,
  initcap(d.nome_gerente_nivel_2) AS nome_gerente_consultor_nivel_2
FROM public.contracts c
JOIN analytics.vw_dim_empresa e ON e.id_empresa = c.company_id
LEFT JOIN public.loan_terms lt ON lt.id = c.loan_terms_id
LEFT JOIN public.clients cl ON cl.id = c.client_id
LEFT JOIN public.quotes q ON q.id = c.quote_id
LEFT JOIN public.finance_products fp ON fp.id = q.finance_product_id
LEFT JOIN analytics.vw_dim_consultor d ON d.id_consultor = c.consultant_id
LEFT JOIN historico_cliente h ON h.contrato_id = c.id
WHERE c.disbursement_date IS NOT NULL
  AND c.status NOT IN ('failed', 'cancelled', 'not_processed');

-- Uma linha por parcela. O campo valor_contribuicao_inadimplencia implementa
-- a regra do vagão: após 30 dias de atraso, todo saldo nominal aberto do
-- contrato contribui para a inadimplência.
CREATE OR REPLACE VIEW analytics.vw_fato_parcela AS
WITH base AS (
  SELECT
    i.id,
    i.contract_id,
    i.installment_number,
    i.total_amount,
    i.due_date,
    i.payment_date,
    i.status,
    i.present_value,
    COALESCE(i.total_paid, 0) AS total_paid,
    GREATEST(COALESCE(i.pending_amount, i.total_amount - COALESCE(i.total_paid, 0)), 0)
      AS valor_pendente,
    c.contract_number,
    c.company_id,
    c.consultant_id,
    c.current_collection_agent_id,
    c.client_id,
    c.status AS status_contrato_raw
  FROM public.installments i
  JOIN public.contracts c ON c.id = i.contract_id
  JOIN analytics.vw_dim_empresa e ON e.id_empresa = c.company_id
  WHERE i.status <> 'renegotiated'
    AND c.disbursement_date IS NOT NULL
    AND c.status NOT IN ('cancelled', 'rejected')
), calculada AS (
  SELECT
    b.*,
    CASE
      WHEN b.valor_pendente > 0 AND b.due_date < CURRENT_DATE
        THEN CURRENT_DATE - b.due_date
      WHEN b.payment_date IS NOT NULL AND b.payment_date > b.due_date
        THEN b.payment_date - b.due_date
      ELSE 0
    END AS dias_atraso_corridos,
    MAX(CASE
      WHEN b.status IN ('not_paid', 'partially_paid')
       AND b.due_date < CURRENT_DATE
       AND b.total_amount - b.total_paid >= 0.01
        THEN CURRENT_DATE - b.due_date
      ELSE 0
    END) OVER (PARTITION BY b.contract_id) AS maior_atraso_contrato
  FROM base b
)
SELECT
  c.id AS id_parcela,
  c.contract_id AS id_contrato,
  c.contract_number AS numero_contrato,
  c.installment_number AS numero_parcela,
  c.total_amount AS valor_total_parcela,
  c.total_paid AS valor_total_pago,
  c.valor_pendente,
  c.present_value AS valor_presente_parcela,
  c.due_date AS data_vencimento,
  c.payment_date AS data_pagamento,
  CASE c.status
    WHEN 'paid' THEN 'PAGA'
    WHEN 'not_paid' THEN 'NÃO PAGA'
    WHEN 'partially_paid' THEN 'PARCIALMENTE PAGA'
    ELSE upper(c.status)
  END AS status_parcela,
  CASE c.status_contrato_raw
    WHEN 'disbursed' THEN 'DESEMBOLSADO'
    WHEN 'closed' THEN 'ENCERRADO'
    ELSE upper(c.status_contrato_raw)
  END AS status_contrato,
  EXISTS (
    SELECT 1 FROM public.renegotiations r WHERE r.contract_id = c.contract_id
  ) AS flag_renegociado,
  c.dias_atraso_corridos,
  CASE
    WHEN c.valor_pendente > 0 AND c.dias_atraso_corridos > 0 THEN
      CASE
        WHEN c.dias_atraso_corridos <= 5 THEN 'D1 a D5'
        WHEN c.dias_atraso_corridos <= 15 THEN 'D6 a D15'
        WHEN c.dias_atraso_corridos <= 30 THEN 'D16 a D30'
        WHEN c.dias_atraso_corridos <= 45 THEN 'D31 a D45'
        WHEN c.dias_atraso_corridos <= 60 THEN 'D46 a D60'
        WHEN c.dias_atraso_corridos <= 90 THEN 'D61 a D90'
        ELSE 'D90+'
      END
  END AS faixa_aging_dias_corridos,
  CASE
    WHEN c.status NOT IN ('not_paid', 'partially_paid') THEN 0
    WHEN c.maior_atraso_contrato > 30 THEN GREATEST(c.total_amount - c.total_paid, 0)
    WHEN c.due_date < CURRENT_DATE THEN GREATEST(c.total_amount - c.total_paid, 0)
    ELSE 0
  END AS valor_contribuicao_inadimplencia,
  c.company_id AS id_empresa,
  c.client_id AS id_cliente,
  c.consultant_id AS id_consultor,
  c.current_collection_agent_id AS id_agente_cobranca
FROM calculada c;

-- Uma linha por recebimento efetivo (BRX ou manual), sem duplicar alocações
-- manuais já representadas pelo fluxo BRX.
CREATE OR REPLACE VIEW analytics.vw_fato_recebimento AS
WITH brx AS (
  SELECT
    pa.installment_id AS id_parcela,
    timezone('America/Sao_Paulo', fr.processed_at)::date AS data_pagamento,
    pa.amount_allocated AS valor_recebido,
    'BRX'::text AS origem_recebimento
  FROM public.payment_allocations pa
  JOIN public.facility_repays fr ON fr.id = pa.facility_repay_id
  WHERE fr.status = 'completed'
    AND fr.processed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.manual_payment_allocations mpa
      JOIN public.manual_payments mp ON mp.id = mpa.manual_payment_id
      WHERE mpa.installment_id = pa.installment_id
        AND mpa.amount_allocated = pa.amount_allocated
        AND (mp.status IS NULL OR mp.status <> 'rejected')
    )
), manual AS (
  SELECT
    mpa.installment_id AS id_parcela,
    timezone('America/Sao_Paulo', mp.payment_date)::date AS data_pagamento,
    mpa.amount_allocated AS valor_recebido,
    'MANUAL'::text AS origem_recebimento
  FROM public.manual_payment_allocations mpa
  JOIN public.manual_payments mp ON mp.id = mpa.manual_payment_id
  WHERE mp.status IS NULL OR mp.status <> 'rejected'
), recebimentos AS (
  SELECT * FROM manual
  UNION ALL
  SELECT * FROM brx
)
SELECT
  r.id_parcela,
  i.contract_id AS id_contrato,
  c.company_id AS id_empresa,
  c.client_id AS id_cliente,
  c.consultant_id AS id_consultor,
  c.current_collection_agent_id AS id_agente_cobranca,
  r.data_pagamento,
  r.valor_recebido,
  r.origem_recebimento,
  i.installment_number AS numero_parcela,
  i.due_date AS data_vencimento_parcela,
  i.total_amount AS valor_total_parcela,
  CASE
    WHEN date_trunc('month', r.data_pagamento) = date_trunc('month', i.due_date)
      THEN 'PAGO_EM_DIA'
    WHEN r.data_pagamento < date_trunc('month', i.due_date)::date
      THEN 'PAGO_ANTECIPADO'
    WHEN r.data_pagamento > i.due_date THEN 'PAGO_COM_ATRASO'
    ELSE 'PAGO_EM_DIA'
  END AS classificacao_pagamento
FROM recebimentos r
JOIN public.installments i ON i.id = r.id_parcela
JOIN public.contracts c ON c.id = i.contract_id
JOIN analytics.vw_dim_empresa e ON e.id_empresa = c.company_id
WHERE c.status NOT IN ('cancelled', 'rejected');

COMMIT;
