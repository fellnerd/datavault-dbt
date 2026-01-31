{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for fact_vorgang - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Foreign Keys
  dim_vorgang.dim_vorgang_key,
  dim_projekt.dim_projekt_key,
  dim_vorgang_status.dim_vorgang_status_key,
  -- Measures
  sat.time_spent
FROM {{ ref('sat_vorgang') }} sat
INNER JOIN {{ ref('hub_vorgang') }} hub ON sat.hk_vorgang = hub.hk_vorgang
LEFT JOIN {{ ref('dim_vorgang') }} dim_vorgang ON hub.issue_id = dim_vorgang.issue_id
LEFT JOIN {{ ref('dim_projekt') }} dim_projekt ON sat.project_id = dim_projekt.project_id
LEFT JOIN {{ ref('dim_vorgang_status') }} dim_vorgang_status ON sat.issue_status_id = dim_vorgang_status.issue_status_id
WHERE sat.dss_is_current = 'Y'