WITH contratos_validos AS (
  SELECT
    c_1.id,
    c_1.client_id,
    c_1.disbursement_date AS data_desembolso
  FROM
    (
      contracts c_1
      JOIN analytics.vw_dim_empresa e_1 ON ((e_1.id_empresa = c_1.company_id))
    )
  WHERE
    (
      (c_1.disbursement_date IS NOT NULL)
      AND (
        (c_1.status) :: text <> ALL (
          (
            ARRAY ['failed'::character varying, 'cancelled'::character varying, 'not_processed'::character varying]
          ) :: text []
        )
      )
    )
),
quitacao_contrato AS (
  SELECT
    c_1.id AS contrato_id,
    max(i.payment_date) AS data_quitacao
  FROM
    (
      contracts c_1
      JOIN installments i ON ((i.contract_id = c_1.id))
    )
  WHERE
    (
      ((c_1.status) :: text = 'closed' :: text)
      AND (i.payment_date IS NOT NULL)
    )
  GROUP BY
    c_1.id
),
historico_cliente AS (
  SELECT
    atual.id AS contrato_id,
    count(anterior.id) AS qtd_contratos_anteriores,
    (
      count(anterior.id) FILTER (
        WHERE
          (
            (quitacao.data_quitacao IS NULL)
            OR (quitacao.data_quitacao > atual.data_desembolso)
          )
      ) > 0
    ) AS flag_tinha_contrato_aberto,
    COALESCE(
      bool_or(
        (
          (quitacao.data_quitacao <= atual.data_desembolso)
          AND (
            date_trunc(
              'month' :: text,
              (quitacao.data_quitacao) :: timestamp WITH time zone
            ) = date_trunc(
              'month' :: text,
              (atual.data_desembolso) :: timestamp WITH time zone
            )
          )
        )
      ),
      false
    ) AS flag_quitou_no_mes
  FROM
    (
      (
        contratos_validos atual
        LEFT JOIN contratos_validos anterior ON (
          (
            (anterior.client_id = atual.client_id)
            AND (
              (anterior.data_desembolso < atual.data_desembolso)
              OR (
                (anterior.data_desembolso = atual.data_desembolso)
                AND (anterior.id < atual.id)
              )
            )
          )
        )
      )
      LEFT JOIN quitacao_contrato quitacao ON ((quitacao.contrato_id = anterior.id))
    )
  GROUP BY
    atual.id
)
SELECT
  c.id AS id_contrato,
  c.contract_number AS numero_contrato,
  c.company_id AS id_empresa,
  c.client_id AS id_cliente,
  regexp_replace(
    (cl.tax_id) :: text,
    '\\D' :: text,
    '' :: text,
    'g' :: text
  ) AS documento,
  c.consultant_id AS id_consultor,
  c.current_collection_agent_id AS id_agente_cobranca,
  fp.id AS id_produto,
  COALESCE(
    fp.product_name,
    'SEM_PRODUTO' :: character varying
  ) AS nome_produto,
  c.total_amount AS valor_contrato,
  c.installment_amount AS valor_parcela,
  c.total_installments AS qtd_parcelas,
  c.total_with_iof AS valor_total_financiado,
  c.iof_amount AS valor_iof,
  lt.interest_rate AS taxa_juros,
  lt.cet AS taxa_cet,
  c.disbursement_date AS data_desembolso,
  (
    date_trunc(
      'month' :: text,
      (c.disbursement_date) :: timestamp WITH time zone
    )
  ) :: date AS mes_desembolso,
  c.first_due_date AS data_primeiro_vencimento,
  CASE
    c.status
    WHEN 'disbursed' :: text THEN 'DESEMBOLSADO' :: text
    WHEN 'closed' :: text THEN 'ENCERRADO' :: text
    ELSE upper((c.status) :: text)
  END AS status_contrato,
  (
    EXISTS (
      SELECT
        1
      FROM
        renegotiations r
      WHERE
        (r.contract_id = c.id)
    )
  ) AS flag_renegociado,
  (
    COALESCE(h.qtd_contratos_anteriores, (0) :: bigint) = 0
  ) AS flag_novo_cliente,
  (
    (
      COALESCE(h.qtd_contratos_anteriores, (0) :: bigint) > 0
    )
    AND (
      NOT COALESCE(h.flag_tinha_contrato_aberto, false)
    )
    AND (NOT COALESCE(h.flag_quitou_no_mes, false))
  ) AS flag_cliente_reativo,
  (
    (
      COALESCE(h.qtd_contratos_anteriores, (0) :: bigint) > 0
    )
    AND (
      COALESCE(h.flag_tinha_contrato_aberto, false)
      OR COALESCE(h.flag_quitou_no_mes, false)
    )
  ) AS flag_renovado,
  e.nome_empresa,
  initcap((cl.name) :: text) AS nome_cliente,
  initcap((d.nome_consultor) :: text) AS nome_consultor,
  d.id_gestor_direto AS id_gestor_consultor,
  initcap((d.nome_gestor_direto) :: text) AS nome_gestor_consultor,
  d.nivel_hierarquia AS nivel_hierarquia_consultor,
  initcap(d.nome_diretor) AS nome_diretor_consultor,
  initcap(d.nome_gerente_nivel_1) AS nome_gerente_consultor_nivel_1,
  initcap(d.nome_gerente_nivel_2) AS nome_gerente_consultor_nivel_2
FROM
  (
    (
      (
        (
          (
            (
              (
                contracts c
                JOIN analytics.vw_dim_empresa e ON ((e.id_empresa = c.company_id))
              )
              LEFT JOIN loan_terms lt ON ((lt.id = c.loan_terms_id))
            )
            LEFT JOIN clients cl ON ((cl.id = c.client_id))
          )
          LEFT JOIN quotes q ON ((q.id = c.quote_id))
        )
        LEFT JOIN finance_products fp ON ((fp.id = q.finance_product_id))
      )
      LEFT JOIN analytics.vw_dim_consultor d ON ((d.id_consultor = c.consultant_id))
    )
    LEFT JOIN historico_cliente h ON ((h.contrato_id = c.id))
  )
WHERE
  (
    (c.disbursement_date IS NOT NULL)
    AND (
      (c.status) :: text <> ALL (
        (
          ARRAY ['failed'::character varying, 'cancelled'::character varying, 'not_processed'::character varying]
        ) :: text []
      )
    )
  );