/*
 * Faktentabelle (intern): fakt_anrufe__base
 * Schema: mart_mobile
 *
 * Tages-Aggregat: Anrufe/SMS pro Vertrag, Tag und Gesprächstyp.
 * Grain: 1 Zeile pro (vertrag_key, verbindungs_datum_key, record_type, is_roaming).
 *
 * record_type: MOC (abgehend), MTC (eingehend), FORW (Weiterleitung), SMS
 *
 * Retention-Strategie: identisch mit fakt_datenvolumen__base.
 *
 * Quellen:
 *   fakt_cdr_v — atomare CDR-Events (record_type IN ('MOC','MTC','FORW','SMS'))
 */

{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key=['vertrag_key', 'verbindungs_datum_key', 'record_type', 'is_roaming'],
    as_columnstore=false,
    tags=['fact']
) }}

SELECT
    vertrag_key,
    kunde_key,
    verbindungs_datum_key,
    record_type,
    is_roaming,
    COUNT(*)                                                                AS anruf_count,
    SUM(ISNULL(duration_sec, 0))                                            AS duration_sec_total,
    SUM(ISNULL(duration_sec, 0)) / 60.0                                    AS duration_min_total,
    MAX(dss_load_date)                                                      AS dss_load_date,
    MAX(dss_record_source)                                                  AS dss_record_source
FROM {{ ref('fakt_cdr_v') }}
WHERE record_type IN ('MOC', 'MTC', 'FORW', 'SMS')
  AND verbindungs_datum_key IS NOT NULL
{% if is_incremental() %}
  -- Inkrementell: letzten 2 Tage neu aggregieren (Late-Arrival-Puffer)
  AND verbindungs_datum_key >= TRY_CAST(FORMAT(DATEADD(day, -2, GETDATE()), 'yyyyMMdd') AS INT)
{% endif %}
GROUP BY
    vertrag_key,
    kunde_key,
    verbindungs_datum_key,
    record_type,
    is_roaming
