/*
 * Faktentabelle (öffentliche Schnittstelle): fakt_lastgang_monat_v
 * Schema: mart_ise
 *
 * Monatsaggregat der Lastgangwerte pro Zeitreihe.
 * Wrapper-View auf fakt_lastgang_monat (table).
 *
 * Grain: 1 Zeile pro (zeitreihe_key, jahr_monat).
 * Kennzahlen entsprechen den Innosolv-Cube-Measures Summe/Minimum/Maximum.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT * FROM {{ ref('fakt_lastgang_monat') }}
