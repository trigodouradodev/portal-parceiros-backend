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
    COALESCE(i.total_paid, (0) :: numeric) AS total_paid,
    GREATEST(
      COALESCE(
        i.pending_amount,
        (
          i.total_amount - COALESCE(i.total_paid, (0) :: numeric)
        )
      ),
      (0) :: numeric
    ) AS valor_pendente,
    c_1.contract_number,
    c_1.company_id,
    c_1.consultant_id,
    c_1.current_collection_agent_id,
    c_1.client_id,
    c_1.status AS status_contrato_raw
  FROM
    (
      (
        installments i
        JOIN contracts c_1 ON ((c_1.id = i.contract_id))
      )
      JOIN analytics.vw_dim_empresa e ON ((e.id_empresa = c_1.company_id))
    )
  WHERE
    (
      ((i.status) :: text <> 'renegotiated' :: text)
      AND (c_1.disbursement_date IS NOT NULL)
      AND (
        (c_1.status) :: text <> ALL (
          ARRAY [('cancelled'::character varying)::text, ('rejected'::character varying)::text]
        )
      )
    )
),
calculada AS (
  SELECT
    b.id,
    b.contract_id,
    b.installment_number,
    b.total_amount,
    b.due_date,
    b.payment_date,
    b.status,
    b.present_value,
    b.total_paid,
    b.valor_pendente,
    b.contract_number,
    b.company_id,
    b.consultant_id,
    b.current_collection_agent_id,
    b.client_id,
    b.status_contrato_raw,
    CASE
      WHEN (
        (b.valor_pendente > (0) :: numeric)
        AND (b.due_date < CURRENT_DATE)
      ) THEN (CURRENT_DATE - b.due_date)
      WHEN (
        (b.payment_date IS NOT NULL)
        AND (b.payment_date > b.due_date)
      ) THEN (b.payment_date - b.due_date)
      ELSE 0
    END AS dias_atraso_corridos,
    max(
      CASE
        WHEN (
          (
            (b.status) :: text = ANY (
              ARRAY [('not_paid'::character varying)::text, ('partially_paid'::character varying)::text]
            )
          )
          AND (b.due_date < CURRENT_DATE)
          AND ((b.total_amount - b.total_paid) >= 0.01)
        ) THEN (CURRENT_DATE - b.due_date)
        ELSE 0
      END
    ) OVER (PARTITION BY b.contract_id) AS maior_atraso_contrato
  FROM
    base b
)
SELECT
  id AS id_parcela,
  contract_id AS id_contrato,
  contract_number AS numero_contrato,
  installment_number AS numero_parcela,
  total_amount AS valor_total_parcela,
  total_paid AS valor_total_pago,
  valor_pendente,
  present_value AS valor_presente_parcela,
  due_date AS data_vencimento,
  payment_date AS data_pagamento,
  CASE
    STATUS
    WHEN 'paid' :: text THEN 'PAGA' :: text
    WHEN 'not_paid' :: text THEN 'NÃO PAGA' :: text
    WHEN 'partially_paid' :: text THEN 'PARCIALMENTE PAGA' :: text
    ELSE upper((STATUS) :: text)
  END AS status_parcela,
  CASE
    status_contrato_raw
    WHEN 'disbursed' :: text THEN 'DESEMBOLSADO' :: text
    WHEN 'closed' :: text THEN 'ENCERRADO' :: text
    ELSE upper((status_contrato_raw) :: text)
  END AS status_contrato,
  (
    EXISTS (
      SELECT
        1
      FROM
        renegotiations r
      WHERE
        (r.contract_id = c.contract_id)
    )
  ) AS flag_renegociado,
  dias_atraso_corridos,
  CASE
    WHEN (
      (valor_pendente > (0) :: numeric)
      AND (dias_atraso_corridos > 0)
    ) THEN CASE
      WHEN (dias_atraso_corridos <= 5) THEN 'D1 a D5' :: text
      WHEN (dias_atraso_corridos <= 15) THEN 'D6 a D15' :: text
      WHEN (dias_atraso_corridos <= 30) THEN 'D16 a D30' :: text
      WHEN (dias_atraso_corridos <= 45) THEN 'D31 a D45' :: text
      WHEN (dias_atraso_corridos <= 60) THEN 'D46 a D60' :: text
      WHEN (dias_atraso_corridos <= 90) THEN 'D61 a D90' :: text
      ELSE 'D90+' :: text
    END
    ELSE NULL :: text
  END AS faixa_aging_dias_corridos,
  CASE
    WHEN (
      (STATUS) :: text <> ALL (
        ARRAY [('not_paid'::character varying)::text, ('partially_paid'::character varying)::text]
      )
    ) THEN (0) :: numeric
    WHEN (maior_atraso_contrato > 30) THEN GREATEST((total_amount - total_paid), (0) :: numeric)
    WHEN (due_date < CURRENT_DATE) THEN GREATEST((total_amount - total_paid), (0) :: numeric)
    ELSE (0) :: numeric
  END AS valor_contribuicao_inadimplencia,
  company_id AS id_empresa,
  client_id AS id_cliente,
  consultant_id AS id_consultor,
  current_collection_agent_id AS id_agente_cobranca
FROM
  calculada c;