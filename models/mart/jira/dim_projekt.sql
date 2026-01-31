{{
  config(
    materialized='view'
  )
}}

{# Final model for dim_projekt - Add custom transformations here #}

SELECT *
FROM {{ ref('_base_dim_projekt') }}

{# Add your custom filters, transformations, or business logic below #}