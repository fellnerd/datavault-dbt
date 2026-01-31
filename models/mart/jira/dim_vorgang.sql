{{
  config(
    materialized='view'
  )
}}

{# Final model for dim_vorgang - Add custom transformations here #}

SELECT *
FROM {{ ref('_base_dim_vorgang') }}

{# Add your custom filters, transformations, or business logic below #}