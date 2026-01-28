{{
  config(
    materialized='table'
  )
}}

{# Final model for dim_vorgang_status - Add custom transformations here #}

SELECT *
FROM {{ ref('_base_dim_vorgang_status') }}

{# Add your custom filters, transformations, or business logic below #}