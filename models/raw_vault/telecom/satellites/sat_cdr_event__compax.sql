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
 *   um Duplikate zu erkennen — auch wenn source_data = 0 Rows ist.
 *   SQL Server wählt Hash Match Plan → scannt alle 9.4M Zeilen → 45+ Minuten.
 *
 * Warum kein Anti-Join nötig ist:
 *   rsn_mobile_cdr_main nutzt rsn_mobile_cdr_delta als Source.
 *   rsn_mobile_cdr_delta filtert: WHERE dss_load_date > MAX(sat_cdr_event.dss_load_date)
 *   → Alle Rows in rsn_mobile_cdr_main sind GARANTIERT neu (noch nicht im Sat).
 *   Transaction Sat ist append-only (kein SCD2, kein Update) → kein Dedup nötig.
 *
 * Performance-Garantie:
 *   - Kein neues CDR-Material: rsn_mobile_cdr_main = 0 Rows → INSERT 0 Rows → < 2 Sekunden
 *   - Neues CDR-Material: direkt einfügen ohne Sat-Scan → normaler Durchsatz
 *
 * Full-Refresh: rsn_mobile_cdr_delta fällt auf '1900-01-01' zurück → alle Rows
 */

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
