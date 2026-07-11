/*
 * View: fakt_buchungen_v (publizierter Wrapper)
 * Schema: mart_finance
 *
 * Publizierte Output-View auf fakt_buchungen (materialisierter Performance-Cache).
 * Konsumenten (Power BI, nachgelagerte Modelle) nutzen immer diesen View.
 *
 * Logik liegt in: models/mart/finance/fakt_buchungen.sql (materialized='table')
 *
 * Security (RLS): Kontext 'finance', Filter auf dss_sec_value_key
 * ('ewb||<kostenstelle_nr>'). Defense-in-Depth: die Basistabelle traegt
 * zusaetzlich die native Security Policy sec.policy_fakt_buchungen.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT *
FROM {{ ref('fakt_buchungen') }}
WHERE {{ rls_filter('finance') }}
