{{ config(
    materialized='view',
    tags=['static', 'dimension']
) }}

/*
 * =============================================================================
 * DIM_DATE_V - View-Wrapper für dim_date (Tabelle)
 * =============================================================================
 * 1:1 View auf die materialisierte dim_date Tabelle.
 * Stellt sicher, dass BI-Tools immer eine View ansprechen (kein gemischtes
 * Tabellen-/View-Schema im mart Schema).
 * =============================================================================
 */

SELECT * FROM {{ ref('dim_date') }}
