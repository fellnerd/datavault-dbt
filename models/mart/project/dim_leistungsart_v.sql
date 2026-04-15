/*
 * Dimension: dim_leistungsart
 * Schema: mart_project
 *
 * Leistungsarten (Service Types) fuer Projektsachkonten.
 * Abgeleitet aus ref_leistungsart (PROJ.NTR — 15 distinkte Leistungsarten).
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('ref_la.number') }} AS leistungsart_key,
    CAST(ref_la.number AS NVARCHAR(255))                                              AS leistungsart_id,
    ISNULL(CAST(ref_la.type AS NVARCHAR(255)), CAST(ref_la.number AS NVARCHAR(255)))  AS leistungsart_code,
    ISNULL(ref_la.description, ISNULL(CAST(ref_la.type AS NVARCHAR(255)), 'UNKNOWN')) AS leistungsart_name,
    CAST(ref_la.inaktiv AS INT)           AS inaktiv,
    ref_la.dss_load_date,
    ref_la.dss_record_source
FROM {{ ref('ref_leistungsart_v') }} ref_la
