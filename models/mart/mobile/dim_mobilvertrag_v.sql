/*
 * Dimension: dim_mobilvertrag
 * Schema: mart_mobile
 *
 * Mobilfunk-Vertraege mit Abo-Bezeichnung und Aktivierungsstatus.
 * Grain: 1 Zeile pro eindeutigem Mobilfunk-Vertrag (hub_vertrag).
 *
 * Quellen:
 *   hub_vertrag                     — Business Key vertrag_id
 *   sat_vertrag_eff__compax         — Aktivierungs-/Kündigungsdatum (neuester Record)
 *   sat_vertrag_optionen_ma__compax — Haupt-Abo Name (ist_option='0', neuester Record)
 *
 * is_active: 'Y' wenn kundigungs_datum leer/NULL (Compax liefert '' für offene Verträge)
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

WITH eff_latest AS (
    SELECT
        hk_vertrag,
        aktivierungs_datum,
        kundigungs_datum,
        dss_load_date,
        dss_record_source,
        ROW_NUMBER() OVER (
            PARTITION BY hk_vertrag
            ORDER BY dss_load_date DESC
        ) AS rn
    FROM {{ ref('sat_vertrag_eff__compax') }}
),

haupt_abo AS (
    SELECT
        hk_vertrag,
        abo_option_name,
        ROW_NUMBER() OVER (
            PARTITION BY hk_vertrag
            ORDER BY dss_load_date DESC
        ) AS rn
    FROM {{ ref('sat_vertrag_optionen_ma__compax') }}
    WHERE ist_option = '0'
)

SELECT
    {{ surrogate_key('hv.vertrag_id') }}                    AS vertrag_key,
    CAST(hv.vertrag_id AS NVARCHAR(255))                    AS vertrag_id,
    CAST(hv.vertrag_id AS NVARCHAR(255))                    AS vertrag_code,
    ISNULL(
        CAST(ha.abo_option_name AS NVARCHAR(255)),
        CAST(hv.vertrag_id AS NVARCHAR(255))
    )                                                       AS vertrag_name,
    CAST(ha.abo_option_name AS NVARCHAR(255))               AS abo_name,
    TRY_CAST(ef.aktivierungs_datum AS DATE)                 AS aktivierungs_datum,
    CASE
        WHEN ef.kundigungs_datum IS NULL OR ef.kundigungs_datum = ''
            THEN NULL
        ELSE TRY_CAST(ef.kundigungs_datum AS DATE)
    END                                                     AS kundigungs_datum,
    CASE
        WHEN ef.kundigungs_datum IS NULL OR ef.kundigungs_datum = ''
            THEN 'Y'
        ELSE 'N'
    END                                                     AS is_active,
    hv.dss_load_date,
    hv.dss_record_source
FROM {{ ref('hub_vertrag') }} hv
LEFT JOIN eff_latest ef
    ON hv.hk_vertrag = ef.hk_vertrag AND ef.rn = 1
LEFT JOIN haupt_abo ha
    ON hv.hk_vertrag = ha.hk_vertrag AND ha.rn = 1
