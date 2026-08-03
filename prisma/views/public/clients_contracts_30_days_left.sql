WITH last_installment_dates AS (
  SELECT
    i.contract_id,
    max(i.due_date) AS last_due_date
  FROM
    installments i
  GROUP BY
    i.contract_id
)
SELECT
  split_part((cl.name) :: text, ' ' :: text, 1) AS client_first_name,
  cl.name AS client_full_name,
  cl.phone AS client_phone,
  c.contract_number,
  c.total_amount AS valor_emprestimo,
  lid.last_due_date AS contract_end_date,
  con.full_name AS consultant_name
FROM
  (
    (
      (
        (
          contracts c
          JOIN clients cl ON ((c.client_id = cl.id))
        )
        JOIN companies co ON ((c.company_id = co.id))
      )
      LEFT JOIN trigo_users con ON ((con.id = c.consultant_id))
    )
    JOIN last_installment_dates lid ON ((lid.contract_id = c.id))
  )
WHERE
  (
    (lid.last_due_date >= CURRENT_DATE)
    AND (
      lid.last_due_date <= (CURRENT_DATE + '30 days' :: INTERVAL)
    )
    AND (
      NOT (
        EXISTS (
          SELECT
            1
          FROM
            installments i2
          WHERE
            (
              (i2.contract_id = c.id)
              AND ((i2.status) :: text = 'not_paid' :: text)
              AND (i2.due_date < CURRENT_DATE)
            )
        )
      )
    )
  );