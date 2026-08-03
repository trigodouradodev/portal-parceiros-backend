SELECT
  i.id,
  i.contract_id,
  i.installment_number,
  i.total_amount,
  i.present_value,
  i.due_date,
  i.payment_date,
  i.status,
  qr.qr_code_string,
  qr.qr_code_base64,
  qr.amount AS qr_code_amount,
  r.renegotiated_amount,
  r.renegotiation_date AS renegotiated_at,
  r.brx_schedule_request_id AS brx_repayment_schedule_uuid
FROM
  (
    (
      installments i
      LEFT JOIN installment_qr_codes qr ON ((qr.id = i.active_qr_code_id))
    )
    LEFT JOIN renegotiations r ON ((r.id = i.renegotiation_id))
  )
WHERE
  ((i.status) :: text <> 'paid' :: text);