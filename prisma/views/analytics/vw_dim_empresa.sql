SELECT
  c.id AS id_empresa,
  c.name AS nome_empresa,
  c.cnpj,
  c.uses_brx_integration AS flag_utiliza_integracao_brx,
  c.uses_celcoin_integration AS flag_utiliza_integracao_celcoin,
  c.charges_iof AS flag_cobra_iof,
  c.is_active AS flag_ativo
FROM
  companies c
WHERE
  (
    (c.name) :: text <> ALL (
      (
        ARRAY ['Trigo Dourado'::character varying, 'Castro'::character varying]
      ) :: text []
    )
  );