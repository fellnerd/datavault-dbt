{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for fact_vorgang - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Foreign Keys
  dim_vorgang.dim_vorgang_key,
  dim_project.dim_project_key,
  dim_vorgang_status.dim_vorgang_status_key,
  -- Measures
  sat.time_spent
FROM {{ ref('sat_vorgang') }} sat
INNER JOIN {{ ref('hub_vorgang') }} hub ON sat.hk_vorgang = hub.hk_vorgang
LEFT JOIN {{ ref('dim_vorgang') }} dim_vorgang ON hub.issue_id = dim_vorgang.issue_id
LEFT JOIN {{ ref('dim_project') }} dim_project ON sat.project_id = dim_project.project_id
LEFT JOIN {{ ref('dim_vorgang_status') }} dim_vorgang_status ON sat.issue_status_id = dim_vorgang_status.issue_status_id
WHERE sat.dss_is_current = 'Y'