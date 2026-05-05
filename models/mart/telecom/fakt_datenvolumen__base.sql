/*
 * Faktentabelle (intern): fakt_datenvolumen__base
 * Schema: mart_telecom
 *
 * Tages-Aggregat: Datenvolumen pro Vertrag und Tag.
 * Grain: 1 Zeile pro (vertrag_key, verbindungs_datum_key).
 *
 * Retention-Strategie:
 *   - Incremental Table akkumuliert Tages-Aggregate dauerhaft (keine Purge)
 *   - Vor Aktivierung der 30-Tage-Vault-Purge einmalig --full-refresh ausführen
 *   - Nach Purge: tägliche inkrementelle Runs aggregieren nur neue Events
 *
 * Quellen:
 *   fakt_cdr_v — atomare CDR-Events (record_type='DATA')
 */

{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key=['vertrag_key', 'verbindungs_datum_key'],
    as_columnstore=false,
    tags=['fact']
) }}

SELECT
    vertrag_key,
    kunde_key,
    verbindungs_datum_key,
    COUNT(*)                                                                AS session_count,
    SUM(ISNULL(bytes_out_mb, 0))                                            AS mb_total,
    SUM(ISNULL(bytes_out_mb, 0)) / 1024.0                                  AS gb_total,
    SUM(CASE WHEN is_roaming = 0 THEN ISNULL(bytes_out_mb, 0) ELSE 0 END) AS mb_national,
    SUM(CASE WHEN is_roaming = 1 THEN ISNULL(bytes_out_mb, 0) ELSE 0 END) AS mb_roaming,
    MAX(dss_load_date)                                                      AS dss_load_date,
    MAX(dss_record_source)                                                  AS dss_record_source
FROM {{ ref('fakt_cdr_v') }}
WHERE record_type = 'DATA'
  AND verbindungs_datum_key IS NOT NULL
{% if is_incremental() %}
  -- Inkrementell: letzten 2 Tage neu aggregieren (Late-Arrival-Puffer)
  AND verbindungs_datum_key >= TRY_CAST(FORMAT(DATEADD(day, -2, GETDATE()), 'yyyyMMdd') AS INT)
{% endif %}
GROUP BY
    vertrag_key,
    kunde_key,
    verbindungs_datum_key
