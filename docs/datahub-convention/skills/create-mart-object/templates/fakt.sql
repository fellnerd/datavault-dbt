/*
 * Faktentabelle: fakt_<content>
 *
 * Confluence-Schicht: DATAHUB.<concept> (Dimensionale Modellierung)
 * Schema: mart_<concept>
 * Source: link_<hub1>_<hub2> + sat_link_<entity>__<system>_current_v
 *
 * Confluence Fakt-Regeln (ITDATAH §13):
 *   - Bridge-Tabellen als Basis
 *   - FK zu Dimensionen immer ISNULL(hk, '-1')
 *   - Virtualisierung (View) bevorzugt
 *
 * Aufbau:
 *   <hub1>_key       CHAR(64)       - FK zu dim_<hub1>
 *   <hub2>_key       CHAR(64)       - FK zu dim_<hub2>
 *   [measures]                       - Kennzahlen
 *   dss_load_date    DATETIME2(7)   - Beladungs-Timestamp
 */

{{ config(materialized='view') }}

SELECT
    -- Dimensions-Keys (FKs)
    ISNULL(hub1.hk_<hub1>, '-1')  AS <hub1>_key,
    ISNULL(hub2.hk_<hub2>, '-1')  AS <hub2>_key,
    
    -- Measures
    sat.measure_1,
    sat.measure_2,
    
    -- Degenerate Dimensions
    -- sat.order_number,
    
    -- Metadata
    sat.dss_load_date

FROM {{ ref('link_<hub1>_<hub2>') }} lnk

LEFT JOIN {{ ref('sat_link_<entity>__<system>_current_v') }} sat
    ON lnk.hk_link_<hub1>_<hub2> = sat.hk_link_<hub1>_<hub2>
    AND sat.dss_is_current = 'Y'

LEFT JOIN {{ ref('hub_<hub1>') }} hub1
    ON lnk.hk_<hub1> = hub1.hk_<hub1>

LEFT JOIN {{ ref('hub_<hub2>') }} hub2
    ON lnk.hk_<hub2> = hub2.hk_<hub2>
