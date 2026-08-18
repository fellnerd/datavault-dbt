/*
 * Faktentabelle (öffentliche Schnittstelle): fakt_lastgang_v
 * Schema: mart_ise
 *
 * ¼-Stunden-Lastgangwerte pro Zeitreihe.
 * Wrapper-View auf fakt_lastgang (incremental table).
 *
 * Grain: 1 Zeile pro (zeitreihe_key, messzeitpunkt).
 * Zeitkonvention und inkrementelle Logik: siehe fakt_lastgang.
 *
 * Für Power BI: über datum_key auf dim_date_v joinen, über zeitreihe_key auf
 * dim_zeitreihe_v. Bei ¼-h-Granularität ist das ein grosses Modell —
 * für Übersichtsberichte fakt_lastgang_monat_v verwenden.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT * FROM {{ ref('fakt_lastgang') }}
