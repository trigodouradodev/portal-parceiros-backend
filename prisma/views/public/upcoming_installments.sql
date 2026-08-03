SELECT
  c.id AS contract_id,
  c.contract_number,
  cl.id AS client_id,
  split_part((cl.name) :: text, ' ' :: text, 1) AS client_first_name,
  cl.name AS client_full_name,
  cl.phone AS client_phone,
  'cnpj' :: text AS pix_key_type,
  co.cnpj AS pix_key,
  i.id AS installment_id,
  i.due_date,
  i.pending_amount,
  con.id AS consultant_id,
  con.full_name AS consultant_name
FROM
  (
    (
      (
        (
          installments i
          JOIN contracts c ON ((i.contract_id = c.id))
        )
        JOIN clients cl ON ((c.client_id = cl.id))
      )
      JOIN companies co ON ((c.company_id = co.id))
    )
    LEFT JOIN trigo_users con ON ((con.id = c.consultant_id))
  )
WHERE
  (
    ((i.status) :: text <> 'renegotiated' :: text)
    AND (i.is_fully_paid = false)
    AND (i.due_date >= CURRENT_DATE)
    AND (
      i.due_date <= (CURRENT_DATE + '30 days' :: INTERVAL)
    )
  );