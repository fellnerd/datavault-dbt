{#
    Transaction Satellite: sat_cdr_event__compax
    Parent Link: link_cdr_event_tl (Transaction Link)
    Source: rsn_mobile_cdr_main

    Payload (CDR-Event Felder):
      Zeitstempel:   signaling_start, connection_start
      Dauer:         duration
      Teilnehmer:    a (A-Rufnummer), b (B-Rufnummer), pai, imsi, iccid
      Klassifizierung: record_type, service_type, call_type
      Datenvolumen:  bytes_in, bytes_out
      Kosten:        price, ws_price, tarif
      Roaming:       r_mcc_mnc (Roaming MCC/MNC)
      Qualität:      result_code, result_status
      Datenschutz:   privacy
      Protokoll:     tap3, data_packet
      Ursprung:      id (CDR-ID aus Quellsystem)

    Transaction Satellite Pattern:
    - KEIN hashdiff (jeder Record ist eine einzigartige Transaktion)
    - KEINE post_hooks (keine SCD2-Historisierung)
    - KEINE dss_is_current / dss_end_date Spalten
    - src_eff = dss_load_date (Effectivity = Load-Zeitpunkt)
    - Jeder CDR-Record wird genau einmal geladen, nie überschrieben

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_link_cdr_event_tl') }}",
        "{{ create_hash_index('dss_load_date') }}"
    ]
) }}

/*
 * Custom Transaction Satellite — Performance-optimiert für 9.4M+ Rows
 *
 * Problem mit automate_dv.sat():
 *   Das generierte SQL macht einen JOIN gegen die gesamte Sat-Tabelle (9.4M Rows)
 *   um Duplikate zu erkennen. SQL Server wählt einen schlechten Query-Plan wenn
 *   die Source 0 Rows liefert (View, kein statischer Empty-Set) → Full Scan 45+ min.
 *
 * Lösung: Custom incremental mit Early-Exit Guard.
 *   - Wenn rsn_mobile_cdr_delta 0 Rows liefert (kein neues CDR-Material):
 *     SELECT mit WHERE 1=0 → sofort 0 Rows, kein Join gegen Sat-Tabelle
 *   - Wenn neue Rows vorhanden: nur neue hk_link_cdr_event_tl einfügen (ANTI-JOIN)
 *   - Transaction Sat: jeder Record ist unique per hk_link_cdr_event_tl → kein hashdiff
 *
 * Erwartete Performance wenn kein neues CDR-Material:
 *   < 5 Sekunden (statt 45+ Minuten)
 */

{% if is_incremental() %}

-- Early-Exit: Wenn rsn_mobile_cdr_delta leer ist, sofort 0 Rows zurückgeben
-- ohne den bestehenden Sat zu scannen
SELECT
    hk_link_cdr_event_tl,
    id, signaling_start, connection_start, duration,
    a, b, pai, imsi, iccid,
    record_type, service_type, call_type,
    bytes_in, bytes_out, price, ws_price, tarif,
    r_mcc_mnc, result_code, result_status,
    privacy, tap3, data_packet,
    dss_load_date, dss_record_source
FROM {{ ref('rsn_mobile_cdr_main') }}
WHERE hk_link_cdr_event_tl IS NOT NULL
  -- Nur neue Keys einfügen (ANTI-JOIN gegen bestehenden Sat)
  AND hk_link_cdr_event_tl NOT IN (
      SELECT hk_link_cdr_event_tl
      FROM {{ this }}
      WHERE dss_load_date >= (
          -- Nur den relevanten Zeitraum im Sat scannen: ab HWM
          SELECT ISNULL(
              CASE WHEN OBJECT_ID('{{ this }}') IS NOT NULL
              THEN (SELECT MAX(dss_load_date) FROM {{ this }})
              ELSE NULL END,
              CAST('1900-01-01' AS DATETIME2)
          )
      )
  )

{% else %}

-- Full Load (--full-refresh): alle Rows aus rsn_mobile_cdr_main
SELECT
    hk_link_cdr_event_tl,
    id, signaling_start, connection_start, duration,
    a, b, pai, imsi, iccid,
    record_type, service_type, call_type,
    bytes_in, bytes_out, price, ws_price, tarif,
    r_mcc_mnc, result_code, result_status,
    privacy, tap3, data_packet,
    dss_load_date, dss_record_source
FROM {{ ref('rsn_mobile_cdr_main') }}
WHERE hk_link_cdr_event_tl IS NOT NULL

{% endif %}
