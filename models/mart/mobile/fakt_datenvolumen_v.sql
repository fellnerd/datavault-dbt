/*
 * Faktentabelle (öffentliche Schnittstelle): fakt_datenvolumen_v
 * Schema: mart_mobile
 *
 * Tages-Aggregat: Datenvolumen pro Vertrag und Tag.
 * Wrapper-View auf fakt_datenvolumen__base (incremental table).
 *
 * Grain: 1 Zeile pro (vertrag_key, verbindungs_datum_key).
 * Inkrementelle Logik und Schema: siehe fakt_datenvolumen__base.
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT * FROM {{ ref('fakt_datenvolumen__base') }}
