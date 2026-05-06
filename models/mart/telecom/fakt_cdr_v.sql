/*
 * Faktentabelle (öffentliche Schnittstelle): fakt_cdr_v
 * Schema: mart_telecom
 *
 * Atomarer CDR-Grain: 1 Zeile = 1 Call Detail Record (Anruf / Daten-Session / SMS).
 * Wrapper-View auf fakt_cdr__base (incremental table).
 *
 * Grain: 1 Zeile pro CDR-Event (unique: hk_link_cdr_event_tl).
 * Performance-Indexes und Logik: siehe fakt_cdr__base.
 * record_type: DATA, MOC, MTC, FORW, SMS.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT * FROM {{ ref('fakt_cdr__base') }}
