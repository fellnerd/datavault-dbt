{{ config(
    materialized='view',
    tags=['static', 'dimension']
) }}

/*
 * =============================================================================
 * DIM_DATE_V - View-Wrapper für dim_date (Tabelle)
 * =============================================================================
 * Erweiterte View auf die materialisierte dim_date Tabelle.
 * - Stellt konsistentes View-Interface für BI-Tools sicher.
 * - Fügt dynamische is_today / is_yesterday hinzu (werden in der TABLE
 *   nicht gespeichert, da sonst stale bis zum nächsten TABLE-Rebuild).
 * =============================================================================
 */

SELECT
    d.*,
    CASE WHEN d.full_date = CAST(GETDATE() AS DATE) THEN 'Y' ELSE 'N' END AS is_today,
    CASE WHEN d.full_date = DATEADD(DAY, -1, CAST(GETDATE() AS DATE)) THEN 'Y' ELSE 'N' END AS is_yesterday
FROM {{ ref('dim_date') }} d
