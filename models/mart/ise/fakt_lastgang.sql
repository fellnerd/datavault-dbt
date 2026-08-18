/*
 * Faktentabelle (intern): fakt_lastgang
 * Schema: mart_ise
 *
 * ¼-Stunden-Lastgangwerte der i-SE-Energiezeitreihen.
 * Grain: 1 Zeile pro (zeitreihe_key, messzeitpunkt).
 *
 * Öffentliche Schnittstelle: fakt_lastgang_v (Wrapper-View)
 *
 * Quelle: sat_lastgang_tl__ise_current_v — bereits auf den aktuellsten Wert je
 *         Zeitpunkt reduziert (revidierte Messwerte liegen im Vault als
 *         zusätzliche Version).
 *
 * ── Zeitkonvention: HIER wird sie aufgelöst ───────────────────────────────
 * Die Quelle liefert das Intervall-ENDE: der Wert mit messzeitpunkt
 * 01.08. 00:00 misst das Intervall 31.07. 23:45–00:00 und gehört fachlich zum
 * 31. Juli. Wer über das Ende gruppiert, bekommt am Monatsrand falsche Summen.
 *
 * Deshalb wird intervall_start = messzeitpunkt − zeitschritt_min berechnet und
 * datum_key/zeitpunkt daraus abgeleitet. Konsumenten des Marts gruppieren
 * einfach über datum_key bzw. jahr_monat und treffen damit automatisch die
 * Innosolv-Cube-Werte — ohne die Konvention kennen zu müssen.
 *
 * ── Inkrementelle Logik ───────────────────────────────────────────────────
 * HWM auf dss_load_date (= Export-Zeitstempel im Vault): geladen wird alles,
 * was seit dem letzten Mart-Lauf im Vault dazugekommen ist. Das fängt beides
 * ein — neue Zeitpunkte UND revidierte Werte für bereits geladene Zeitpunkte
 * (deren dss_load_date steigt beim Revidieren). delete+insert auf dem
 * unique_key ersetzt die betroffenen Zeilen.
 *
 * Ein Filter auf messzeitpunkt wäre hier falsch: ein Backfill liefert alte
 * Zeitpunkte mit neuem Load Date und würde durchs Raster fallen.
 *
 * Volumen: aktuell 169k Zeilen, ~3.2 Mio bei voller Historie der Gruppe 150.
 */

{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key=['zeitreihe_key', 'messzeitpunkt'],
    as_columnstore=false,
    tags=['fact'],
    post_hook=[
        "{{ create_composite_index(['zeitreihe_key', 'datum_key']) }}",
        "{{ create_composite_index(['datum_key']) }}"
    ]
) }}

WITH quelle AS (

    SELECT
        d.zeitreihe_key,
        d.zeitschritt_min,
        m.messzeitpunkt,
        m.wert,
        m.dss_load_date,
        m.dss_record_source

    FROM {{ ref('sat_lastgang_tl__ise_current_v') }} m

    INNER JOIN {{ ref('hub_zeitreihe') }} h
        ON h.hk_zeitreihe = m.hk_zeitreihe

    INNER JOIN {{ ref('dim_zeitreihe_v') }} d
        ON d.zeitreihe_id = h.id_zeitreihe

    {%- if is_incremental() %}
    -- HWM auf dem Vault-Load-Date: neue Zeitpunkte und revidierte Werte
    WHERE m.dss_load_date > (SELECT ISNULL(MAX(dss_load_date), '1900-01-01') FROM {{ this }})
    {%- endif %}

)

SELECT
    zeitreihe_key,
    messzeitpunkt,
    -- Intervall-Beginn: der fachliche Zeitpunkt des Werts
    DATEADD(minute, -ISNULL(zeitschritt_min, 15), messzeitpunkt)          AS intervall_start,
    CAST(FORMAT(DATEADD(minute, -ISNULL(zeitschritt_min, 15), messzeitpunkt), 'yyyyMMdd') AS INT)
                                                                          AS datum_key,
    CAST(FORMAT(DATEADD(minute, -ISNULL(zeitschritt_min, 15), messzeitpunkt), 'yyyy/MM') AS CHAR(7))
                                                                          AS jahr_monat,
    DATEPART(hour,   DATEADD(minute, -ISNULL(zeitschritt_min, 15), messzeitpunkt)) AS stunde,
    DATEPART(minute, DATEADD(minute, -ISNULL(zeitschritt_min, 15), messzeitpunkt)) AS minute,
    CAST(wert AS DECIMAL(38, 12))                                         AS wert_kwh,
    zeitschritt_min,
    dss_load_date,
    dss_record_source

FROM quelle
