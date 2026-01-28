{{
  config(
    materialized='table'
  )
}}

{# Final model for fact_vorgang - Add custom transformations here #}

SELECT *
FROM {{ ref('_base_fact_vorgang') }}

{# Add your custom filters, transformations, or business logic below #}