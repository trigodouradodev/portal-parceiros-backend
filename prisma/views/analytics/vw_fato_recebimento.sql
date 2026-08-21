WITH brx AS (
  SELECT
    pa.installment_id AS id_parcela,
    (
      timezone('America/Sao_Paulo' :: text, fr.processed_at)
    ) :: date AS data_pagamento,
    pa.amount_allocated AS valor_recebido,
    'BRX' :: text AS origem_recebimento
  FROM
    (
      payment_allocations pa
      JOIN facility_repays fr ON ((fr.id = pa.facility_repay_id))
    )
  WHERE
    (
      (fr.status = 'completed' :: text)
      AND (fr.processed_at IS NOT NULL)
      AND (
        NOT (
          EXISTS (
            SELECT
              1
            FROM
              (
                manual_payment_allocations mpa
                JOIN manual_payments mp ON ((mp.id = mpa.manual_payment_id))
              )
            WHERE
              (
                (mpa.installment_id = pa.installment_id)
                AND (mpa.amount_allocated = pa.amount_allocated)
                AND (
                  (mp.status IS NULL)
                  OR (mp.status <> 'rejected' :: text)
                )
              )
          )
        )
      )
    )
),
manual AS (
  SELECT
    mpa.installment_id AS id_parcela,
    (
      timezone('America/Sao_Paulo' :: text, mp.payment_date)
    ) :: date AS data_pagamento,
    mpa.amount_allocated AS valor_recebido,
    'MANUAL' :: text AS origem_recebimento
  FROM
    (
      manual_payment_allocations mpa
      JOIN manual_payments mp ON ((mp.id = mpa.manual_payment_id))
    )
  WHERE
    (
      (mp.status IS NULL)
      OR (mp.status <> 'rejected' :: text)
    )
),
recebimentos AS (
  SELECT
    manual.id_parcela,
    manual.data_pagamento,
    manual.valor_recebido,
    manual.origem_recebimento
  FROM
    manual
  UNION
  ALL
  SELECT
    brx.id_parcela,
    brx.data_pagamento,
    brx.valor_recebido,
    brx.origem_recebimento
  FROM
    brx
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
    WHEN (
      date_trunc(
        'month' :: text,
        (r.data_pagamento) :: timestamp WITH time zone
      ) = date_trunc(
        'month' :: text,
        (i.due_date) :: timestamp WITH time zone
      )
    ) THEN 'PAGO_EM_DIA' :: text
    WHEN (
      r.data_pagamento < (
        date_trunc(
          'month' :: text,
          (i.due_date) :: timestamp WITH time zone
        )
      ) :: date
    ) THEN 'PAGO_ANTECIPADO' :: text
    WHEN (r.data_pagamento > i.due_date) THEN 'PAGO_COM_ATRASO' :: text
    ELSE 'PAGO_EM_DIA' :: text
  END AS classificacao_pagamento
FROM
  (
    (
      (
        recebimentos r
        JOIN installments i ON ((i.id = r.id_parcela))
      )
      JOIN contracts c ON ((c.id = i.contract_id))
    )
    JOIN analytics.vw_dim_empresa e ON ((e.id_empresa = c.company_id))
  )
WHERE
  (
    (c.status) :: text <> ALL (
      ARRAY [('cancelled'::character varying)::text, ('rejected'::character varying)::text]
    )
  );