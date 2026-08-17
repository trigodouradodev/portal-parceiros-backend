SELECT
  q.client_name,
  q.document AS cpf,
  q.id AS quote_id,
  q.quote_status,
  'DOCUMENTO' :: text AS document_type,
  (doc.value ->> 'filename' :: text) AS file_name,
  (doc.value ->> 'mimetype' :: text) AS mime_type,
  (doc.value ->> 's3Key' :: text) AS s3_key,
  (doc.value ->> 'createdAt' :: text) AS uploaded_at
FROM
  (
    quotes q
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN (
          jsonb_typeof(q.document_attachment) = 'array' :: text
        ) THEN q.document_attachment
        ELSE '[]' :: jsonb
      END
    ) doc(value)
  )
UNION
ALL
SELECT
  q.client_name,
  q.document AS cpf,
  q.id AS quote_id,
  q.quote_status,
  'COMPROVANTE_RESIDENCIA' :: text AS document_type,
  (doc.value ->> 'filename' :: text) AS file_name,
  (doc.value ->> 'mimetype' :: text) AS mime_type,
  (doc.value ->> 's3Key' :: text) AS s3_key,
  (doc.value ->> 'createdAt' :: text) AS uploaded_at
FROM
  (
    quotes q
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN (
          jsonb_typeof(q.proof_of_residence_attachment) = 'array' :: text
        ) THEN q.proof_of_residence_attachment
        ELSE '[]' :: jsonb
      END
    ) doc(value)
  )
UNION
ALL
SELECT
  q.client_name,
  q.document AS cpf,
  q.id AS quote_id,
  q.quote_status,
  'COMPROVANTE_RENDA' :: text AS document_type,
  (doc.value ->> 'filename' :: text) AS file_name,
  (doc.value ->> 'mimetype' :: text) AS mime_type,
  (doc.value ->> 's3Key' :: text) AS s3_key,
  (doc.value ->> 'createdAt' :: text) AS uploaded_at
FROM
  (
    quotes q
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN (
          jsonb_typeof(q.proof_of_income_attachment) = 'array' :: text
        ) THEN q.proof_of_income_attachment
        ELSE '[]' :: jsonb
      END
    ) doc(value)
  );