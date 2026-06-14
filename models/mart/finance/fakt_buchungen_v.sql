/*
 * View: fakt_buchungen_v (publizierter Wrapper)
 * Schema: mart_finance
 *
 * Publizierte Output-View auf fakt_buchungen (materialisierter Performance-Cache).
 * Konsumenten (Power BI, nachgelagerte Modelle) nutzen immer diesen View.
 *
 * Logik liegt in: models/mart/finance/fakt_buchungen.sql (materialized='table')
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT * FROM {{ ref('fakt_buchungen') }}
