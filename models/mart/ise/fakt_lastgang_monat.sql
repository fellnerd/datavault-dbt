/*
 * Faktentabelle (intern): fakt_lastgang_monat
 * Schema: mart_ise
 *
 * Monatsaggregat der ¼-Stunden-Lastgangwerte.
 * Grain: 1 Zeile pro (zeitreihe_key, jahr_monat).
 *
 * Öffentliche Schnittstelle: fakt_lastgang_monat_v (Wrapper-View)
 *
 * Zweck:
 *   1. Power BI: Übersichtsberichte ohne ¼-h-Modell (Faktor ~2'900 kleiner)
 *   2. Regressionstest gegen den Innosolv-Cube: summe_kwh/min_kwh/max_kwh
 *      entsprechen 1:1 den Measures Summe/Minimum/Maximum aus
 *      EWBPROD_dwh.DataMart_EVU.ZeitreihenData
 *
 * Die Kennzahlen sind absichtlich genau die des Cubes gewählt. Verifiziert für
 * Juli 2026 (Serie 148746: 4'612'940.997043 / 1039.052579 / 2565.812433 —
 * stellengenau identisch), Details in
 * docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md §12.5/§12.12.
 *
 * Vollaufbau statt inkrementell: bei 41 Serien × ~30 Monaten sind das ~1'200
 * Zeilen — eine Neuberechnung ist billiger als jede Delta-Logik, und
 * nachträglich revidierte Werte wirken dadurch garantiert auf das Monatstotal
 * durch (ein Monat bleibt so lange offen, wie i-SE Korrekturen nachliefert).
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['fact'],
    post_hook=["{{ create_composite_index(['zeitreihe_key', 'jahr_monat']) }}"]
) }}

SELECT
    zeitreihe_key,
    jahr_monat,
    CAST(LEFT(jahr_monat, 4) AS INT)                       AS jahr,
    CAST(RIGHT(jahr_monat, 2) AS INT)                      AS monat,
    MIN(datum_key)                                         AS datum_key_von,
    MAX(datum_key)                                         AS datum_key_bis,
    COUNT(*)                                               AS anzahl_werte,
    SUM(wert_kwh)                                          AS summe_kwh,
    MIN(wert_kwh)                                          AS min_kwh,
    MAX(wert_kwh)                                          AS max_kwh,
    AVG(wert_kwh)                                          AS mittel_kwh,
    MAX(dss_load_date)                                     AS dss_load_date,
    MAX(dss_record_source)                                 AS dss_record_source

FROM {{ ref('fakt_lastgang_v') }}
GROUP BY zeitreihe_key, jahr_monat
