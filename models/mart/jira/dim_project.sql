{{
  config(
    materialized='table'
  )
}}

{# Final model for dim_project - Add custom transformations here #}

SELECT *
FROM {{ ref('_base_dim_project') }}

{# Add your custom filters, transformations, or business logic below #}