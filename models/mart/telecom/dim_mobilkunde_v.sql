/*
 * Dimension: dim_mobilkunde
 * Schema: mart_telecom
 *
 * Mobile Kundenstammdaten aus Compax RSN.
 * Grain: 1 Zeile pro eindeutigem Kunden (hub_kunde).
 *
 * Hinweis: Compax liefert nur external_customer_id als Kunden-Attribut
 *   (= Abacus Kundennummer). Name / Adresse sind nicht im Export enthalten.
 *
 * Quellen:
 *   hub_kunde           — Business Key kunde_id
 *   sat_kunde_current_v — external_customer_id (aktueller Wert via dss_is_current='Y')
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

-- Dedup: sat_kunde_current_v kann bei gleichem dss_load_date mehrere is_current='Y'
-- Zeilen liefern → neueste pro hk_kunde nehmen
WITH sat_dedup AS (
    SELECT
        hk_kunde,
        external_customer_id,
        ROW_NUMBER() OVER (
            PARTITION BY hk_kunde
            ORDER BY dss_load_date DESC
        ) AS rn
    FROM {{ ref('sat_kunde_current_v') }}
)

SELECT
    {{ surrogate_key('hk.kunde_id') }}                      AS kunde_key,
    CAST(hk.kunde_id AS NVARCHAR(255))                      AS kunde_id,
    CAST(hk.kunde_id AS NVARCHAR(255))                      AS kunde_code,
    'UNKNOWN'                                               AS kunde_name,
    CAST(sk.external_customer_id AS NVARCHAR(255))          AS external_customer_id,
    hk.dss_load_date,
    hk.dss_record_source
FROM {{ ref('hub_kunde') }} hk
LEFT JOIN sat_dedup sk
    ON hk.hk_kunde = sk.hk_kunde AND sk.rn = 1
