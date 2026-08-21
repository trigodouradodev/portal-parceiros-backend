SELECT
  id AS id_empresa,
  name AS nome_empresa,
  cnpj,
  uses_brx_integration AS flag_utiliza_integracao_brx,
  uses_celcoin_integration AS flag_utiliza_integracao_celcoin,
  charges_iof AS flag_cobra_iof,
  is_active AS flag_ativo
FROM
  companies c
WHERE
  (
    (name) :: text <> ALL (
      ARRAY [('Trigo Dourado'::character varying)::text, ('Castro'::character varying)::text]
    )
  );