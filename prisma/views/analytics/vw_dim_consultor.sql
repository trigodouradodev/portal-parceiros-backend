WITH RECURSIVE consultor_universe AS (
  SELECT
    DISTINCT ON (c.user_id) c.user_id,
    tu.full_name AS name,
    tu.manager_id,
    c.company_id,
    c.is_active
  FROM
    (
      consultants c
      JOIN trigo_users tu ON ((tu.id = c.user_id))
    )
  WHERE
    (c.user_id IS NOT NULL)
  ORDER BY
    c.user_id
),
hierarquia AS (
  SELECT
    cu.user_id AS id_consultor,
    cu.name AS nome_consultor,
    cu.manager_id AS id_gestor_direto,
    cu.name AS nome_gestor_direto,
    cu.company_id AS id_empresa,
    cu.is_active AS flag_ativo,
    1 AS nivel_hierarquia,
    (cu.name) :: text AS nivel_1_nome,
    NULL :: text AS nivel_2_nome,
    NULL :: text AS nivel_3_nome,
    NULL :: text AS nivel_4_nome,
    ARRAY [cu.user_id] AS caminho_hierarquia
  FROM
    consultor_universe cu
  WHERE
    (
      (cu.manager_id IS NULL)
      OR (
        NOT (
          cu.manager_id IN (
            SELECT
              consultor_universe.user_id
            FROM
              consultor_universe
          )
        )
      )
    )
  UNION
  ALL
  SELECT
    child.user_id,
    child.name,
    child.manager_id,
    manager.name,
    child.company_id,
    child.is_active,
    (parent.nivel_hierarquia + 1),
    parent.nivel_1_nome,
    CASE
      WHEN ((parent.nivel_hierarquia + 1) = 2) THEN (child.name) :: text
      ELSE parent.nivel_2_nome
    END AS nivel_2_nome,
    CASE
      WHEN ((parent.nivel_hierarquia + 1) = 3) THEN (child.name) :: text
      ELSE parent.nivel_3_nome
    END AS nivel_3_nome,
    CASE
      WHEN ((parent.nivel_hierarquia + 1) = 4) THEN (child.name) :: text
      ELSE parent.nivel_4_nome
    END AS nivel_4_nome,
    (parent.caminho_hierarquia || child.user_id)
  FROM
    (
      (
        consultor_universe child
        JOIN hierarquia parent ON ((child.manager_id = parent.id_consultor))
      )
      LEFT JOIN consultor_universe manager ON ((manager.user_id = child.manager_id))
    )
  WHERE
    (child.user_id <> ALL (parent.caminho_hierarquia))
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
  COALESCE(
    nivel_4_nome,
    nivel_3_nome,
    nivel_2_nome,
    nivel_1_nome
  ) AS nome_supervisor,
  caminho_hierarquia
FROM
  hierarquia;