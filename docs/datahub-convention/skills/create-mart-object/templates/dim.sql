/*
 * Dimension: dim_<entity>
 *
 * Confluence-Schicht: DATAHUB.<concept> (Dimensionale Modellierung)
 * Schema: mart_<concept>
 * Source: hub_<entity> + sat_<entity>__<system>_current_v
 *
 * Confluence Dimension-Regeln (ITDATAH §13):
 *   - Pflicht-Spalten: {dim}_key, {dim}_id, {dim}_code, {dim}_name
 *   - NULL CODE → 'UNKNOWN', NULL NAME → 'UNKNOWN'
 *   - Ghost Record: key='-1', code='UNKNOWN', name='UNKNOWN'
 *   - Virtualisierung (View) bevorzugt
 *
 * Aufbau:
 *   <entity>_key     CHAR(64)       - Hash Key (PK, = hk_<entity>)
 *   <entity>_id      NVARCHAR(255)  - Technische/fachliche ID
 *   <entity>_code    NVARCHAR(255)  - Sprechender Business-Schlüssel
 *   <entity>_name    NVARCHAR(255)  - Bekannte Bezeichnung
 *   [weitere Attribute]
 *   dss_load_date    DATETIME2(7)   - Beladungs-Timestamp
 *   dss_record_source VARCHAR(255)  - Quellenidentifikation
 */

{{ config(materialized='view') }}

SELECT
    -- Pflicht-Spalten (Confluence §13)
    hub.hk_<entity>                                                      AS <entity>_key,
    hub.<source_id>                                                      AS <entity>_id,
    ISNULL(sat.<source_code>, CAST(hub.<source_id> AS NVARCHAR(255)))    AS <entity>_code,
    ISNULL(sat.<source_name>, ISNULL(sat.<source_code>, 'UNKNOWN'))      AS <entity>_name,
    
    -- Weitere beschreibende Attribute
    -- sat.<attr1>,
    -- sat.<attr2>,
    
    -- Metadata
    sat.dss_load_date,
    sat.dss_record_source

FROM {{ ref('hub_<entity>') }} hub
INNER JOIN {{ ref('sat_<entity>__<system>_current_v') }} sat
    ON hub.hk_<entity> = sat.hk_<entity>
    AND sat.dss_is_current = 'Y'

UNION ALL

-- Ghost Record (Confluence §13: im DataHub NEU erzeugt)
SELECT
    '-1'         AS <entity>_key,
    '-1'         AS <entity>_id,
    'UNKNOWN'    AS <entity>_code,
    'UNKNOWN'    AS <entity>_name,
    -- '-1' / 'UNKNOWN' / 1753-01-01 für weitere Attribute
    '1753-01-01' AS dss_load_date,
    'ghost_record' AS dss_record_source
