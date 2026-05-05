/*
 * Dimension: dim_sim
 * Schema: mart_telecom
 *
 * SIM-Karten Stammdaten (ICCID = Business Key).
 * Grain: 1 Zeile pro eindeutiger SIM-Karte (hub_sim).
 *
 * Quellen:
 *   hub_sim (vault_telecom) — Business Key icc (ICCID)
 *
 * Hinweis: Compax liefert keine weiteren SIM-Attribute ausser der ICCID.
 *   Daher sind sim_id / sim_code / sim_name alle gleich (= ICCID).
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('hs.icc') }}                           AS sim_key,
    CAST(hs.icc AS NVARCHAR(255))                           AS sim_id,
    CAST(hs.icc AS NVARCHAR(255))                           AS sim_code,
    CAST(hs.icc AS NVARCHAR(255))                           AS sim_name,
    hs.dss_load_date,
    hs.dss_record_source
FROM {{ ref('hub_sim') }} hs
