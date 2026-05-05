/*
 * Faktentabelle: fakt_cdr
 * Schema: mart_telecom
 *
 * Atomarer CDR-Grain: 1 Zeile = 1 Call Detail Record (Anruf / Daten-Session / SMS).
 * Zeigt alle im Vault verfügbaren CDR-Events. Nach Aktivierung der Retention-Purge
 * (§13.8 Implementierungsplan) werden nur noch die letzten 30 Tage im Vault gehalten.
 *
 * Metriken:
 *   duration_sec   — Verbindungsdauer in Sekunden (Anrufe / Datensessions)
 *   bytes_out_mb   — Übertragenes Datenvolumen in MB (nur DATA-Events; bytes_in leer)
 *   price          — Verbrauchskosten (aus Compax)
 *   ws_price       — Wholesale-Preis
 *
 * Quellen:
 *   link_cdr_event_tl      — Transaction Link (hk_vertrag, hk_sim)
 *   sat_cdr_event__compax  — CDR-Payload (record_type, duration, bytes_out, ...)
 *   hub_vertrag            — vertrag_id für surrogate key
 *   sat_vertrag_eff__compax — latest hk_kunde per Vertrag
 *   hub_kunde              — kunde_id für surrogate key
 *   hub_sim                — icc (ICCID) für surrogate key
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

WITH latest_kunde_per_vertrag AS (
    -- Neuester bekannter Kunde pro Vertrag (auch für gekündigte Verträge)
    SELECT
        hk_vertrag,
        hk_kunde,
        ROW_NUMBER() OVER (
            PARTITION BY hk_vertrag
            ORDER BY dss_load_date DESC
        ) AS rn
    FROM {{ ref('sat_vertrag_eff__compax') }}
)

SELECT
    -- Foreign Keys (Surrogate Keys der Dimensionen)
    {{ surrogate_key('hv.vertrag_id') }}                                    AS vertrag_key,
    {{ surrogate_key('hk.kunde_id') }}                                      AS kunde_key,
    {{ surrogate_key('hs.icc') }}                                           AS sim_key,
    TRY_CAST(FORMAT(TRY_CAST(s.connection_start AS DATE), 'yyyyMMdd') AS INT) AS verbindungs_datum_key,

    -- Degenerate Dimensionen
    -- Normalisierung: Compax-interne record_types (GPR/GSM) → Business-Semantik
    CASE
        WHEN s.record_type = 'GPR'                                              THEN 'DATA'
        WHEN s.record_type = 'GSM' AND s.service_type = 'MOC'                  THEN 'MOC'
        WHEN s.record_type = 'GSM' AND s.service_type = 'MTC'                  THEN 'MTC'
        WHEN s.record_type = 'GSM' AND s.service_type = 'FORW'                 THEN 'FORW'
        WHEN s.record_type = 'GSM'
             AND s.service_type IN ('SMMO','SMMT','PSMMT','RSMMO','PSMMO')     THEN 'SMS'
        WHEN s.record_type = 'GSM'
             AND s.service_type IN ('RMOC','ROAM')                             THEN 'ROAM'
        ELSE s.record_type
    END                                                                         AS record_type,
    CAST(s.service_type AS NVARCHAR(20))                                    AS service_type,
    CAST(s.tarif AS NVARCHAR(255))                                          AS tarif,
    CAST(s.id AS NVARCHAR(255))                                             AS event_id,
    CASE
        WHEN s.r_mcc_mnc IS NOT NULL AND s.r_mcc_mnc <> ''
            THEN CAST(1 AS BIT)
        ELSE CAST(0 AS BIT)
    END                                                                     AS is_roaming,

    -- Metriken
    TRY_CAST(s.duration AS DECIMAL(18, 2))                                  AS duration_sec,
    TRY_CAST(s.bytes_out AS BIGINT) / CAST(1024.0 * 1024.0 AS DECIMAL(18, 6)) AS bytes_out_mb,
    TRY_CAST(s.price AS DECIMAL(18, 4))                                     AS price,
    TRY_CAST(s.ws_price AS DECIMAL(18, 4))                                  AS ws_price,

    -- Zeitstempel (für Drill-Down)
    TRY_CAST(s.connection_start AS DATETIME2)                               AS connection_start,

    -- Traceability
    tl.hk_link_cdr_event_tl,
    tl.dss_load_date,
    tl.dss_record_source

FROM {{ ref('link_cdr_event_tl') }} tl
INNER JOIN {{ ref('sat_cdr_event__compax') }} s
    ON tl.hk_link_cdr_event_tl = s.hk_link_cdr_event_tl
INNER JOIN {{ ref('hub_vertrag') }} hv
    ON tl.hk_vertrag = hv.hk_vertrag
LEFT JOIN latest_kunde_per_vertrag lk
    ON hv.hk_vertrag = lk.hk_vertrag AND lk.rn = 1
LEFT JOIN {{ ref('hub_kunde') }} hk
    ON lk.hk_kunde = hk.hk_kunde
INNER JOIN {{ ref('hub_sim') }} hs
    ON tl.hk_sim = hs.hk_sim
